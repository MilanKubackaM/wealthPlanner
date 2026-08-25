import { expect, test, type Page } from '@playwright/test';

/** Nothing may reach the console. A hydration mismatch is a silent bug that shows up here. */
function failOnConsoleErrors(page: Page, sink: string[]) {
  page.on('pageerror', (error) => sink.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') sink.push(`console: ${message.text()}`);
  });
}

/** Eight steps now, and every one of them offers a way straight to the plan. */
/**
 * Walks the wizard to the plan by ANSWERING it, because there is no longer any other way out.
 *
 * "Skip the rest" and "estimate it for me" were both removed: they produced a full analysis of
 * a household nobody had described. So the tests do what a user now has to do — fill whatever
 * the step marks required, choose whatever choice has no default, and press Continue.
 *
 * The VALUES matter. Filling every box with the same round number produces a household whose
 * income equals its grocery bill, and half the suite is about what the model finds in a
 * plausible one — so these mirror `czDefaults`, and any field the map does not name falls back
 * to a harmless amount.
 */
const WIZARD_ANSWERS: Record<string, string> = {
  'm-balance': '4510000',
  'm-rate': '4.5',
  'm-payment': '24200',
  'rent-amount': '18000',
  'exp-utilities': '6500',
  'exp-insurance': '1200',
  'exp-groceries': '14000',
  'exp-other': '8000',
};

/** Income and birth-year ids carry the person's generated id, so they match by prefix. */
function answerFor(id: string): string {
  if (id.startsWith('income-')) return '39000';
  /* A year, not an amount: the field clamps to a valid range, so 1000 would silently become
     the earliest allowed year and every horizon assertion downstream would drift. */
  if (id.startsWith('birth-')) return '1990';
  return WIZARD_ANSWERS[id] ?? '1000';
}

/**
 * Generic on purpose. It reads the step for `[data-blank]` inputs and `.f-badge-required`
 * choices rather than hard-coding which steps have them, so adding a required field to the
 * wizard does not silently strand a dozen tests on step four.
 */
async function fillWizard(
  page: Page,
  locale: 'cs' | 'sk' = 'cs',
  shape: 'single' | 'couple' = 'couple',
) {
  const next = locale === 'sk' ? 'Pokračovať' : 'Pokračovat';

  /* Nothing to do if the plan is already on screen — finishing the wizard saves, so a reload
     lands on the plan rather than back at step one. */
  if ((await page.locator('.wizard').count()) === 0) return;

  /*
   * The shape is chosen EXPLICITLY rather than by the generic "take the first option" rule.
   *
   * Taking the first option picks a single adult, and the amounts below are a couple's — which
   * reproduced, inside the test helper, the very insolvency bug this suite once existed to
   * catch: one income of 39 000 carrying a couple's mortgage payment and a couple's groceries.
   * Every plan assertion downstream then describes a household nobody meant to build.
   */
  await page.getByRole('button', { name: next }).click();
  const shapeLabel =
    locale === 'sk'
      ? shape === 'single'
        ? /Jeden dospelý/
        : /Dvaja dospelí/
      : shape === 'single'
        ? /Jeden dospělý/
        : /Dva dospělí/;
  await page.getByRole('radio', { name: shapeLabel }).click();
  await runRemainingSteps(page, locale);
}

/** The generic part: answer whatever this step requires, press on, repeat until the plan. */
async function runRemainingSteps(page: Page, locale: 'cs' | 'sk' = 'cs') {
  const next = locale === 'sk' ? 'Pokračovať' : 'Pokračovat';
  const finish = locale === 'sk' ? 'Zobraziť plán' : 'Zobrazit plán';

  for (let guard = 0; guard < 12; guard++) {
    const done = page.getByRole('button', { name: finish });
    const cont = page.getByRole('button', { name: next });
    const button = (await done.count()) > 0 ? done : cont;
    if ((await button.count()) === 0) return;

    /* Any choice still waiting for an answer: take the first option. */
    while ((await page.locator('.f-badge-required').count()) > 0) {
      const radios = page.locator('[role="radiogroup"] [role="radio"]');
      const blanks = page.locator('.f-control[data-blank="true"] input');
      if ((await blanks.count()) > 0) break;
      if ((await radios.count()) === 0) break;
      await radios.first().click();
    }

    const blanks = page.locator('.f-control[data-blank="true"] input');
    for (let i = (await blanks.count()) - 1; i >= 0; i--) {
      const field = blanks.nth(i);
      await field.fill(answerFor((await field.getAttribute('id')) ?? ''));
    }

    await expect(button).toBeEnabled();
    await button.click();
    if ((await done.count()) > 0 && (await page.locator('.wizard').count()) === 0) return;
    if ((await page.locator('.wizard').count()) === 0) return;
  }
}

/**
 * Waits for the autosave to land. There is no Save button: every change is written ~700ms
 * after the typing stops, and this is the confirmation the user sees.
 */
async function waitForAutosave(page: Page, locale: 'cs' | 'sk' = 'cs') {
  const line = page.locator('.saved-line');
  /*
   * Wait for the pending state and then for its absence. Asserting only "saved" is not enough:
   * the wizard itself saves on hand-over, so that text is already on screen before the edit and
   * the assertion would pass without the edit ever having been written.
   */
  await expect(line).toHaveAttribute('data-saving', 'true', { timeout: 5_000 });
  await expect(line).not.toHaveAttribute('data-saving', 'true', { timeout: 10_000 });
  await expect(line).toContainText(locale === 'sk' ? /Automaticky uložené v/ : /Automaticky uloženo v/);
}

/**
 * Walks the two structural questions the wizard opens with: the country (pre-selected from the
 * locale, but a real choice) and the household shape (no pre-selection at all). Leaves the
 * wizard on the income step, whose fields are EMPTY and whose Continue is disabled — use
 * `advance` from there rather than clicking Continue.
 */
async function startWizard(page: Page, shape: 'single' | 'couple' = 'couple') {
  await page.getByRole('button', { name: 'Pokračovat' }).click();
  await page.getByRole('radio', { name: shape === 'single' ? /Jeden dospělý/ : /Dva dospělí/ }).click();
  /* The birth years are required as well, so the step will not advance without them. */
  const years = page.getByLabel(/Rok narození/);
  for (let i = (await years.count()) - 1; i >= 0; i--) await years.nth(i).fill('1990');
  await page.getByRole('button', { name: 'Pokračovat' }).click();
}

/**
 * Opens one collapsible section of the plan. Addressed by id, not by name: the section rail
 * renders a chip with the same accessible name as the header it jumps to, so a name lookup is
 * ambiguous by design.
 */
async function openSection(page: Page, id: string) {
  const header = page.locator(`#${id}-btn`);
  await header.waitFor();
  if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
}

/**
 * Advance exactly one step, answering whatever it requires first.
 *
 * Continue is disabled while a required field on the step is unanswered, and there is no
 * "estimate it for me" button any more — so a test that walks the flow has to answer, same as
 * a user.
 */
async function advance(page: Page, locale: 'cs' | 'sk' = 'cs') {
  const next = page.getByRole('button', { name: locale === 'sk' ? 'Pokračovať' : 'Pokračovat' });
  while ((await page.locator('.f-badge-required').count()) > 0) {
    const blanks = page.locator('.f-control[data-blank="true"] input');
    if ((await blanks.count()) > 0) {
      for (let i = (await blanks.count()) - 1; i >= 0; i--) {
        const field = blanks.nth(i);
        await field.fill(answerFor((await field.getAttribute('id')) ?? ''));
      }
      continue;
    }
    const radios = page.locator('[role="radiogroup"] [role="radio"]');
    if ((await radios.count()) === 0) break;
    await radios.first().click();
  }
  await expect(next).toBeEnabled();
  await next.click();
}

/** Opens a group inside the "Čísla plánu" section (envelopes, personal investing). */
async function openGroup(page: Page, name: RegExp) {
  const header = page.getByRole('button', { name, expanded: false });
  if (await header.isVisible().catch(() => false)) await header.click();
}

test.describe('landing', () => {
  test('shows a populated projection and names the trough month', async ({ page }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs');
    /*
     * The h1 is a rotating headline, so its textContent holds every slogan at once. This must
     * stay `toContainText` — `toHaveText` would fail on the concatenation, not on a bug.
     */
    await expect(page.getByRole('heading', { level: 1 })).toContainText('dítě');

    /* The chart must be real, server-rendered content — not a placeholder. */
    const chart = page.getByRole('img', { name: /Hotovostní rezerva/ });
    await expect(chart).toBeVisible();

    /* The headline sentence has to contain a month and an amount, not a vague warning. */
    const headline = page.locator('p', { hasText: /Rezerva/ }).first();
    await expect(headline).toContainText(/20\d\d/);
    await expect(headline).toContainText(/Kč/);

    /*
     * The chart is nobody's real data, so it has to say so. An unlabelled projection is a worse
     * first impression than none: the visitor cannot tell whether it is theirs, a sample, or
     * decoration.
     */
    await expect(page.locator('.example-badge')).toContainText(/Příklad/);
    await expect(page.locator('.example-title')).toContainText('Jana');
    /* And the household's figures come from the scenario the chart is drawn from — as bullets,
       one figure per line, because five of them in a paragraph is a paragraph nobody reads. */
    await expect(page.locator('.example-facts > li')).toHaveCount(5);
    await expect(page.locator('.example-facts')).toContainText(/4\s?510\s?000/);

    /* The verdict opens red, with an exclamation mark and the shortfall picked out. */
    await expect(page.locator('.verdict')).toHaveAttribute('data-state', 'alarm');
    await expect(page.locator('.verdict-mark')).toHaveText('!');
    await expect(page.locator('.verdict-amount')).toBeVisible();
    /* The footer is the button and nothing else — the paragraph that used to interpret the
       example restated what the bullets and the verdict had already said. */
    await expect(page.locator('.example-foot > p')).toHaveCount(0);
    await expect(page.locator('.example-foot').getByRole('link')).toBeVisible();

    /*
     * The bar carries no primary button any more; /plan is the one accented destination, so
     * the page has exactly one thing saying "start here" instead of two.
     */
    await expect(page.locator('.nav-cta')).toHaveCount(0);
    /* And the hero offers exactly one action — /metodika is a nav destination, not a rival
       button competing for the same click. */
    await expect(page.locator('.hero-actions').getByRole('link')).toHaveCount(1);
    await expect(page.locator('.hero-actions').getByRole('link')).toHaveText('Vytvořit přehled');
    const planLink = page.locator('.nav-link[data-primary]');
    await expect(planLink).toHaveCount(1);
    await expect(planLink).toHaveText('Můj plán');

    /*
     * Three marks, three words each, and NO explanatory paragraphs. The page is deliberately
     * this bare: everything cut from it is still on /metodika, and a stranger deciding whether
     * to spend a minute here reads a headline and looks at a chart, not six paragraphs.
     */
    await expect(page.locator('.mark')).toHaveCount(3);
    await expect(page.locator('.mark p')).toHaveCount(0);
    for (const label of await page.locator('.mark-label').allTextContents()) {
      expect(label.trim().split(/\s+/).length, label).toBeLessThanOrEqual(4);
    }
    await expect(page.locator('.mark-icon').first()).toBeVisible();

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the Slovak landing page proves the same claim, in euro', async ({ page }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/sk');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('dieťa');

    /*
     * The regression this exists for: the Slovak demo used to stay solvent, so the hero fell
     * back to "the plan holds" and the Slovak page could not demonstrate the product at all.
     */
    const headline = page.locator('p', { hasText: /Rezerva/ }).first();
    await expect(headline).toContainText(/20\d\d/);
    await expect(headline).toContainText('€');
    await expect(page.getByText('Kč')).toHaveCount(0);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('offers every verified way out, not just the first one', async ({ page }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs');

    /*
     * The engine finds three proven ways out of the demo's deficit. Showing one made the product
     * look like it has a single opinion, when a list of alternatives IS the claim it makes.
     */
    await expect(page.locator('.suggest-item')).toHaveCount(3);
    await expect(page.locator('.suggest-title')).toContainText(/jednu z těchto 3 úprav/);

    /* Each option proves itself separately, and only one proof is open at a time. */
    await page.locator('.suggest-item').nth(1).getByRole('button', { name: /přepočet/ }).click();
    await expect(page.locator('.suggest-proof')).toHaveCount(1);
    await expect(page.getByText('Po změně')).toBeVisible();

    await page.locator('.suggest-item').nth(2).getByRole('button', { name: /přepočet/ }).click();
    await expect(page.locator('.suggest-proof')).toHaveCount(1);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('an applied suggestion redraws the chart and stays marked as applied', async ({ page }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs');
    const chart = page.locator('svg[role="img"]').first();
    const before = await chart.getAttribute('aria-label');
    /* The example opens in trouble — that is the whole point of it. */
    expect(before).toMatch(/-|−/);

    await page.locator('.suggest-item').nth(1).getByRole('button', { name: 'Použít' }).click();

    /* The consequence is the picture, so the picture has to change. */
    await expect.poll(() => chart.getAttribute('aria-label')).not.toBe(before);
    /*
     * Red to green, which is the point of the button: the exclamation mark becomes a tick and
     * the sentence reports what was solved rather than the next thing that is wrong.
     */
    await expect(page.locator('.verdict')).not.toHaveAttribute('data-state', 'alarm');
    await expect(page.locator('.verdict-mark')).toHaveText('\u2713');
    await expect(page.locator('.verdict-line')).toContainText(/pod nulu (už )?neklesne/);
    /* And the milder finding that remains is still named, one size down. */
    await expect(page.locator('.verdict-rest')).toBeVisible();

    /* Exactly one option is applied, it says so, and the other two still offer themselves. */
    await expect(page.locator('.suggest-item[data-applied="true"]')).toHaveCount(1);
    await expect(page.locator('.suggest-badge')).toContainText('Použito');
    await expect(page.getByRole('button', { name: 'Použít' })).toHaveCount(2);

    /* Applying another replaces it: each proof was computed against the untouched household, so
       two stacked would be two proofs about a situation that no longer exists. */
    await page.locator('.suggest-item').nth(2).getByRole('button', { name: 'Použít' }).click();
    await expect(page.locator('.suggest-item[data-applied="true"]')).toHaveCount(1);

    /* And it can be undone, back to the example as authored. */
    await page.getByRole('button', { name: 'Vrátit zpět' }).click();
    await expect.poll(() => chart.getAttribute('aria-label')).toBe(before);
    await expect(page.locator('.suggest-item[data-applied="true"]')).toHaveCount(0);
    await expect(page.locator('.verdict')).toHaveAttribute('data-state', 'alarm');

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('offers the chart as a table for screen readers and sceptics', async ({ page }) => {
    await page.goto('/cs');
    await page.getByRole('button', { name: 'Zobrazit jako tabulku' }).first().click();
    await expect(page.getByRole('columnheader', { name: 'Rezerva' })).toBeVisible();
  });

  test('a chosen theme survives switching language', async ({ page }) => {
    /*
     * Switching locale re-renders the root layout, and React reconciles <html> back to its
     * server-rendered attributes — which wiped `data-theme` and dropped anyone on a dark OS who
     * had chosen light straight back into dark. The inline boot script cannot catch it: it only
     * runs on a full document load.
     */
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs/metodika');
    await page.getByRole('button', { name: /Přepnout/ }).click();
    const chosen = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(chosen === 'light' || chosen === 'dark').toBe(true);

    await page.getByRole('link', { name: 'SK', exact: true }).click();
    await expect(page).toHaveURL(/\/sk\/metodika/);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe(chosen);

    /* And a hard reload keeps it too — that is the boot script's job. */
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(chosen);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the navigation says where you are without relying on colour', async ({ page }) => {
    await page.goto('/cs/metodika');
    await expect(page.getByRole('link', { name: 'Metodika' })).toHaveAttribute('aria-current', 'page');

    /* And switching language keeps the page you were reading. */
    await page.getByRole('link', { name: 'SK', exact: true }).click();
    await expect(page).toHaveURL(/\/sk\/metodika/);
  });
});

test.describe('the wizard', () => {
  test('asks one thing at a time and shows no chart', async ({ page }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs/plan');
    /* The country comes first, and it is a question rather than an inference from the language. */
    await expect(page.getByRole('heading', { name: /V které zemi/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Česko/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Pokračovat' }).click();

    await expect(page.getByRole('heading', { name: /Plánujete za sebe/ })).toBeVisible();

    /*
     * Deliberate: the chart is not in the stepper. On a phone it sat below the buttons, so it
     * was off-screen on every step, and it split attention on the one screen whose whole design
     * is one question at a time.
     */
    await expect(page.locator('svg[role="img"]')).toHaveCount(0);

    /*
     * And the step is now ONLY the question. The running consequence ribbon that used to sit
     * here is gone, along with every explanatory hint: no verdict can be reached without the
     * user's own figures any more, because the required fields are empty and Continue is
     * disabled — which is a stronger guarantee than a caption saying "these are averages".
     */
    await expect(page.locator('.ribbon')).toHaveCount(0);
    await expect(page.getByText('Zatím to vypadá takto')).toHaveCount(0);
    await expect(page.locator('.f-hint')).toHaveCount(0);

    /* The shape restructures every screen after it, so unlike the country it gets no default:
       nothing is pre-selected, it is marked required, and the wizard will not advance. */
    await expect(page.getByRole('button', { name: 'Pokračovat' })).toBeDisabled();
    await expect(page.locator('.f-badge-required')).toHaveText('povinné');

    /*
     * And nothing about a PERSON is asked before the user has said a person exists. The
     * scenario always carries at least one, so without the gate this screen asked for the
     * birth year of an adult nobody had confirmed — and offered a second one the instant the
     * shape was answered.
     */
    await expect(page.getByLabel(/Rok narození/)).toHaveCount(0);
    await expect(page.getByLabel(/Vaše jméno|Jméno —/)).toHaveCount(0);

    await page.getByRole('radio', { name: /Jeden dospělý/ }).click();
    await expect(page.getByRole('radio', { name: /Jeden dospělý/ })).toHaveAttribute('aria-checked', 'true');

    /* Now they appear — one of each, because one adult was chosen. And the birth year is
       asked for rather than guessed: optional in the model, required in the wizard, because a
       silent 1994 is a silent answer to a question about a real person. */
    await expect(page.getByLabel(/Rok narození/)).toHaveCount(1);
    await expect(page.getByLabel(/Rok narození/)).toHaveValue('');
    const nameField = page.getByLabel(/Vaše jméno/);
    await expect(nameField).toHaveCount(1);

    /*
     * The name must read as optional and anonymous, or a name box on a money form reads as
     * data collection. The placeholder is the fallback the rest of the app uses, so an empty
     * field is a working default on display rather than a blank waiting to be filled.
     */
    await expect(nameField).toHaveValue('');
    await expect(nameField).toHaveAttribute('placeholder', 'Vy');
    await expect(page.locator('.f-badge-soft').first()).toContainText('volitelné');

    /* The shape is answered but the birth year is not, so the step is still held. */
    await expect(page.getByRole('button', { name: 'Pokračovat' })).toBeDisabled();
    await page.getByLabel(/Rok narození/).fill('1990');

    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.getByRole('heading', { name: /Kolik čistého/ })).toBeVisible();
    /* One adult means one income field, not two. */
    await expect(page.getByLabel(/Čistý měsíční příjem/)).toHaveCount(1);

    /*
     * The heart of it: a required amount shows NOTHING until the user answers it. The scenario
     * underneath still holds the national average — the engine has no empty states and must not
     * grow one — but the input does not present that average as if it were their figure, and
     * the step will not move on.
     */
    const income = page.getByLabel(/Čistý měsíční příjem/);
    await expect(income).toHaveValue('');
    await expect(page.locator('.f-control[data-blank="true"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Pokračovat' })).toBeDisabled();

    /* Answering it clears the block and retires the badge. */
    await income.fill('52000');
    await expect(page.getByRole('button', { name: 'Pokračovat' })).toBeEnabled();
    await expect(page.locator('.f-badge-required')).toHaveCount(0);

    expect(errors, errors.join('\n')).toEqual([]);
  });


  test('names both adults optionally, and falls back to Osoba 1 when left blank', async ({
    page,
  }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs/plan');
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await page.getByRole('radio', { name: /Dva dospělí/ }).click();

    /* Two adults, two optional name fields, and the placeholders are the defaults. */
    await expect(page.getByLabel(/Jméno — osoba/)).toHaveCount(2);
    await expect(page.getByLabel(/Jméno — osoba 1/)).toHaveAttribute('placeholder', 'Osoba 1');
    await expect(page.getByLabel(/Jméno — osoba 2/)).toHaveAttribute('placeholder', 'Osoba 2');

    /* Naming one and leaving the other blank must not leave a hole anywhere downstream. */
    await page.getByLabel(/Jméno — osoba 1/).fill('Milan');
    const years = page.getByLabel(/Rok narození/);
    await years.nth(0).fill('1990');
    await years.nth(1).fill('1992');
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.getByLabel(/Čistý měsíční příjem — Milan/)).toBeVisible();
    await expect(page.getByLabel(/Čistý měsíční příjem — Osoba 2/)).toBeVisible();

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('offers rent as a first-class alternative to a mortgage', async ({ page }) => {
    await page.goto('/cs/plan');
    await startWizard(page);
    await advance(page);

    await expect(page.getByRole('heading', { name: /Jak řešíte bydlení/ })).toBeVisible();
    await page.getByRole('radio', { name: /V nájmu/ }).click();
    await expect(page.getByLabel(/Nájem měsíčně/)).toBeVisible();
    /* A renter must never be asked for a mortgage balance. */
    await expect(page.locator('#m-balance')).toHaveCount(0);
  });

  test('asks about the refixation instead of pretending it is already filled in', async ({ page }) => {
    await page.goto('/cs/plan');
    await startWizard(page);
    await advance(page);
    await expect(page.getByRole('heading', { name: /Jak řešíte bydlení/ })).toBeVisible();

    /*
     * Nothing about a mortgage is asked before the user says they have one. The kind has no
     * pre-selection now, and the sub-fields are gated on the answer rather than on the state
     * the scenario happens to hold — the same trap as the birth-year fields on step 2.
     */
    await expect(page.locator('#m-balance')).toHaveCount(0);
    await page.getByRole('radio', { name: /Vlastní na hypotéku/ }).click();
    await expect(page.locator('#m-balance')).toBeVisible();

    /*
     * The regression this exists for: the date and the new rate used to be rendered as if they
     * were set, while `rateResets` was empty — the screen showed a refixation in 2029 that the
     * projection did not contain, and touching either field silently committed the other one's
     * displayed value. It is now a question, off by default, and nothing is modelled until it
     * is answered.
     */
    await expect(page.getByRole('radio', { name: /Nemám \/ neřeším/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('#m-refix-rate')).toHaveCount(0);
    await expect(page.locator('#m-refix-year')).toHaveCount(0);

    await page.getByRole('radio', { name: /Ano, skončí/ }).click();
    await expect(page.locator('#m-refix-rate')).toBeVisible();
    await expect(page.locator('#m-refix-year')).toBeVisible();

    /* And it can be turned back off, leaving nothing behind. */
    await page.getByRole('radio', { name: /Nemám \/ neřeším/ }).click();
    await expect(page.locator('#m-refix-rate')).toHaveCount(0);
  });

  test('takes several cash accounts and several investments, each with its own rate', async ({ page }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs/plan');
    await startWizard(page);
    for (let i = 0; i < 4; i++) await advance(page);
    await expect(page.getByRole('heading', { name: /Rezerva a investování/ })).toBeVisible();
    /* Cash and investments are optional, so nothing here is marked required. */
    await expect(page.locator('.f-badge-required')).toHaveCount(0);

    /* A current account at 0 % beside a savings account is the commonest real arrangement. */
    await page.getByRole('button', { name: 'Přidat účet' }).click();
    const amounts = page.getByLabel(/Kolik máte teď/);
    await expect(amounts).toHaveCount(2);
    await amounts.nth(1).fill('200000');
    /* Two accounts, one at 4 % and one at 0 %, blend to 2 % — and the header says so. */
    await expect(page.getByText(/Celkem/)).toContainText('2');

    /* A second investment, with a different expected return. */
    await page.getByRole('button', { name: 'Přidat investici' }).click();
    const returns = page.getByLabel(/Očekávaný roční výnos/);
    await expect(returns).toHaveCount(2);
    await returns.nth(1).fill('12');
    await expect(returns.nth(1)).toHaveValue('12');

    /* The primary pot is a role, not an entry: it has no remove button. */
    await expect(page.getByRole('button', { name: 'Odebrat' })).toHaveCount(3);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('treats children as a question, not as a form to fill in', async ({ page }) => {
    await page.goto('/cs/plan');
    await startWizard(page);
    for (let i = 0; i < 5; i++) await advance(page);

    await expect(page.getByRole('heading', { name: 'Děti' })).toBeVisible();
    /* The default is "we don't know yet", and that state is complete, not unfinished. */
    await expect(page.getByRole('radio', { name: /Ještě nevíme/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: 'Přidat dítě' })).toHaveCount(0);

    await page.getByRole('radio', { name: /Ano — máme nebo plánujeme/ }).click();
    await expect(page.getByLabel(/Předpokládané narození/).first()).toBeVisible();
  });
});

test.describe('planner', () => {
  test('onboarding can be skipped and the plan renders with its analysis', async ({ page }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs/plan');
    await fillWizard(page);

    await expect(page.getByRole('heading', { name: 'Verdikt' })).toBeVisible();
    await expect(page.getByText('Nejnižší rezerva').first()).toBeVisible();
    /* Comparison and sensitivity are the two sections that make it a decision tool. They are
       collapsed by default, but their headings — and their live summaries — are always there. */
    await expect(page.locator('#srovnani-btn')).toBeVisible();
    await expect(page.locator('#citlivost-btn')).toBeVisible();
    /* Collapsed, but their live summary is on the header, so collapsing costs no information. */
    await expect(page.locator('#srovnani-btn')).toContainText('scénář');

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('a collapsed section opens from the rail and remembers that it is open', async ({ page }) => {
    await page.goto('/cs/plan');
    await fillWizard(page);

    await page
      .getByRole('navigation', { name: 'Části plánu' })
      .getByRole('button', { name: 'Srovnání scénářů' })
      .click();
    await expect(page.locator('#srovnani-btn')).toHaveAttribute('aria-expanded', 'true');
    /* The section id goes in a query param, never in the fragment: the fragment carries the
       plan itself, and the privacy claim rests on it never reaching a server. */
    await expect(page).toHaveURL(/\?s=srovnani/);

    await page.reload();
    /* Reading state is kept under its own storage key, separate from the plan, so it survives
       a reload. The wizard does not come back: finishing it saves the plan. */
    await expect(page.locator('.wizard')).toHaveCount(0);
    await expect(page.locator('#srovnani-btn')).toHaveAttribute('aria-expanded', 'true');
  });

  test('adding a child changes the verdict', async ({ page }) => {
    await page.goto('/cs/plan');
    await fillWizard(page);
    /* The healthy verdict block. Its glyph is aria-hidden and part of the text node, so this
       addresses the block rather than an exact string. */
    await expect(page.locator('.notice[data-tone="good"]')).toBeVisible();

    await openSection(page, 'cisla');
    await page.getByRole('radio', { name: /Ano — máme nebo plánujeme/ }).click();
    /* One child on an average household is enough to break it — that is the whole product. */
    await expect(page.locator('.notice[data-tone="good"]')).toBeHidden({ timeout: 15_000 });
  });

  test('a proven fix can be applied and it improves the trough', async ({ page }) => {
    await page.goto('/cs/plan');
    await fillWizard(page);
    await openSection(page, 'cisla');
    await page.getByRole('radio', { name: /Ano — máme nebo plánujeme/ }).click();

    const apply = page.getByRole('button', { name: 'Použít' }).first();
    await apply.waitFor({ timeout: 15_000 });

    const troughBefore = await page.locator('svg[role="img"]').first().getAttribute('aria-label');
    await apply.click();
    await expect
      .poll(async () => page.locator('svg[role="img"]').first().getAttribute('aria-label'), {
        timeout: 15_000,
      })
      .not.toBe(troughBefore);
  });

  test('scores the arrangement, and shows the reasons rather than just the grade', async ({
    page,
  }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs/plan');
    await fillWizard(page);

    /* The gauge reports a percentage, and it sits UNDER the chart it is a reading of.
       `.gauge`, not `.ring`: that name belongs to a Tailwind utility, which painted a 1px
       square outline around the circle for as long as the class was called that. */
    const gauge = page.locator('.gauge');
    await expect(gauge).toBeVisible();
    await expect(gauge.locator('.gauge-figure strong')).toHaveText(/^\d{1,3}$/);
    /* And no utility is drawing a box around it any more. */
    await expect(gauge).toHaveCSS('box-shadow', 'none');

    /* Four dimensions, collapsed but present in the DOM: the reasons behind a score must be
       findable, not fetched. */
    const rows = page.locator('.health-row');
    await expect(rows).toHaveCount(4);
    await expect(page.locator('#health-rows')).toBeHidden();

    await page.getByRole('button', { name: /Rozepsat po částech/ }).click();
    await expect(page.locator('#health-rows')).toBeVisible();

    /* Every row states its measurement next to its grade — a grade alone is an opinion. */
    for (let i = 0; i < 4; i++) {
      await expect(rows.nth(i).locator('.health-row-score')).toContainText(/\d/);
      await expect(rows.nth(i).locator('.health-row-fact')).not.toBeEmpty();
      await expect(rows.nth(i).locator('.health-row-advice')).not.toBeEmpty();
      await expect(rows.nth(i).locator('progress')).toHaveAttribute('max', '100');
    }

    /*
     * The two claims the score must never make are denied on /metodika rather than under the
     * gauge — the panel is for the reading, the limitations list is for the limitations. They
     * have to be somewhere, so this asserts they are.
     */
    await page.goto('/cs/metodika');
    const limits = page.getByRole('listitem');
    await expect(limits.filter({ hasText: /není srovnání s jinými uživateli/ })).toHaveCount(1);
    await expect(limits.filter({ hasText: /není důchodový výpočet/ })).toHaveCount(1);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('tells a cash hoarder to invest rather than to save harder', async ({ page }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs/plan');
    await fillWizard(page);
    await page.getByRole('button', { name: /Rozepsat po částech/ }).click();

    const investing = page.locator('.health-row').nth(1);
    await expect(investing.locator('.health-row-name')).toContainText('Investování');

    /* Pile up the cash and stop investing: the advice has to change from "invest more of your
       income" to "move the money you already have", which is the whole point of the rule. */
    await openSection(page, 'cisla');
    await page.getByLabel(/Kolik máte teď/).first().fill('4000000');
    await page.getByLabel(/Měsíční vklad/).first().fill('0');

    await expect(investing.locator('.health-row-advice')).toContainText(
      /Máte podstatně víc hotovosti/,
    );
    await expect(investing.locator('.health-row-fact')).toContainText(/V hotovosti držíte/);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('a plan survives a reload with no save button in sight', async ({ page }) => {
    await page.goto('/cs/plan');
    await fillWizard(page);
    await openSection(page, 'cisla');
    await page.getByLabel(/Kolik máte teď/).fill('333000');
    /* No Save button: the change persists on its own. */
    await waitForAutosave(page);

    await page.reload();
    /* A stored plan must skip the wizard, not show it again. */
    await openSection(page, 'cisla');
    await expect(page.getByLabel(/Kolik máte teď/)).toHaveValue(/333\s?000/);
  });

  test('the editor accepts the numbers this product itself prints', async ({ page }) => {
    await page.goto('/cs/plan');
    await fillWizard(page);
    await openSection(page, 'cisla');

    /*
     * A user copies "39 000 Kč" out of the app and pastes it back in. With the old field this
     * parsed as NaN and silently did nothing, and so did a decimal comma.
     */
    const income = page.getByLabel(/Čistý měsíční příjem/).first();
    await income.fill('41 500 Kč');
    await income.blur();
    await expect(income).toHaveValue(/41\s?500/);

    /*
     * And clicking in and typing REPLACES the prefilled estimate rather than inserting into it.
     * It used to insert, so clicking into 39 000 and typing 61000 gave 6100052000 — on a field
     * prefilled with a national average, click-and-type is the commonest interaction there is.
     */
    await income.click();
    await page.keyboard.type('61000');
    await expect(income).toHaveValue('61000');
    await income.blur();
    await expect(income).toHaveValue(/61\s?000/);
  });
});

test.describe('country and locale', () => {
  test('a plan saved under /cs must not resurface on the Slovak planner', async ({ page }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs/plan');
    await fillWizard(page);
    await openSection(page, 'cisla');
    await expect(page.locator('#m-balance')).toHaveValue(/4\s?510\s?000/);
    /* A figure nothing else in the suite uses, so finding it later can only mean a leak. */
    await page.getByLabel(/Kolik máte teď/).fill('222000');
    await waitForAutosave(page);

    /* The header language switch — same profile, same localStorage. */
    await page.getByRole('link', { name: 'SK', exact: true }).click();
    await expect(page).toHaveURL(/\/sk(\/|$)/);
    await page.goto('/sk/plan');

    /*
     * The whole assertion: the Slovak planner opens its own EMPTY wizard rather than the Czech
     * household. Plans are stored per country, so there is nothing here to restore — and now
     * that the wizard cannot be skipped, "nothing to restore" means "step one", which is a
     * sharper proof than reading a default off a prefilled field.
     */
    await expect(page.locator('.wizard')).toBeVisible();
    await expect(page.getByRole('heading', { name: /V ktorej krajine/ })).toBeVisible();
    await fillWizard(page, 'sk');
    await openSection(page, 'cisla');

    /* Slovak page, euro, and not a trace of the Czech reserve. */
    await expect(page.locator('.f-unit').first()).toHaveText('€');
    await expect(page.getByText('222 000')).toHaveCount(0);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('a Slovak reader can plan in Czech koruna, and it survives a reload', async ({ page }) => {
    /*
     * The case that inferring the country from the locale gets wrong: same person, Slovak
     * interface, Czech job, Czech mortgage, Czech benefits. Every number would be wrong.
     */
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/sk/plan');
    await expect(page.getByRole('heading', { name: /V ktorej krajine/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Slovensko/ })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('radio', { name: /Česko/ }).click();
    await page.getByRole('button', { name: 'Pokračovať' }).click();
    await page.getByRole('radio', { name: /Dvaja dospelí/ }).click();
    /* The birth years are required too, so the step holds until they are answered. */
    const years = page.getByLabel(/Rok narodenia/);
    for (let i = (await years.count()) - 1; i >= 0; i--) await years.nth(i).fill('1990');
    await page.getByRole('button', { name: 'Pokračovať' }).click();
    await expect(page.getByRole('heading', { name: /Koľko čistého/ })).toBeVisible();

    /*
     * Slovak labels, Czech money. The income fields start empty now — required and unanswered —
     * so the currency is asserted on the affix, which is rendered either way, and then on a
     * figure the test types in itself.
     */
    const income = page.getByLabel(/Čistý mesačný príjem/).first();
    await expect(income).toHaveValue('');
    await expect(page.locator('.f-unit').first()).toHaveText('Kč');
    await income.fill('39000');
    await expect(income).toHaveValue(/39\s?000/);

    /* The rest of the wizard, answered — there is no way past it any more. */
    await runRemainingSteps(page, 'sk');
    await openSection(page, 'cisla');
    await expect(page.locator('#m-balance')).toHaveValue(/4\s?510\s?000/);
    await page.getByLabel(/Koľko máte teraz/).fill('250000');
    await waitForAutosave(page, 'sk');

    /* The choice is remembered, so a reload does not put them back on euro. */
    await page.reload();
    await openSection(page, 'cisla');
    await expect(page.locator('#m-balance')).toHaveValue(/4\s?510\s?000/);
    await expect(page.getByText('€')).toHaveCount(0);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('each country keeps its own plan — one does not overwrite the other', async ({ page }) => {
    await page.goto('/cs/plan');
    await fillWizard(page);
    await openSection(page, 'cisla');
    await page.getByLabel(/Kolik máte teď/).fill('333000');
    await waitForAutosave(page);

    await page.goto('/sk/plan');
    await fillWizard(page, 'sk');
    await openSection(page, 'cisla');
    await page.getByLabel(/Koľko máte teraz/).fill('12000');
    await waitForAutosave(page, 'sk');

    /* The Slovak save must not have eaten the Czech plan. */
    await page.goto('/cs/plan');
    await openSection(page, 'cisla');
    await expect(page.getByLabel(/Kolik máte teď/)).toHaveValue(/333\s?000/);
  });
});

test.describe('accessibility and sharing', () => {
  test('the chart can be walked with the keyboard, not just a pointer', async ({ page }) => {
    await page.goto('/cs');
    const chart = page.locator('svg[role="img"]').first();
    await chart.focus();
    await expect(chart).toBeFocused();

    /* Arrow keys move along the series and announce the reading in a live region. */
    await page.keyboard.press('End');
    const atEnd = await page.locator('p[aria-live="polite"]').first().textContent();
    expect(atEnd).toMatch(/20\d\d/);

    await page.keyboard.press('Home');
    const atStart = await page.locator('p[aria-live="polite"]').first().textContent();
    expect(atStart).toMatch(/20\d\d/);
    expect(atStart).not.toBe(atEnd);
  });

  test('a shared link reproduces the plan it was made from', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/cs/plan');
    await fillWizard(page);
    await openSection(page, 'cisla');
    await page.getByLabel(/Kolik máte teď/).fill('777000');
    await page.getByRole('button', { name: /Zkopírovat odkaz/ }).click();
    await expect(page.getByText('Odkaz zkopírován')).toBeVisible();

    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toContain('#p=');

    /* A fresh browser context: no localStorage, so only the link can carry the plan. */
    const other = await page.context().browser()!.newContext();
    const fresh = await other.newPage();
    await fresh.goto(url);
    await expect(fresh.getByText(/Plán načtený z odkazu/)).toBeVisible();
    await openSection(fresh, 'cisla');
    await expect(fresh.getByLabel(/Kolik máte teď/)).toHaveValue(/777\s?000/);
    await other.close();
  });

  test('envelopes are descriptive: adding one must not move the projection', async ({ page }) => {
    await page.goto('/cs/plan');
    await fillWizard(page);
    await openSection(page, 'cisla');
    await openGroup(page, /Obálky/);

    const before = await page.locator('svg[role="img"]').first().getAttribute('aria-label');
    await page.getByRole('button', { name: 'Přidat obálku' }).click();
    await page.getByLabel(/Kolik je v ní/).fill('50000');
    await page.waitForTimeout(600);
    const after = await page.locator('svg[role="img"]').first().getAttribute('aria-label');
    expect(after).toBe(before);
  });
});


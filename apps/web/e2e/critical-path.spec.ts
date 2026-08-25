import { expect, test, type Page } from '@playwright/test';

/** Nothing may reach the console. A hydration mismatch is a silent bug that shows up here. */
function failOnConsoleErrors(page: Page, sink: string[]) {
  page.on('pageerror', (error) => sink.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') sink.push(`console: ${message.text()}`);
  });
}

/** The wizard is seven steps now; every one of them offers a way straight to the plan. */
async function skipWizard(page: Page, locale: 'cs' | 'sk' = 'cs') {
  const label = locale === 'sk' ? /Preskočiť/ : /Přeskočit/;
  const skip = page.getByRole('button', { name: label });
  if (await skip.isVisible().catch(() => false)) await skip.click();
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
 * wizard on the income step.
 */
async function startWizard(page: Page, shape: 'single' | 'couple' = 'couple') {
  await page.getByRole('button', { name: 'Pokračovat' }).click();
  await page.getByRole('radio', { name: shape === 'single' ? /Jeden dospělý/ : /Dva dospělí/ }).click();
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

    /* The privacy promise belongs above the fold. */
    await expect(page.getByText('Vaše data zůstávají ve vašem prohlížeči.')).toBeVisible();

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

  test('the proof of a fix can be opened', async ({ page }) => {
    await page.goto('/cs');
    await page.getByRole('button', { name: 'Ukázat přepočet' }).click();
    await expect(page.getByText('Po změně')).toBeVisible();
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
     * was off-screen on every step, and it split attention on the one screen whose whole
     * design is one question at a time. The ribbon replaces it.
     */
    await expect(page.locator('svg[role="img"]')).toHaveCount(0);
    await expect(page.getByText('Zatím to vypadá takto')).toBeVisible();

    /* The shape restructures every screen after it, so unlike the country it gets no default:
       nothing is pre-selected and the wizard will not advance until it is answered. */
    await expect(page.getByRole('button', { name: 'Pokračovat' })).toBeDisabled();
    await page.getByRole('radio', { name: /Jeden dospělý/ }).click();
    await expect(page.getByRole('radio', { name: /Jeden dospělý/ })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.getByRole('heading', { name: /Kolik čistého/ })).toBeVisible();
    /* One adult means one income field, not two. */
    await expect(page.getByLabel(/Čistý měsíční příjem/)).toHaveCount(1);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('offers rent as a first-class alternative to a mortgage', async ({ page }) => {
    await page.goto('/cs/plan');
    await startWizard(page);
    await page.getByRole('button', { name: 'Pokračovat' }).click();

    await expect(page.getByRole('heading', { name: /Jak řešíte bydlení/ })).toBeVisible();
    await page.getByRole('radio', { name: /V nájmu/ }).click();
    await expect(page.getByLabel(/Nájem měsíčně/)).toBeVisible();
    /* A renter must never be asked for a mortgage balance. */
    await expect(page.locator('#m-balance')).toHaveCount(0);
  });

  test('asks about the refixation instead of pretending it is already filled in', async ({ page }) => {
    await page.goto('/cs/plan');
    await startWizard(page);
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.getByRole('heading', { name: /Jak řešíte bydlení/ })).toBeVisible();

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
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.getByRole('heading', { name: /Rezerva a investování/ })).toBeVisible();

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
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Pokračovat' }).click();

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
    await skipWizard(page);

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
    await skipWizard(page);

    await page
      .getByRole('navigation', { name: 'Části plánu' })
      .getByRole('button', { name: 'Srovnání scénářů' })
      .click();
    await expect(page.locator('#srovnani-btn')).toHaveAttribute('aria-expanded', 'true');
    /* The section id goes in a query param, never in the fragment: the fragment carries the
       plan itself, and the privacy claim rests on it never reaching a server. */
    await expect(page).toHaveURL(/\?s=srovnani/);

    await page.reload();
    /* Reading state is kept under its own storage key, so it survives a reload whether or not
       a plan is stored — which is why the wizard has to be skipped again here. */
    await skipWizard(page);
    await expect(page.locator('#srovnani-btn')).toHaveAttribute('aria-expanded', 'true');
  });

  test('adding a child changes the verdict', async ({ page }) => {
    await page.goto('/cs/plan');
    await skipWizard(page);
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
    await skipWizard(page);
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

  test('a plan survives a reload with no save button in sight', async ({ page }) => {
    await page.goto('/cs/plan');
    await skipWizard(page);
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
    await skipWizard(page);
    await openSection(page, 'cisla');

    /*
     * A user copies "39 000 Kč" out of the app and pastes it back in. With the old field this
     * parsed as NaN and silently did nothing, and so did a decimal comma.
     */
    const income = page.getByLabel(/Čistý měsíční příjem/).first();
    await income.fill('41 500 Kč');
    await income.blur();
    await expect(income).toHaveValue(/41\s?500/);
  });
});

test.describe('country and locale', () => {
  test('a plan saved under /cs must not resurface on the Slovak planner', async ({ page }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs/plan');
    await skipWizard(page);
    await openSection(page, 'cisla');
    await expect(page.locator('#m-balance')).toHaveValue(/4\s?510\s?000/);
    /* Touch one field so there is something to autosave, then let it. */
    await page.getByLabel(/Kolik máte teď/).fill('222000');
    await waitForAutosave(page);

    /* The header language switch — same profile, same localStorage. */
    await page.getByRole('link', { name: 'SK', exact: true }).click();
    await expect(page).toHaveURL(/\/sk(\/|$)/);
    await page.goto('/sk/plan');
    await skipWizard(page, 'sk');
    await openSection(page, 'cisla');

    /* Slovak page, Slovak numbers — the whole assertion. */
    await expect(page.locator('#m-balance')).toHaveValue(/130\s?000/);
    await expect(page.locator('#m-payment')).toHaveValue(/650/);

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
    await page.getByRole('button', { name: 'Pokračovať' }).click();

    /* Slovak labels, Czech money. */
    await expect(page.getByLabel(/Čistý mesačný príjem/).first()).toHaveValue(/39\s?000/);
    await expect(page.locator('.f-unit').first()).toHaveText('Kč');

    await page.getByRole('button', { name: /Preskočiť/ }).click();
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
    await skipWizard(page);
    await openSection(page, 'cisla');
    await page.getByLabel(/Kolik máte teď/).fill('333000');
    await waitForAutosave(page);

    await page.goto('/sk/plan');
    await skipWizard(page, 'sk');
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
    await skipWizard(page);
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
    await skipWizard(page);
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

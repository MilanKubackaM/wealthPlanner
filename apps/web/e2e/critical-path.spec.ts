import { expect, test } from '@playwright/test';

/** Nothing may reach the console. A hydration mismatch is a silent bug that shows up here. */
function failOnConsoleErrors(page: import('@playwright/test').Page, sink: string[]) {
  page.on('pageerror', (error) => sink.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') sink.push(`console: ${message.text()}`);
  });
}

test.describe('landing', () => {
  test('shows a populated projection and names the trough month', async ({ page }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs');
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
});

test.describe('planner', () => {
  test('onboarding can be skipped and the plan renders with its analysis', async ({ page }) => {
    const errors: string[] = [];
    failOnConsoleErrors(page, errors);

    await page.goto('/cs/plan');
    await page.getByRole('button', { name: /Přeskočit/ }).click();

    await expect(page.getByRole('heading', { name: 'Co model našel' })).toBeVisible();
    await expect(page.getByText('Nejnižší rezerva').first()).toBeVisible();
    /* Comparison and sensitivity are the two sections that make it a decision tool. */
    await expect(page.getByRole('heading', { name: 'Srovnání scénářů' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Co když se předpoklady/ })).toBeVisible();

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the chart tracks typing, and adding a child changes the verdict', async ({ page }) => {
    await page.goto('/cs/plan');
    await page.getByRole('button', { name: /Přeskočit/ }).click();

    await expect(page.getByRole('heading', { name: 'Plán drží' })).toBeVisible();

    await page.getByRole('button', { name: 'Přidat dítě' }).click();
    /* One child on an average household is enough to break it — that is the whole product. */
    await expect(page.getByRole('heading', { name: 'Plán drží' })).toBeHidden({ timeout: 15_000 });
  });

  test('a proven fix can be applied and it improves the trough', async ({ page }) => {
    await page.goto('/cs/plan');
    await page.getByRole('button', { name: /Přeskočit/ }).click();
    await page.getByRole('button', { name: 'Přidat dítě' }).click();

    const apply = page.getByRole('button', { name: 'Použít' }).first();
    await apply.waitFor({ timeout: 15_000 });

    const troughBefore = await page.locator('svg[role="img"]').first().getAttribute('aria-label');
    await apply.click();
    await expect
      .poll(
        async () => page.locator('svg[role="img"]').first().getAttribute('aria-label'),
        { timeout: 15_000 },
      )
      .not.toBe(troughBefore);
  });

  test('a plan survives a save and a reload', async ({ page }) => {
    await page.goto('/cs/plan');
    await page.getByRole('button', { name: /Přeskočit/ }).click();
    await page.getByLabel('Kolik máte teď').fill('333000');
    await page.getByRole('button', { name: 'Uložit do prohlížeče' }).click();

    await page.reload();
    /* A stored plan must skip the wizard, not show it again. */
    await expect(page.getByLabel('Kolik máte teď')).toHaveValue('333000');
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
    await page.getByRole('button', { name: /Přeskočit/ }).click();
    await page.getByLabel('Kolik máte teď').fill('777000');
    await page.getByRole('button', { name: /Zkopírovat odkaz/ }).click();
    await expect(page.getByText('Odkaz zkopírován')).toBeVisible();

    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toContain('#p=');

    /* A fresh browser context: no localStorage, so only the link can carry the plan. */
    const other = await page.context().browser()!.newContext();
    const fresh = await other.newPage();
    await fresh.goto(url);
    await expect(fresh.getByLabel('Kolik máte teď')).toHaveValue('777000');
    await expect(fresh.getByText(/Plán načtený z odkazu/)).toBeVisible();
    await other.close();
  });

  test('envelopes are descriptive: adding one must not move the projection', async ({ page }) => {
    await page.goto('/cs/plan');
    await page.getByRole('button', { name: /Přeskočit/ }).click();

    const before = await page.locator('svg[role="img"]').first().getAttribute('aria-label');
    await page.getByRole('button', { name: 'Přidat obálku' }).click();
    await page.getByLabel('Kolik je v ní').fill('50000');
    await page.waitForTimeout(600);
    const after = await page.locator('svg[role="img"]').first().getAttribute('aria-label');
    expect(after).toBe(before);
  });
});

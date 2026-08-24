import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end on the critical path only. The unit and property tests cover the arithmetic;
 * these cover the things that only break in a browser — hydration, the debounced
 * recommendation pass, applying a fix, and the mobile layout.
 */
/*
 * Normally Playwright manages its own browser download and this is unset. Point
 * PW_EXECUTABLE_PATH at an existing Chromium only in an environment that already ships one
 * (a container, a sandbox) to avoid the download. `scripts/ship.sh` runs
 * `playwright install chromium` for you, so a fresh clone never fails with
 * "Executable doesn't exist".
 *
 * Empty is not a value: `??` would accept PW_EXECUTABLE_PATH="" and hand Playwright an
 * empty path.
 */
const executablePath = process.env.PW_EXECUTABLE_PATH || undefined;

/* Empty is not a value: `??` would accept E2E_BASE_URL="" and break every navigation. */
const externalBaseUrl = process.env.E2E_BASE_URL || undefined;
const LOCAL_BASE_URL = 'http://127.0.0.1:3210';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: externalBaseUrl ?? LOCAL_BASE_URL,
    locale: 'cs-CZ',
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'pnpm build && pnpm exec next start -p 3210',
        url: 'http://127.0.0.1:3210/cs',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});

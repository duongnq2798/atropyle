import { defineConfig, devices } from '@playwright/test';

// The site and anvil run on free ports chosen by global-setup; tests read the site URL from the state file.
// Every test runs on a desktop and on a phone: the header, the settings and the wallet sheet change shape between them.
export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/e2e/global-setup.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  // A test that trips a fixture net (an off-chain request, a CSP violation, a page error) and passes on its retry
  // fails the run: an intermittent leak must not pass the gate as "flaky".
  failOnFlakyTests: !!process.env.CI,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});

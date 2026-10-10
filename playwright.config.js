/* ED Viz — configuração dos testes de ponta a ponta (navegador real).
 * Rode com: npm run test:e2e   (antes: npx playwright install chromium firefox)
 */
// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8788',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node servidor.js 8788',
    url: 'http://127.0.0.1:8788/',
    reuseExistingServer: true,
    timeout: 20000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
  ]
});

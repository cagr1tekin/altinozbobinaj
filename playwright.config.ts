import { defineConfig, devices } from "@playwright/test";

/**
 * E2E test yapılandırması.
 *
 * Testler çalışan bir dev sunucusuna bağlanır; sunucu ayakta değilse
 * Playwright kendisi başlatır. `reuseExistingServer` sayesinde geliştirme
 * sırasında açık olan sunucu yeniden başlatılmaz.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // testler ortak veritabanını paylaşıyor
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  },

  projects: [
    {
      name: "masaustu",
      use: { ...devices["Desktop Chrome"] },
      // Mobil senaryolari masaustu viewport'unda kosmak anlamsiz
      testIgnore: /mobil\.spec\.ts/,
    },
    {
      name: "mobil",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobil\.spec\.ts/,
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

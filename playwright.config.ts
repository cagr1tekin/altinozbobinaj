import { defineConfig, devices } from "@playwright/test";

/**
 * E2E test yapılandırması.
 *
 * Testler **production build**'e karşı koşuyor (dev sunucusuna değil).
 *
 * Neden? Turbopack dev sunucusu chunk'ları isteğe göre derliyor ve yoğun
 * anlarda bir chunk'ı boş ya da yarım servis edebiliyor. Böyle bir durumda
 * tarayıcıda "Invalid or unexpected token" / ChunkLoadError oluşuyor,
 * hydration tamamen çöküyor ve bütün client bileşenler ölü kalıyor. Bu,
 * mobil menü ve sabit çağrı barı testlerini rastgele düşürüyordu —
 * uygulamada bir kusur olmadığı hâlde. Production build'de chunk'lar önceden
 * üretildiği için bu yarış yok; ayrıca kullanıcının gerçekte gördüğü
 * derleme test ediliyor.
 *
 * Ayrı port (3100) kullanılıyor ki geliştirme sırasında açık olan dev
 * sunucusu (3000) ile çakışmasın.
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
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
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
    command: "npm run e2e:server",
    url: "http://localhost:3100",
    // Build gerektigi icin ayakta olan sunucu yeniden kullanilabilir
    reuseExistingServer: true,
    // Build + start icin dev sunucusundan daha uzun sure gerekiyor
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});

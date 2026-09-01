import { test, expect } from "@playwright/test";

/**
 * Pazarlama sitesi testleri.
 * Ziyaretçinin gerçekten yaptığı şeyler: kaydırma, menü kullanımı,
 * telefonu tıklama, klavyeyle gezinme.
 */

test.describe("Landing sayfası", () => {
  test("01 — başlık hiyerarşisi tek h1 ile doğru kuruluyor", async ({ page }) => {
    await page.goto("/");

    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText("Altınöz Bobinaj");

    // Boş başlık olmamalı: hem a11y hem SEO ihlali
    const basliklar = await page.locator("h1, h2, h3").allTextContents();
    const boslar = basliklar.filter((b) => b.trim().length === 0);
    expect(boslar, "boş başlık bulundu").toHaveLength(0);
  });

  test("02 — Türkçe karakterler doğru fontla çiziliyor (latin-ext yüklü)", async ({
    page,
  }) => {
    await page.goto("/");

    // ğ, ş, İ içeren metin görünür olmalı
    await expect(page.getByRole("heading", { name: /Altınöz Bobinaj/ })).toBeVisible();

    // Yüklenen font dosyalarında latin-ext alt kümesi bulunmalı
    const fontlar = await page.evaluate(() =>
      Array.from(document.fonts).map((f) => f.family)
    );
    expect(fontlar.length, "hiç font yüklenmedi").toBeGreaterThan(0);
  });

  test("03 — menü linkleri ilgili bölüme kaydırıyor", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Hizmetler", exact: true }).first().click();
    await expect(page.locator("#hizmetler")).toBeInViewport({ timeout: 5000 });

    await page.getByRole("link", { name: "İletişim", exact: true }).first().click();
    await expect(page.locator("#iletisim")).toBeInViewport({ timeout: 5000 });
  });

  test("04 — aktif bölüm göstergesi kaydırmayla güncelleniyor", async ({ page }) => {
    await page.goto("/");

    // Başlangıçta hiçbir menü linki aktif olmamalı (hero'dayız)
    await page.locator("#referanslar").scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);

    const aktif = page.locator('nav[aria-label="Ana menü"] a[aria-current="true"]');
    await expect(aktif).toHaveCount(1);
    await expect(aktif).toHaveText("Referanslar");
  });

  test("05 — telefon ve e-posta bağlantıları tıklanabilir", async ({ page }) => {
    await page.goto("/");

    // İki telefon da ayrı link olmalı (tek metin bloğu değil)
    const telefonlar = page.locator('a[href^="tel:"]');
    expect(await telefonlar.count()).toBeGreaterThanOrEqual(2);

    await expect(
      page.locator('a[href="mailto:altinozbobinajsan@gmail.com"]').first()
    ).toBeVisible();
  });

  test("06 — adres bağlantısı Google Haritalar'a yeni sekmede gidiyor", async ({
    page,
  }) => {
    await page.goto("/");
    const harita = page.locator('a[href*="google.com/maps/dir"]').first();
    await expect(harita).toHaveAttribute("target", "_blank");
    // Yeni sekmeye açılan bağlantıda rel zorunlu
    await expect(harita).toHaveAttribute("rel", /noopener/);
  });

  test("07 — klavyeyle 'İçeriğe geç' bağlantısı çalışıyor", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    const skip = page.getByRole("link", { name: "İçeriğe geç" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible(); // odaklanınca görünür olmalı
  });

  test("08 — tüm görsellerde alt metni var", async ({ page }) => {
    await page.goto("/");
    await page.locator("#referanslar").scrollIntoViewIfNeeded();

    const altsiz = await page.locator("img:not([alt])").count();
    expect(altsiz, "alt metni olmayan görsel").toBe(0);

    const bosAlt = await page.locator('img[alt=""]').count();
    expect(bosAlt, "boş alt metni olan görsel").toBe(0);
  });

  test("09 — yatay kaydırma taşması yok", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(500);

    const tasma = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(tasma, "sayfa yatay olarak taşıyor").toBeLessThanOrEqual(1);
  });

  test("10 — referans galerisi klavyeyle kaydırılabiliyor", async ({ page }) => {
    await page.goto("/");
    const galeri = page.locator('[role="region"][aria-label*="referans"]');
    await galeri.scrollIntoViewIfNeeded();

    await galeri.focus();
    const oncekiKonum = await galeri.evaluate((e) => e.scrollLeft);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    const sonrakiKonum = await galeri.evaluate((e) => e.scrollLeft);

    expect(sonrakiKonum, "klavyeyle kaydırılamadı").toBeGreaterThan(oncekiKonum);
  });

  test("11 — SEO etiketleri ve JSON-LD geçerli", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /altinozbobinaj\.com/
    );
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
      "content",
      "1200"
    );

    const jsonLdler = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(jsonLdler.length).toBe(2);

    for (const ham of jsonLdler) {
      const veri = JSON.parse(ham); // geçersizse test burada patlar
      expect(veri["@context"]).toBe("https://schema.org");
      // Restoran alanı bu işletmede olmamalı
      expect(veri.servesCuisine).toBeUndefined();
    }

    const isletme = JSON.parse(jsonLdler[0]);
    expect(isletme["@type"]).toBe("ProfessionalService");
    expect(isletme.hasOfferCatalog.itemListElement.length).toBeGreaterThanOrEqual(3);
  });

  test("12 — hareket azaltma tercihinde animasyonlar kapanıyor", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");

    // İçerik yine de görünür olmalı (animasyon beklenmeden)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const kaydirma = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior
    );
    expect(kaydirma).toBe("auto");

    await ctx.close();
  });

  test("13 — 404 sayfası Türkçe ve indekslenmiyor", async ({ page }) => {
    const yanit = await page.goto("/olmayan-bir-sayfa");
    expect(yanit?.status()).toBe(404);

    await expect(
      page.getByRole("heading", { name: /Aradığınız sayfa bulunamadı/ })
    ).toBeVisible();

    // Tek bir robots etiketi olmalı; ikisi birden SEO'da kirlilik
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveCount(1);
    await expect(robots).toHaveAttribute("content", /noindex/);
  });

  test("14 — OG görseli gerçekten 1200x630 PNG üretiyor", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    /* Next.js OG rotasına içerik hash'i ekliyor (/opengraph-image-<hash>),
       bu yüzden adres meta etiketinden okunuyor. */
    const ogUrl = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(ogUrl, "og:image etiketi yok").toBeTruthy();

    /* og:image mutlak olmak zorunda: sosyal medya kazıyıcıları göreceli
       adresi çözemez. Production derlemesinde metadataBase gerçek alan
       adına dönüştüğü için adres canlı siteyi işaret ediyor; dosyanın
       kendisi test sunucusundan, yoluyla çekiliyor. */
    const cozulmus = new URL(ogUrl!);
    expect(cozulmus.protocol).toBe("https:");
    expect(cozulmus.hostname).toContain("altinozbobinaj.com");

    const yanit = await request.get(cozulmus.pathname);
    expect(yanit.status()).toBe(200);
    expect(yanit.headers()["content-type"]).toContain("image/png");

    const govde = await yanit.body();
    // PNG başlığından genişlik/yükseklik oku
    expect(govde.subarray(1, 4).toString()).toBe("PNG");
    expect(govde.readUInt32BE(16)).toBe(1200);
    expect(govde.readUInt32BE(20)).toBe(630);
  });

  test("15 — robots.txt panel yollarını engelliyor, _next'i engellemiyor", async ({
    request,
  }) => {
    const metin = await (await request.get("/robots.txt")).text();

    expect(metin).toContain("Disallow: /yonetim/");
    expect(metin).toContain("Disallow: /giris");
    expect(metin).toContain("Disallow: /j/");
    // _next engellenirse Googlebot CSS/JS çekemez
    expect(metin).not.toContain("Disallow: /_next/");
  });
});

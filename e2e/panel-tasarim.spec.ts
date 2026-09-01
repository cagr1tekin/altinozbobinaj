import { test, expect } from "@playwright/test";

/**
 * Panel tasarım sistemi testleri (design-system/PANEL.md).
 *
 * Bu dosyanın asıl işi **izolasyonu korumak**: panel ile pazarlama sitesi
 * birbirine karışmasın. Bir gün biri panelde `bg-ink` kullanırsa ya da
 * landing'e Inter sızarsa burası kırılır.
 *
 * Oturum gerektirmez — giriş sayfası panelin tüm tasarım kurallarını taşıyor.
 */

test.describe("Panel tasarım sistemi", () => {
  test("53 — landing ve panel farklı tema kullanıyor", async ({ page }) => {
    await page.goto("/");
    const landingTema = await page
      .locator('meta[name="theme-color"]')
      .getAttribute("content");
    const landingManifest = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");

    await page.goto("/giris");
    const panelTema = await page
      .locator('meta[name="theme-color"]')
      .getAttribute("content");
    const panelManifest = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");

    expect(landingTema, "landing koyu tema kullanmalı").toBe("#09090b");
    expect(panelTema, "panel açık tema kullanmalı").toBe("#F8FAFC");
    expect(panelTema).not.toBe(landingTema);

    // Panel ana ekrana eklendiğinde /yonetim açılmalı, landing değil
    expect(landingManifest).toBe("/site.webmanifest");
    expect(panelManifest).toBe("/manifest.webmanifest");
  });

  test("54 — panel stilleri landing'e sızmıyor", async ({ page }) => {
    await page.goto("/");

    const sinifKullanimi = await page.evaluate(() => {
      const hepsi = Array.from(document.querySelectorAll("[class]"));
      return {
        pnl: hepsi.filter((e) => /\bpnl-/.test(e.className.toString())).length,
        fontPanel: hepsi.filter((e) =>
          /\bfont-panel\b/.test(e.className.toString())
        ).length,
      };
    });

    expect(sinifKullanimi.pnl, "landing'de panel tokeni kullanılmış").toBe(0);
    expect(sinifKullanimi.fontPanel, "landing'de panel fontu kullanılmış").toBe(0);

    // Landing kendi fontlarını korumalı
    const bodySinif = await page.locator("body").getAttribute("class");
    expect(bodySinif).toContain("font-sans");
    expect(bodySinif).toMatch(/jakarta/i);
    expect(bodySinif).toMatch(/playfair/i);
  });

  test("55 — landing stilleri panele sızmıyor", async ({ page }) => {
    await page.goto("/giris");

    const sizinti = await page.evaluate(() => {
      const hepsi = Array.from(document.querySelectorAll("[class]"));
      const kotu = /\b(bg-ink|text-paper|silver-(main|light|dark|cta|gradient)|font-display)\b/;
      return hepsi
        .filter((e) => kotu.test(e.className.toString()))
        .map((e) => e.className.toString().slice(0, 60));
    });

    expect(
      sizinti,
      `panelde landing sınıfı kullanılmış: ${sizinti.join(" | ")}`
    ).toHaveLength(0);
  });

  test("56 — panel tek font kullanıyor (Inter)", async ({ page }) => {
    await page.goto("/giris");

    const aileler = await page.evaluate(() => {
      const set = new Set<string>();
      document.querySelectorAll("h1, h2, p, label, button, input").forEach((el) => {
        const f = getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "");
        if (f) set.add(f);
      });
      return Array.from(set);
    });

    expect(aileler.length, `birden fazla font ailesi: ${aileler.join(", ")}`).toBe(1);
    expect(aileler[0]).toMatch(/Inter/i);
  });

  test("57 — panelde gölge yok (flat design)", async ({ page }) => {
    await page.goto("/giris");

    const golgeli = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll("*").forEach((el) => {
        const s = getComputedStyle(el).boxShadow;
        if (s && s !== "none") n++;
      });
      return n;
    });

    expect(golgeli, "panelde gölge kullanılmış").toBe(0);
  });

  test("58 — panel açık tema kontrastı yeterli", async ({ page }) => {
    await page.goto("/giris");

    const zemin = await page.evaluate(() => {
      const el = document.querySelector("[class*='bg-pnl-bg']");
      return el ? getComputedStyle(el).backgroundColor : null;
    });
    expect(zemin, "panel zemini bulunamadı").toBe("rgb(248, 250, 252)");

    // Ana metin koyu olmalı — açık temada açık gri metin okunmaz
    const basliRengi = await page.evaluate(() => {
      const h = document.querySelector("h1");
      return h ? getComputedStyle(h).color : null;
    });
    expect(basliRengi).toBe("rgb(15, 23, 42)");
  });
});

test.describe("Panel mobil", () => {
  /* devices[] yerine yalnizca viewport: devices browser tipini de
     degistirdigi icin describe icinde kullanilamiyor. Pixel 7 olculeri. */
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

  test("59 — mobilde yatay taşma yok ve hedefler 44px+", async ({ page }) => {
    await page.goto("/giris");

    const tasma = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(tasma, "panel mobilde yatay taşıyor").toBeLessThanOrEqual(1);

    const kucukler = await page.evaluate(() => {
      const s: string[] = [];
      document.querySelectorAll("a, button, input, select").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.height < 44) {
          s.push(`${el.tagName}:${Math.round(r.height)}px`);
        }
      });
      return s;
    });

    expect(kucukler, `44px altı hedef: ${kucukler.join(", ")}`).toHaveLength(0);
  });

  test("60 — mobilde gövde metni 16px altına inmiyor", async ({ page }) => {
    await page.goto("/giris");

    const kucuk = await page.evaluate(() => {
      const s: number[] = [];
      document.querySelectorAll("input, select, textarea").forEach((el) => {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        // 16px altı input, iOS'ta odaklanınca sayfayı zorla yakınlaştırır
        if (fs < 16) s.push(fs);
      });
      return s;
    });

    expect(kucuk, `16px altı form alanı: ${kucuk.join(", ")}`).toHaveLength(0);
  });

  test("61 — giriş sayfası tek birincil eylem sunuyor", async ({ page }) => {
    await page.goto("/giris");

    /* Tasarım sistemi kuralı: bir ekranda birden fazla birincil buton olmaz.
       Birincil buton dolu mavi zeminle ayrışıyor. */
    const birincilSayisi = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll("button, a").forEach((el) => {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg === "rgb(37, 99, 235)") n++;
      });
      return n;
    });

    expect(birincilSayisi, "birden fazla birincil buton").toBeLessThanOrEqual(1);
  });
});

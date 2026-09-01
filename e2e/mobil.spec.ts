import { test, expect } from "@playwright/test";

/**
 * Mobil cihaz testleri (Pixel 7).
 * Trafiğin ağırlığı yerel mobil aramadan geldiği için bu akış kritik.
 */

test.describe("Mobil deneyim", () => {
  test("16 — hamburger menü açılıyor, kapanıyor ve sayfayı kilitliyor", async ({
    page,
  }) => {
    await page.goto("/");

    const hamburger = page.getByRole("button", { name: "Menüyü aç" });
    await expect(hamburger).toBeVisible();
    await expect(hamburger).toHaveAttribute("aria-expanded", "false");

    /* Tıklama, React hydration tamamlanmadan gelirse onClick henüz bağlı
       olmadığı için yutuluyor ve test yavaş makinelerde kırılıyordu.
       toPass, açılana kadar tıklamayı yeniden deniyor. */
    await expect(async () => {
      await hamburger.click({ timeout: 3000 });
      await expect(
        page.getByRole("button", { name: "Menüyü kapat" })
      ).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 25000 });

    await expect(
      page.getByRole("button", { name: "Menüyü kapat" })
    ).toHaveAttribute("aria-expanded", "true");

    // Panel açıkken arka plan kaydırılamamalı
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow, "menü açıkken sayfa kilitlenmedi").toBe("hidden");

    // Escape ile kapanmalı
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Menüyü aç" })).toBeVisible();

    const sonrakiOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(sonrakiOverflow, "kilit kaldırılmadı").not.toBe("hidden");
  });

  test("17 — mobil menüden bölüme gidiliyor ve menü kapanıyor", async ({ page }) => {
    await page.goto("/");

    await expect(async () => {
      await page.getByRole("button", { name: "Menüyü aç" }).click({ timeout: 3000 });
      await expect(page.locator("#mobil-menu")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 25000 });

    await page.locator("#mobil-menu").getByRole("link", { name: "Referanslar" }).click();

    await expect(page.getByRole("button", { name: "Menüyü aç" })).toBeVisible();
    await expect(page.locator("#referanslar")).toBeInViewport({ timeout: 5000 });
  });

  test("18 — sabit çağrı barı hero sonrası beliriyor", async ({ page }) => {
    await page.goto("/");

    const bar = page.getByRole("link", { name: /Hemen Ara/ });
    // Hero'dayken görünmemeli
    await expect(bar).toBeHidden();

    await page.locator("#hakkimizda").scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);

    await expect(bar).toBeVisible();
    await expect(page.getByRole("link", { name: /WhatsApp/ })).toBeVisible();
  });

  test("19 — çağrı barı footer içeriğinin üstünü kapatmıyor", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("End");
    await page.waitForTimeout(900);

    const telif = page.getByText(/Tüm hakları saklıdır/);
    await telif.scrollIntoViewIfNeeded();

    const telifKutu = await telif.boundingBox();
    const bar = page.getByRole("link", { name: /Hemen Ara/ });

    if (await bar.isVisible()) {
      const barKutu = await bar.boundingBox();
      expect(telifKutu, "telif satırı bulunamadı").not.toBeNull();
      expect(barKutu).not.toBeNull();
      // Telif satırı barın üstünde kalmalı
      expect(telifKutu!.y + telifKutu!.height).toBeLessThanOrEqual(barKutu!.y + 2);
    }
  });

  test("20 — dokunma hedefleri en az 44px", async ({ page }) => {
    await page.goto("/");

    const kucukler: string[] = [];
    const hedefler = page.locator(
      "header a, header button, a[href^='tel:'], a[href^='mailto:']"
    );

    for (let i = 0; i < (await hedefler.count()); i++) {
      const el = hedefler.nth(i);
      if (!(await el.isVisible())) continue;
      const kutu = await el.boundingBox();
      if (!kutu) continue;
      if (kutu.height < 44 && kutu.width < 44) {
        kucukler.push(`${(await el.textContent())?.trim() || "(ikon)"}: ${Math.round(kutu.width)}x${Math.round(kutu.height)}`);
      }
    }

    expect(kucukler, `44px altı dokunma hedefi: ${kucukler.join(", ")}`).toHaveLength(0);
  });

  test("21 — mobilde yatay taşma yok ve gövde metni okunabilir boyutta", async ({
    page,
  }) => {
    await page.goto("/");

    const tasma = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(tasma, "mobilde yatay taşma var").toBeLessThanOrEqual(1);

    const puntolar = await page.evaluate(() =>
      Array.from(document.querySelectorAll("p"))
        .filter((p) => (p.textContent ?? "").trim().length > 40)
        .map((p) => parseFloat(getComputedStyle(p).fontSize))
    );
    const kucukMetin = puntolar.filter((p) => p < 14);
    expect(kucukMetin, "14px altı gövde metni").toHaveLength(0);
  });
});

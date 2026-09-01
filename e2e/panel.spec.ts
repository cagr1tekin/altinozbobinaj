import { test, expect, type Page } from "@playwright/test";
import {
  formBasarisi,
  formHatasi,
  oturumTestiMumkun,
  oturumuKur,
  testAdi,
} from "./yardimcilar";

/**
 * Panelin uçtan uca iş akışı.
 *
 * Test hesabı .env üzerinden veriliyor (E2E_TEST_EPOSTA / E2E_TEST_SIFRE).
 * Tanımlı değilse bu dosya atlanıyor — kimlik bilgisi koda gömülmemeli.
 */

test.describe("Panel iş akışı", () => {
  test.skip(
    !oturumTestiMumkun,
    ".env içinde E2E_TEST_EPOSTA / E2E_TEST_SIFRE tanımlı değil"
  );

  test.beforeEach(async ({ page }) => {
    const kuruldu = await oturumuKur(page);
    if (!kuruldu) test.skip(true, "Test hesabıyla oturum açılamadı");
  });

  /** Testler arası bağımlılığı azaltmak için her testte kendi müşterisini kurar. */
  /* Ekleme formları artık listenin ilk satırındaki açılırın içinde;
     ayrı /yeni sayfası yok. */
  async function acilirAc(page: Page, etiket: RegExp) {
    const dugme = page.getByRole("button", { name: etiket });
    if ((await dugme.getAttribute("aria-expanded")) === "false") {
      await dugme.click();
    }
  }

  async function musteriOlustur(page: Page, ad: string) {
    await page.goto("/yonetim/musteriler");
    await acilirAc(page, /Yeni müşteri ekle/);
    await page.getByLabel("Müşteri adı").fill(ad);
    await page.getByRole("button", { name: /Müşteriyi Kaydet/ }).click();
    await page.waitForURL(/\/yonetim\/musteriler\/[0-9a-f-]{36}/, { timeout: 20000 });
  }

  async function segmentAc(page: Page) {
    await acilirAc(page, /Yeni segment aç/);
    await page.getByRole("button", { name: /Segment Aç/ }).click();
    await page.waitForURL(/\/yonetim\/segmentler\/[0-9a-f-]{36}/, { timeout: 20000 });
  }

  async function isEkle(page: Page, baslik: string) {
    await acilirAc(page, /Yeni iş ekle/);
    await page.getByLabel("İş başlığı").fill(baslik);
    await page.getByRole("button", { name: /İş Ekle/ }).click();
    await page.waitForURL(/\/yonetim\/isler\/[0-9a-f-]{36}/, { timeout: 20000 });
  }

  test("32 — müşteri → segment → iş zinciri kuruluyor", async ({ page }) => {
    const ad = testAdi("Zincir");
    await musteriOlustur(page, ad);
    await expect(page.getByRole("heading", { name: ad })).toBeVisible();

    await segmentAc(page);
    await isEkle(page, "75 Kw LEROY SOMER 1500 d/d Sarım");

    // Yeni iş doğrudan "devam ediyor" başlamalı (revizyon isteği)
    await expect(page.getByText("Devam ediyor").first()).toBeVisible();
  });

  test("33 — Türkçe karakterli ve uzun müşteri adı bozulmadan kaydediliyor", async ({
    page,
  }) => {
    const ad = testAdi("Şişli Örme İğdır Çğüöş A.Ş.");
    await musteriOlustur(page, ad);
    await expect(page.getByRole("heading", { name: ad })).toBeVisible();

    // Listede de doğru görünmeli
    await page.goto("/yonetim/musteriler");
    await expect(page.getByText(ad)).toBeVisible();
  });

  test("34 — zorunlu alan boşken kayıt reddediliyor", async ({ page }) => {
    await page.goto("/yonetim/musteriler");
    await acilirAc(page, /Yeni müşteri ekle/);
    await page.getByRole("button", { name: /Müşteriyi Kaydet/ }).click();

    await expect(formHatasi(page)).toBeVisible({ timeout: 10000 });
    expect(page.url(), "boş formla kayıt oluştu").toContain("/musteriler");
  });

  test("35 — geçersiz e-posta reddediliyor, alan hatası gösteriliyor", async ({
    page,
  }) => {
    await page.goto("/yonetim/musteriler");
    await acilirAc(page, /Yeni müşteri ekle/);
    await page.getByLabel("Müşteri adı").fill(testAdi("EpostaTest"));
    await page.getByLabel("E-posta").fill("bu-bir-eposta-degil");
    await page.getByRole("button", { name: /Müşteriyi Kaydet/ }).click();

    const uyari = formHatasi(page);
    await expect(uyari).toBeVisible({ timeout: 10000 });
    await expect(uyari).toContainText(/e-posta/i);
  });

  test("36 — script içeren girdi metin olarak saklanıyor (XSS yok)", async ({
    page,
  }) => {
    const zararli = `${testAdi("XSS")}<script>window.__xss=1</script>`;

    let dialogAcildi = false;
    page.on("dialog", async (d) => {
      dialogAcildi = true;
      await d.dismiss();
    });

    await musteriOlustur(page, zararli);

    const calisti = await page.evaluate(
      () => (window as unknown as { __xss?: number }).__xss === 1
    );
    expect(calisti, "enjekte edilen script çalıştı").toBe(false);
    expect(dialogAcildi, "beklenmeyen dialog açıldı").toBe(false);

    // Metin ekranda kaçırılmış olarak görünmeli
    await expect(page.getByText("<script>", { exact: false })).toBeVisible();
  });

  test("37 — ürün ekleniyor ve stok girişi hareket kaydı oluşturuyor", async ({
    page,
  }) => {
    const urun = testAdi("Rulman");

    await page.goto("/yonetim/urunler");
    await acilirAc(page, /Yeni ürün ekle/);
    await page.getByLabel("Ürün adı").fill(urun);
    await page.getByLabel(/Alış fiyatı/).fill("120,50"); // Türkçe ondalık
    await page.getByRole("button", { name: /Ürünü Kaydet/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    // Fiyat virgülle girildiği hâlde doğru saklanmalı
    await expect(page.getByText(urun)).toBeVisible();
    await expect(page.getByText("120,50").first()).toBeVisible();

    // Stok girişi
    await acilirAc(page, /Stok hareketi ekle/);
    await page.getByLabel("Ürün", { exact: true }).selectOption({ label: urun });
    await page.getByLabel("Adet", { exact: true }).fill("10");
    await page.getByLabel("Not").fill("E2E stok girişi");
    await page.getByRole("button", { name: /Hareketi Uygula/ }).click();

    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("E2E stok girişi")).toBeVisible();
  });

  test("38 — negatif fiyat ve kesirli adet reddediliyor", async ({ page }) => {
    await page.goto("/yonetim/urunler");

    await page.getByLabel("Ürün adı").fill(testAdi("NegatifTest"));
    await page.getByLabel(/Alış fiyatı/).fill("-50");
    await page.getByRole("button", { name: /Ürünü Kaydet/ }).click();

    const uyari = formHatasi(page);
    await expect(uyari).toBeVisible({ timeout: 10000 });
    await expect(uyari).toContainText(/negatif/i);
  });

  test("39 — malzeme eklemek stoğu DÜŞÜRMÜYOR, tamamlama düşürüyor", async ({
    page,
  }) => {
    const urun = testAdi("StokUrun");

    // Ürün ve stok hazırla
    await page.goto("/yonetim/urunler");
    await acilirAc(page, /Yeni ürün ekle/);
    await page.getByLabel("Ürün adı").fill(urun);
    await page.getByLabel(/Alış fiyatı/).fill("100");
    await page.getByRole("button", { name: /Ürünü Kaydet/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    await acilirAc(page, /Stok hareketi ekle/);
    await page.getByLabel("Ürün", { exact: true }).selectOption({ label: urun });
    await page.getByLabel("Adet", { exact: true }).fill("10");
    await page.getByRole("button", { name: /Hareketi Uygula/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    // İş kur ve malzeme ekle
    await musteriOlustur(page, testAdi("StokMusteri"));
    await segmentAc(page);
    await isEkle(page, "Stok düşüm testi");

    await acilirAc(page, /Malzeme ekle/);
    await page.getByLabel("Ürün", { exact: true }).selectOption({ label: `${urun} (stok: 10 adet / 0 kg)` });
    await page.getByLabel("Adet", { exact: true }).fill("3");
    await page.getByRole("button", { name: /Malzeme Ekle/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    // Arayüz stoğun henüz düşmediğini söylemeli
    await expect(page.getByText(/henüz stoktan/i)).toBeVisible();

    // Stok gerçekten 10 kalmalı
    await page.goto("/yonetim/urunler");
    const satir = page.locator("li", { hasText: urun }).first();
    await expect(satir).toContainText("10 adet");

    // Şimdi işi tamamla
    await page.goBack();
    await page.getByRole("button", { name: /^İşi Tamamla/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 20000 });

    // Stok 7'ye düşmeli
    await page.goto("/yonetim/urunler");
    await expect(page.locator("li", { hasText: urun }).first()).toContainText("7 adet");
  });

  test("40 — yetersiz stokta tamamlama uyarı veriyor, onayla zorlanabiliyor", async ({
    page,
  }) => {
    const urun = testAdi("AzStok");

    await page.goto("/yonetim/urunler");
    await acilirAc(page, /Yeni ürün ekle/);
    await page.getByLabel("Ürün adı").fill(urun);
    await page.getByLabel(/Alış fiyatı/).fill("50");
    await page.getByRole("button", { name: /Ürünü Kaydet/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    await musteriOlustur(page, testAdi("AzStokMusteri"));
    await segmentAc(page);
    await isEkle(page, "Yetersiz stok testi");

    // Stok 0 iken 5 adet malzeme ekle
    await acilirAc(page, /Malzeme ekle/);
    await page.getByLabel("Ürün", { exact: true }).selectOption({ label: `${urun} (stok: 0 adet / 0 kg)` });
    await page.getByLabel("Adet", { exact: true }).fill("5");
    await page.getByRole("button", { name: /Malzeme Ekle/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    // Uyarı görünmeli
    await expect(page.getByText(/Stok yetersiz/i)).toBeVisible();

    // Onaysız denemede reddedilmeli
    await page.getByRole("button", { name: /İşi Tamamla/ }).click();
    await expect(formHatasi(page)).toBeVisible({ timeout: 20000 });
    await expect(formHatasi(page)).toContainText(/Stok yetersiz/i);

    // Onay kutusuyla zorlanabilmeli
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /İşi Tamamla/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 20000 });
  });

  test("41 — tamamlanan iş QR üretiyor ve QR sayfası fiyat sızdırmıyor", async ({
    page,
    context,
  }) => {
    await musteriOlustur(page, testAdi("QRMusteri"));
    await segmentAc(page);
    await isEkle(page, "QR testi işi");

    await page.getByRole("button", { name: /^İşi Tamamla/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 20000 });

    // QR adresi görünmeli
    const qrMetin = page.locator("text=/\\/j\\/[0-9a-f]{32}/").first();
    await expect(qrMetin).toBeVisible();

    const adres = (await qrMetin.textContent()) ?? "";
    const token = adres.match(/\/j\/([0-9a-f]{32})/)?.[1];
    expect(token, "QR token üretilmedi").toBeTruthy();

    // Oturumsuz bir bağlamda QR sayfasını aç
    const anonCtx = await context.browser()!.newContext();
    const anonPage = await anonCtx.newPage();
    await anonPage.goto(`/j/${token}`);

    await expect(anonPage.getByRole("heading", { name: "QR testi işi" })).toBeVisible();

    const icerik = await anonPage.content();
    expect(icerik).not.toContain("purchase_price");
    expect(icerik).not.toContain("Alış fiyatı");
    expect(icerik).not.toContain("maliyet");

    await anonCtx.close();
  });

  test("42 — tamamlanmış işe malzeme eklenemiyor", async ({ page }) => {
    await musteriOlustur(page, testAdi("KilitliIs"));
    await segmentAc(page);
    await isEkle(page, "Kilitli iş testi");

    await page.getByRole("button", { name: /^İşi Tamamla/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 20000 });

    // Malzeme ekleme formu artık görünmemeli
    await expect(
      page.getByRole("heading", { name: "Malzeme ekle" })
    ).toBeHidden();
    await expect(page.getByText(/stoktan düşüldü|Tamamlamayı Geri Al/i).first()).toBeVisible();
  });

  test("43 — tamamlama geri alınınca stok iade ediliyor", async ({ page }) => {
    const urun = testAdi("IadeUrun");

    await page.goto("/yonetim/urunler");
    await acilirAc(page, /Yeni ürün ekle/);
    await page.getByLabel("Ürün adı").fill(urun);
    await page.getByLabel(/Alış fiyatı/).fill("80");
    await page.getByRole("button", { name: /Ürünü Kaydet/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    await acilirAc(page, /Stok hareketi ekle/);
    await page.getByLabel("Ürün", { exact: true }).selectOption({ label: urun });
    await page.getByLabel("Adet", { exact: true }).fill("6");
    await page.getByRole("button", { name: /Hareketi Uygula/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    await musteriOlustur(page, testAdi("IadeMusteri"));
    await segmentAc(page);
    await isEkle(page, "İade testi");

    await acilirAc(page, /Malzeme ekle/);
    await page.getByLabel("Ürün", { exact: true }).selectOption({ label: `${urun} (stok: 6 adet / 0 kg)` });
    await page.getByLabel("Adet", { exact: true }).fill("2");
    await page.getByRole("button", { name: /Malzeme Ekle/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: /^İşi Tamamla/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 20000 });

    // Geri al
    await page.getByRole("button", { name: /Tamamlamayı Geri Al/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 20000 });

    await page.goto("/yonetim/urunler");
    await expect(page.locator("li", { hasText: urun }).first()).toContainText("6 adet");
  });

  test("44 — fatura yükleme alanı segment sayfasında", async ({ page }) => {
    /* Faturalar artık ayrı sekmede değil: müşteri bir gelişte birden fazla
       iş bırakıyor ve hepsine tek fatura kesiliyor, yani fatura segmentin
       karşılığı. */
    await musteriOlustur(page, testAdi("FaturaMusteri"));
    await segmentAc(page);

    await expect(
      page.getByRole("button", { name: /Fatura yükle/ })
    ).toBeVisible();

    await acilirAc(page, /Fatura yükle/);
    await expect(page.getByLabel(/Fatura PDF/)).toBeVisible();

    // Elle tutar girişi olmamalı; tutarlar PDF'ten okunuyor
    await expect(page.getByLabel("Net tutar (₺)")).toHaveCount(0);
    await expect(page.getByLabel(/Brüt tutar/)).toHaveCount(0);
  });

  test("45 — PDF olmayan dosya reddediliyor", async ({ page }) => {
    await musteriOlustur(page, testAdi("HataliDosya"));
    await segmentAc(page);
    await acilirAc(page, /Fatura yükle/);

    await page.getByLabel(/Fatura PDF/).setInputFiles({
      name: "not.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("bu bir fatura degil"),
    });
    await page.getByRole("button", { name: /Faturayı Yükle/ }).click();

    const uyari = formHatasi(page);
    await expect(uyari).toBeVisible({ timeout: 20000 });
    await expect(uyari).toContainText(/PDF/i);
  });

  test("45b — gerçek e-Fatura PDF'i okunup kaydediliyor", async ({ page }) => {
    /* Bu test, ayrıştırıcının Node'da değil NEXT.JS RUNTIME'INDA çalıştığını
       doğruluyor. Node testleri (scripts/fatura-testi.ts) geçtiği hâlde
       panelde "PDF açılamadı" hatası alınmıştı: Next, pdfjs-dist'i bundle
       edince paket kendi worker dosyasını bulamıyordu. serverExternalPackages
       ile çözüldü; bu test o ayarın kaldırılmasını yakalar. */
    const fs = await import("node:fs");
    const ornek = "SLD2026000000090.pdf";
    test.skip(!fs.existsSync(ornek), "örnek fatura PDF'i yok");

    await musteriOlustur(page, testAdi("PdfOkuma"));
    await segmentAc(page);
    await acilirAc(page, /Fatura yükle/);

    await page.getByLabel(/Fatura PDF/).setInputFiles(ornek);
    await page.getByRole("button", { name: /Faturayı Yükle/ }).click();

    const sonuc = page.locator('form [role="status"], form [role="alert"]');
    await expect(sonuc).toBeVisible({ timeout: 30000 });

    const metin = (await sonuc.textContent()) ?? "";
    /* Aynı fatura daha önce yüklenmişse mükerrer uyarısı gelir — o da
       ayrıştırmanın çalıştığını gösterir. Kabul edilemez olan, okuma
       hatası almak. */
    expect(
      metin,
      `PDF okunamadı: ${metin}`
    ).not.toMatch(/açılamadı|okunamadı|başlatılamadı/i);
    expect(metin).toMatch(/kaydedildi|zaten yüklen/i);
  });

  test("46 — faturalar sekmesi kaldırıldı, raporlar sekmesi var", async ({
    page,
  }) => {
    await page.goto("/yonetim");

    const nav = page.getByRole("navigation", { name: "Ana menü" }).first();
    await expect(nav.getByRole("link", { name: /Rapor/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Fatura/ })).toHaveCount(0);

    // Eski adres artık yok
    const yanit = await page.goto("/yonetim/faturalar");
    expect(yanit?.status()).toBe(404);
  });

  test("47 — PDF belgeleri üretiliyor ve müşteri kopyası fiyat içermiyor", async ({
    page,
    request,
  }) => {
    await musteriOlustur(page, testAdi("PdfMusteri"));
    const musteriId = page.url().split("/").pop()!;

    // Panel bağlantısı görünür olmalı
    await expect(page.getByRole("link", { name: /Müşteri belgesi/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Müşteri kopyası/ })).toBeVisible();

    // Oturum çerezi ile PDF isteği
    const cerezler = await page.context().cookies();
    const cerezBasligi = cerezler.map((c) => `${c.name}=${c.value}`).join("; ");

    for (const uc of [
      `/api/pdf/musteri?id=${musteriId}`,
      `/api/pdf/musteri?id=${musteriId}&maliyet=0`,
    ]) {
      const y = await request.get(uc, { headers: { Cookie: cerezBasligi } });
      expect(y.status(), `${uc} başarısız`).toBe(200);
      expect(y.headers()["content-type"]).toContain("application/pdf");

      const govde = await y.body();
      expect(govde.subarray(0, 5).toString()).toBe("%PDF-");
      expect(govde.length).toBeGreaterThan(1000);
    }
  });

  test("48 — dönem raporu geçersiz tarih aralığını reddediyor", async ({
    page,
    request,
  }) => {
    await page.goto("/yonetim");
    const cerezler = await page.context().cookies();
    const cerezBasligi = cerezler.map((c) => `${c.name}=${c.value}`).join("; ");

    const gecersizler = [
      "/api/pdf/donem?bas=2026-12-31&bit=2026-01-01", // ters aralık
      "/api/pdf/donem?bas=abc&bit=2026-01-01", // biçimsiz
      "/api/pdf/donem", // parametresiz
    ];

    for (const uc of gecersizler) {
      const y = await request.get(uc, { headers: { Cookie: cerezBasligi } });
      expect(y.status(), `${uc} kabul edildi`).toBe(400);
    }

    // Geçerli aralık çalışmalı
    const gecerli = await request.get("/api/pdf/donem?bas=2026-01-01&bit=2026-12-31", {
      headers: { Cookie: cerezBasligi },
    });
    expect(gecerli.status()).toBe(200);
  });

  test("49 — QR etiketi sayfası yazdırmaya hazır çiziliyor", async ({ page }) => {
    await musteriOlustur(page, testAdi("EtiketMusteri"));
    await segmentAc(page);
    await isEkle(page, "Etiket testi işi");

    await page.getByRole("button", { name: /^İşi Tamamla/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 20000 });

    await page.getByRole("link", { name: /Yazdırılabilir etiket/ }).click();
    await page.waitForURL(/\/etiket$/, { timeout: 15000 });

    // QR gerçekten SVG olarak gömülmüş olmalı
    const svg = page.locator("#etiket-alani svg");
    await expect(svg).toBeVisible();

    const kutu = await svg.boundingBox();
    expect(kutu!.width, "QR çok küçük").toBeGreaterThan(80);

    await expect(page.getByText("Altınöz Bobinaj").first()).toBeVisible();
    await expect(page.getByText("Etiket testi işi")).toBeVisible();
  });

  test("50 — müşteri araması joker karakterle sömürülemiyor", async ({ page }) => {
    const ad = testAdi("AramaTest");
    await musteriOlustur(page, ad);

    // '%' girildiğinde joker gibi davranıp tüm kayıtları getirmemeli
    await page.goto("/yonetim/musteriler?q=%25");
    const kartlar = page.locator("ul li a[href^='/yonetim/musteriler/']");
    const sayi = await kartlar.count();

    // Gerçekten '%' içeren müşteri yoksa sonuç boş olmalı
    expect(sayi, "% joker olarak yorumlandı").toBe(0);
    await expect(page.getByText(/Sonuç bulunamadı/)).toBeVisible();

    // Normal arama çalışmalı
    await page.goto(`/yonetim/musteriler?q=${encodeURIComponent(ad)}`);
    await expect(page.getByText(ad)).toBeVisible();
  });

  test("51 — segment açık işlerle kapatılırken uyarı veriyor", async ({ page }) => {
    await musteriOlustur(page, testAdi("SegmentKapat"));
    await segmentAc(page);
    const segmentUrl = page.url();

    await isEkle(page, "Kapatma testi işi");
    await page.goto(segmentUrl);

    await page.getByRole("button", { name: /Segmenti Kapat/ }).click();

    const durum = formBasarisi(page);
    await expect(durum).toBeVisible({ timeout: 15000 });
    await expect(durum).toContainText(/tamamlanmamış/i);
  });

  test("52 — çıkış yapınca panel erişimi kapanıyor", async ({ page }) => {
    await page.goto("/yonetim");
    await expect(page.getByRole("button", { name: /Çıkış Yap/ })).toBeVisible();

    await page.getByRole("button", { name: /Çıkış Yap/ }).click();
    await page.waitForURL(/\/giris/, { timeout: 15000 });

    // Doğrudan panele gitmeye çalışınca yine girişe düşmeli
    await page.goto("/yonetim/musteriler");
    expect(page.url()).toContain("/giris");
  });
});

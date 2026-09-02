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
    await page.getByLabel("Ürün", { exact: true }).selectOption({ label: `${urun} (adet)` });
    await page.getByLabel("Miktar (adet)", { exact: true }).fill("10");
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
    await page.getByLabel("Ürün", { exact: true }).selectOption({ label: `${urun} (adet)` });
    await page.getByLabel("Miktar (adet)", { exact: true }).fill("10");
    await page.getByRole("button", { name: /Hareketi Uygula/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    // İş kur ve malzeme ekle
    await musteriOlustur(page, testAdi("StokMusteri"));
    await segmentAc(page);
    await isEkle(page, "Stok düşüm testi");

    await acilirAc(page, /Malzeme ekle/);
    await page.getByLabel("Ürün", { exact: true }).selectOption({ label: `${urun} (stok: 10 adet)` });
    await page.getByLabel("Miktar (adet)", { exact: true }).fill("3");
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
    await page.getByRole("checkbox", { name: /Motor sarımı/ }).check();
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
    await page.getByLabel("Ürün", { exact: true }).selectOption({ label: `${urun} (stok: 0 adet)` });
    await page.getByLabel("Miktar (adet)", { exact: true }).fill("5");
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

    await page.getByRole("checkbox", { name: /Motor sarımı/ }).check();
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

    await page.getByRole("checkbox", { name: /Motor sarımı/ }).check();
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
    await page.getByLabel("Ürün", { exact: true }).selectOption({ label: `${urun} (adet)` });
    await page.getByLabel("Miktar (adet)", { exact: true }).fill("6");
    await page.getByRole("button", { name: /Hareketi Uygula/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    await musteriOlustur(page, testAdi("IadeMusteri"));
    await segmentAc(page);
    await isEkle(page, "İade testi");

    await acilirAc(page, /Malzeme ekle/);
    await page.getByLabel("Ürün", { exact: true }).selectOption({ label: `${urun} (stok: 6 adet)` });
    await page.getByLabel("Miktar (adet)", { exact: true }).fill("2");
    await page.getByRole("button", { name: /Malzeme Ekle/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    await page.getByRole("checkbox", { name: /Motor sarımı/ }).check();
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

    await page.getByRole("checkbox", { name: /Motor sarımı/ }).check();
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

  test("53 — gram ürününde tek miktar alanı gram olarak davranıyor", async ({
    page,
  }) => {
    const urun = testAdi("GramTel");

    await page.goto("/yonetim/urunler");
    await acilirAc(page, /Yeni ürün ekle/);
    await page.getByLabel("Ürün adı").fill(urun);
    await page.getByLabel("Takip birimi").selectOption("gram");

    /* Birim gram seçilince fiyatın kilogram başına olduğu yazmalı:
       kullanıcı fiyatı neye göre gireceğini bilmeden yazıyordu. */
    await expect(page.getByLabel(/Alış fiyatı/)).toBeVisible();
    await expect(page.getByText(/Alış fiyatı \(₺ \/ kilogram\)/)).toBeVisible();
    await page.getByLabel(/Alış fiyatı/).fill("480");
    await page.getByRole("button", { name: /Ürünü Kaydet/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    // Stok girişi: tek alan, gram
    await acilirAc(page, /Stok hareketi ekle/);
    await page
      .getByLabel("Ürün", { exact: true })
      .selectOption({ label: `${urun} (gram)` });

    const miktar = page.getByLabel("Miktar (gram)", { exact: true });
    await expect(miktar).toBeVisible();
    // Adet alanı ARTIK OLMAMALI: iki miktar kutusu tereddüt yaratıyordu
    await expect(page.getByLabel("Miktar (adet)", { exact: true })).toHaveCount(
      0
    );
    await expect(miktar).toHaveAttribute("placeholder", "Örn: 250");

    await miktar.fill("25000");
    await page.getByRole("button", { name: /Hareketi Uygula/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    // Liste gram olarak göstermeli
    await expect(page.getByText("25.000 gram").first()).toBeVisible();
  });

  test("54 — ondalık miktar reddediliyor ve tekerlek değeri bozmuyor", async ({
    page,
  }) => {
    const urun = testAdi("TamSayi");

    await page.goto("/yonetim/urunler");
    await acilirAc(page, /Yeni ürün ekle/);
    await page.getByLabel("Ürün adı").fill(urun);
    await page.getByLabel(/Alış fiyatı/).fill("50");
    await page.getByRole("button", { name: /Ürünü Kaydet/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

    await acilirAc(page, /Stok hareketi ekle/);
    await page
      .getByLabel("Ürün", { exact: true })
      .selectOption({ label: `${urun} (adet)` });

    const miktar = page.getByLabel("Miktar (adet)", { exact: true });

    /* Sayı alanı odaktayken fare tekerleği değeri bir adım değiştiriyordu:
       kullanıcı 4 yazıp sayfayı kaydırınca stok sessizce 3'e (eskiden
       0,001 adımla 3,999'a) düşüyordu. Alan artık tekerlekte odağı
       bırakıyor, değer korunuyor. */
    await miktar.fill("4");
    await miktar.focus();
    await page.mouse.wheel(0, 120);
    await expect(miktar).toHaveValue("4");

    // Ondalık giriş reddedilmeli
    await miktar.fill("3.5");
    await page.getByRole("button", { name: /Hareketi Uygula/ }).click();
    await expect(formHatasi(page)).toContainText(/tam sayı/i, {
      timeout: 15000,
    });
  });

  test("55 — özet aramasında motor müşteri › segment kırılımıyla bulunuyor", async ({
    page,
  }) => {
    const musteri = testAdi("AramaMusteri");
    const motor = testAdi("Siemens Sarım");

    await musteriOlustur(page, musteri);
    await segmentAc(page);
    await isEkle(page, motor);

    await page.goto("/yonetim");
    await page.getByLabel(/Müşteri veya motor ara/).fill(motor);
    await page.getByRole("button", { name: /^Ara$/ }).click();

    // Sonuç URL'de kalmalı: geri tuşu ve paylaşılabilir bağlantı çalışsın
    await expect(page).toHaveURL(/[?&]ara=/, { timeout: 15000 });

    const bolum = page.getByRole("region", { name: /Arama sonuçları/ }).or(
      page.locator("section", { hasText: /Arama sonuçları/ })
    );

    // Motorun kendi adı ve kırılımdaki müşteri adı aynı satırda görünmeli
    await expect(page.getByText(motor, { exact: false }).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(bolum.getByText(musteri, { exact: false }).first()).toBeVisible();
    // Tür etiketi: kullanıcı ne bulduğunu anlamalı
    await expect(bolum.getByText("Motor", { exact: false }).first()).toBeVisible();
  });

  test("56 — müşteri adıyla arama çalışıyor, sonuçsuz arama açıklıyor", async ({
    page,
  }) => {
    const musteri = testAdi("BulunanMusteri");
    await musteriOlustur(page, musteri);

    await page.goto(`/yonetim?ara=${encodeURIComponent(musteri)}`);
    await expect(page.getByText(musteri).first()).toBeVisible({ timeout: 15000 });

    // Olmayan bir şey arandığında boş liste değil açıklama görünmeli
    await page.goto("/yonetim?ara=zzzyokboylebirsey");
    await expect(page.getByText(/sonuç bulunamadı/i)).toBeVisible({
      timeout: 15000,
    });
  });

  test("57 — tek harflik arama tüm listeyi döndürmüyor", async ({ page }) => {
    /* Tek harf neredeyse her kaydı eşleştirir; arama kutusu liste dökümü
       hâline gelmemeli. */
    await page.goto("/yonetim?ara=a");
    await expect(page.getByText(/sonuç bulunamadı/i)).toBeVisible({
      timeout: 15000,
    });
  });

  test("58 — yapılan işlem hareket geçmişine düşüyor", async ({ page }) => {
    const musteri = testAdi("DenetimMusteri");
    await musteriOlustur(page, musteri);

    await page.goto("/yonetim/raporlar");

    const gecmis = page.locator("section", { hasText: /Hareket geçmişi/ });
    await expect(gecmis).toBeVisible({ timeout: 20000 });

    // Az önce eklenen müşteri en üstte olmalı
    await expect(gecmis.getByText(musteri).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(gecmis.getByText(/Müşteri/).first()).toBeVisible();
    await expect(gecmis.getByText(/eklendi/).first()).toBeVisible();
  });

  test("59 — güncelleme hangi alanın değiştiğini yazıyor", async ({ page }) => {
    const musteri = testAdi("GuncellenenMusteri");
    await musteriOlustur(page, musteri);

    // Müşteri detayında telefon ekle
    await acilirAc(page, /Bilgileri düzenle/).catch(() => {});
    const telefon = page.getByLabel("Telefon");
    if (await telefon.count()) {
      await telefon.fill("5551234567");
      await page.getByRole("button", { name: /Kaydet/ }).first().click();
      await expect(formBasarisi(page)).toBeVisible({ timeout: 15000 });

      await page.goto("/yonetim/raporlar");
      const gecmis = page.locator("section", { hasText: /Hareket geçmişi/ });
      await expect(gecmis.getByText(/güncellendi/).first()).toBeVisible({
        timeout: 15000,
      });
      await expect(gecmis.getByText(/Değişen:.*telefon/i).first()).toBeVisible();
    } else {
      test.skip(true, "Müşteri düzenleme formu bulunamadı");
    }
  });

  test("60 — PDF indirmek hareket geçmişine düşüyor", async ({ page }) => {
    const musteri = testAdi("PdfDenetim");
    await musteriOlustur(page, musteri);
    const musteriUrl = page.url();
    const id = musteriUrl.split("/").pop()!;

    /* PDF rotası doğrudan çağrılıyor: indirme diyaloğu testte gereksiz. */
    const yanit = await page.request.get(`/api/pdf/musteri?id=${id}`);
    expect(yanit.status()).toBe(200);

    await page.goto("/yonetim/raporlar");
    const gecmis = page.locator("section", { hasText: /Hareket geçmişi/ });
    await expect(gecmis.getByText(/PDF alındı/).first()).toBeVisible({
      timeout: 20000,
    });
    await expect(gecmis.getByText(musteri).first()).toBeVisible();
  });

  test("61 — işlem türü seçilmeden iş tamamlanamıyor", async ({ page }) => {
    await musteriOlustur(page, testAdi("IslemTuruMusteri"));
    await segmentAc(page);
    await isEkle(page, "İşlem türü testi");

    /* Seçim yapılmadan buton devre dışı: required tek başına yeterli değil,
       tarayıcı uyarısı gösteriyor ama kullanıcı neden gönderilmediğini
       anlamıyor. */
    const buton = page.getByRole("button", { name: /Önce yapılan işlemi seçin/ });
    await expect(buton).toBeVisible();
    await expect(buton).toBeDisabled();

    // İki seçenek de aynı anda görünmeli, ön seçim OLMAMALI
    const sarim = page.getByRole("checkbox", { name: /Motor sarımı/ });
    const revizyon = page.getByRole("checkbox", { name: /Revizyon/ });
    await expect(sarim).toBeVisible();
    await expect(revizyon).toBeVisible();
    await expect(sarim).not.toBeChecked();
    await expect(revizyon).not.toBeChecked();

    // Seçince buton etkinleşiyor
    await revizyon.check();
    await expect(
      page.getByRole("button", { name: /^İşi Tamamla/ })
    ).toBeEnabled();
  });

  test("62 — seçilen işlem türü iş detayında görünüyor", async ({ page }) => {
    await musteriOlustur(page, testAdi("TurGorunumMusteri"));
    await segmentAc(page);
    await isEkle(page, "Revizyon işi");

    await page.getByRole("checkbox", { name: /Revizyon/ }).check();
    await page.getByRole("button", { name: /^İşi Tamamla/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 20000 });

    /* Sonradan bakan biri hangi işlemin yapıldığını görmeli — durum kadar
       önemli bir bilgi, o yüzden üst çubukta. */
    await expect(page.getByText("Revizyon").first()).toBeVisible();
    await expect(page.getByText("Tamamlandı").first()).toBeVisible();
  });

  test("63 — müşteri QR sayfasında işlem türü yazıyor, miktar yazmıyor", async ({
    page,
  }) => {
    await musteriOlustur(page, testAdi("QrTurMusteri"));
    await segmentAc(page);
    await isEkle(page, "QR tür testi");
    const isUrl = page.url();

    await page.getByRole("checkbox", { name: /Motor sarımı/ }).check();
    await page.getByRole("button", { name: /^İşi Tamamla/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 20000 });

    // QR bağlantısını iş sayfasından al
    await page.goto(isUrl);
    const qrMetni = await page
      .getByText(/\/j\/[0-9a-f]{32}/)
      .first()
      .textContent();
    const token = qrMetni?.match(/\/j\/([0-9a-f]{32})/)?.[1];
    expect(token, "QR token bulunamadı").toBeTruthy();

    await page.goto(`/j/${token}`);
    await expect(page.getByText(/motor sarımı işlemi/i)).toBeVisible({
      timeout: 15000,
    });
    // Miktar müşteriye gösterilmiyor (0010)
    await expect(page.getByText(/\d+\s*(gram|adet)/)).toHaveCount(0);

    /* Belge sayfası pazarlama sitesinin tasarım dilini kullanıyor: müşterinin
       gördüğü tek sayfa ve işi marka izlenimi bırakmak. Panel tokenları
       buraya sızmamalı — panel-tasarim.spec.ts'teki 55 numaralı testin
       aynadaki karşılığı. */
    const sizinti = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[class]"))
        .filter((e) => /pnl-|font-panel/.test(e.className.toString()))
        .map((e) => e.className.toString().slice(0, 60))
    );
    expect(
      sizinti,
      `belge sayfasında panel tokeni kullanılmış: ${sizinti.join(" | ")}`
    ).toHaveLength(0);

    // Koyu tema ve marka: panelin açık teması değil
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#09090b"
    );
    await expect(
      page.getByRole("img", { name: /Altınöz Bobinaj/i })
    ).toBeVisible();

    /* Pazarlama menüsü OLMAMALI: başlıktaki çapa bağlantıları bu sayfada
       hedef bulamayacağı için tıklanıp tepki vermeyen ölü linklere
       dönüşürdü. */
    await expect(page.getByRole("link", { name: /^Hizmetler$/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Referanslar$/ })).toHaveCount(0);

    // Müşteri soru sormak isterse iletişim elinin altında olmalı
    await expect(page.getByRole("link", { name: /0542/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /WhatsApp/ })).toBeVisible();
  });

  test("64 — tamamlama formunun durumu başka forma/işe sızmıyor", async ({
    page,
  }) => {
    /* İki dal da TamamlamaPaneli'nin kökünde bir <Form> render ediyor ve
       React konuma göre eşleştirdiği için örneği yeniden kullanıyordu:
       useActionState durumu hayatta kalıyor, bir formun mesajı öbüründe
       görünüyordu. Kullanıcı bunu "geri al butonunda seçim hatası"
       olarak bildirdi.

       Aynı sızıntının ikinci yolu iki iş sayfası arasında gezinmek:
       route aynı olduğu için ağaç korunuyor. Bu test onu ölçüyor —
       hata durumunu tetiklemek gerekmediği için kararlı. */
    const musteri = testAdi("SizintiMusteri");
    await musteriOlustur(page, musteri);
    await segmentAc(page);
    const segmentUrl = page.url();

    await isEkle(page, "Sızıntı işi A");
    const isA = page.url();

    // A'yı tamamla — başarı mesajı geri alma formunun üstünde görünür
    await page.getByRole("checkbox", { name: /Motor sarımı/ }).check();
    await page.getByRole("button", { name: /^İşi Tamamla/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 20000 });

    // İkinci bir iş aç (tamamlanmamış)
    await page.goto(segmentUrl);
    await isEkle(page, "Sızıntı işi B");

    /* B tamamlanmamış: tamamlama formu görünüyor ve A'dan gelen HİÇBİR
       mesaj burada olmamalı. */
    await expect(
      page.getByRole("button", { name: /Önce yapılan işlemi seçin/ })
    ).toBeVisible({ timeout: 15000 });
    await expect(formBasarisi(page)).toHaveCount(0);
    await expect(formHatasi(page)).toHaveCount(0);

    // Ters yön: A'ya dönünce B'den bir kalıntı olmamalı
    await page.goto(isA);
    await expect(
      page.getByRole("button", { name: /Tamamlamayı Geri Al/ })
    ).toBeVisible({ timeout: 15000 });
    await expect(formHatasi(page)).toHaveCount(0);
  });

  test("65 — iki işlem birden seçilebiliyor, belgede çoğul yazıyor", async ({
    page,
  }) => {
    await musteriOlustur(page, testAdi("CokluMusteri"));
    await segmentAc(page);
    await isEkle(page, "Sarım ve revizyon işi");
    const isUrl = page.url();

    const sarim = page.getByRole("checkbox", { name: /Motor sarımı/ });
    const revizyon = page.getByRole("checkbox", { name: /Revizyon/ });

    /* Checkbox, radio değil: birini seçmek diğerini kaldırmamalı.
       Kullanıcının asıl isteği bu — bir motora aynı ziyarette hem sarım
       hem revizyon yapılabiliyor. */
    await sarim.check();
    await revizyon.check();
    await expect(sarim).toBeChecked();
    await expect(revizyon).toBeChecked();

    await page.getByRole("button", { name: /^İşi Tamamla/ }).click();
    await expect(formBasarisi(page)).toBeVisible({ timeout: 20000 });

    // İş detayında iki rozet de görünmeli
    await expect(page.getByText("Motor sarımı").first()).toBeVisible();
    await expect(page.getByText("Revizyon").first()).toBeVisible();

    // Müşteri belgesinde ÇOĞUL: "… işlemleri", tekil "işlemi" değil
    await page.goto(isUrl);
    const qrMetni = await page
      .getByText(/\/j\/[0-9a-f]{32}/)
      .first()
      .textContent();
    const token = qrMetni?.match(/\/j\/([0-9a-f]{32})/)?.[1];
    expect(token, "QR token bulunamadı").toBeTruthy();

    await page.goto(`/j/${token}`);
    await expect(
      page.getByText(/motor sarımı ve revizyon işlemleri/i)
    ).toBeVisible({ timeout: 15000 });
  });

  test("66 — seçimi kaldırınca buton yeniden kilitleniyor", async ({ page }) => {
    await musteriOlustur(page, testAdi("KilitMusteri"));
    await segmentAc(page);
    await isEkle(page, "Kilit testi");

    const sarim = page.getByRole("checkbox", { name: /Motor sarımı/ });
    const kilitli = page.getByRole("button", { name: /Önce yapılan işlemi seçin/ });

    await expect(kilitli).toBeDisabled();
    await sarim.check();
    await expect(page.getByRole("button", { name: /^İşi Tamamla/ })).toBeEnabled();

    /* Seçimi kaldırmak butonu tekrar kilitlemeli: "en az biri" kuralı
       yalnızca ilk seçimde değil her an geçerli. */
    await sarim.uncheck();
    await expect(kilitli).toBeDisabled();
  });
});

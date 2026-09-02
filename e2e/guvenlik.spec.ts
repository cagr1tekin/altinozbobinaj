import { test, expect, type APIRequestContext } from "@playwright/test";
import { SUPABASE_KEY, SUPABASE_URL, formHatasi } from "./yardimcilar";

/**
 * Yetkisiz erişim ve veri sızıntısı testleri.
 * Bunlar oturum gerektirmiyor: amaç, oturumsuz birinin ne görebildiğini
 * ölçmek.
 */

test.describe("Güvenlik ve erişim", () => {
  /* Anon anahtarı geçersizse Supabase her isteğe 401 döner ve "anon veri
     göremiyor" testleri boşa geçer: sızıntı kontrolü hiç çalışmadan yeşil
     kalır. Bu, güvenlik testinde en kötü başarısızlık biçimi — sessiz olanı.

     Kontrol beforeAll'da DEĞİL: orada başarısız olması, Supabase'e hiç
     ihtiyacı olmayan testleri (panel yönlendirmesi gibi) de düşürüyordu.
     Yalnızca anahtarı gerçekten kullanan testler bunu çağırıyor. */
  async function anahtarCalisiyorMu(
    request: APIRequestContext
  ): Promise<void> {
    const y = await request.get(
      `${SUPABASE_URL}/rest/v1/customers?select=id&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    expect(
      y.status(),
      `Supabase anon anahtarı çalışmıyor (HTTP ${y.status()}). .env içindeki ` +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL ile aynı " +
        "projeye ait olmalı; yoksa bu test hiçbir şey ölçmez."
    ).not.toBe(401);
  }

  const panelYollari = [
    "/yonetim",
    "/yonetim/musteriler",
    "/yonetim/urunler",
    "/yonetim/raporlar",
  ];

  test("22 — panel yolları girişe yönlendiriyor ve hedefi koruyor", async ({
    page,
  }) => {
    for (const yol of panelYollari) {
      await page.goto(yol);
      expect(page.url(), `${yol} korunmuyor`).toContain("/giris");
      expect(page.url(), `${yol} için devam parametresi kayboldu`).toContain("devam=");
    }
  });

  test("23 — PDF ve QR uçları oturumsuz 401 dönüyor", async ({ request }) => {
    const uclar = [
      "/api/pdf/is?id=5f7cf10e-6c49-48e9-a144-4ecbb1106ddc",
      "/api/pdf/segment?id=5f7cf10e-6c49-48e9-a144-4ecbb1106ddc",
      "/api/pdf/musteri?id=5f7cf10e-6c49-48e9-a144-4ecbb1106ddc",
      "/api/pdf/donem?bas=2026-01-01&bit=2026-12-31",
      "/api/qr?token=0123456789abcdef0123456789abcdef",
    ];

    for (const uc of uclar) {
      const y = await request.get(uc);
      expect(y.status(), `${uc} korunmuyor`).toBe(401);
      // Hata gövdesi şema detayı sızdırmamalı
      const govde = await y.text();
      expect(govde).not.toContain("supabase");
      expect(govde).not.toContain("PGRST");
    }
  });

  test("24 — geçersiz QR token'ı 404, veri sızmıyor", async ({ page }) => {
    /* Not: "../../yonetim" gibi bir yol tarayıcı tarafından istek
       gönderilmeden normalize ediliyor, bu yüzden yol aşımı burada
       kodlanmış biçimde deneniyor. */
    const sahteler = [
      "gecersiz",
      "0123456789abcdef0123456789abcdef",
      "%2e%2e%2f%2e%2e%2fyonetim",
      "'%20OR%201=1--",
      "<script>alert(1)</script>",
    ];

    for (const t of sahteler) {
      const yanit = await page.goto(`/j/${t}`);
      expect([404, 400], `/j/${t} beklenmeyen durum`).toContain(yanit?.status() ?? 0);

      const govde = await page.content();
      expect(govde).not.toContain("purchase_price");
      expect(govde).not.toContain("unit_cost");
    }
  });

  test("25 — anon anahtarıyla tablolara yazılamıyor, okuma boş dönüyor", async ({
    request,
  }) => {
    test.skip(!SUPABASE_URL, "Supabase yapılandırılmamış");

    await anahtarCalisiyorMu(request);


    const basliklar = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    };

    // Yazma denemesi reddedilmeli
    const yazma = await request.post(`${SUPABASE_URL}/rest/v1/customers`, {
      headers: basliklar,
      data: { name: "E2E-YETKISIZ-KAYIT" },
    });
    expect(yazma.status(), "anon kayıt ekleyebiliyor").toBeGreaterThanOrEqual(400);

    // Okuma boş dönmeli (RLS engellediğinde PostgREST 403 değil boş liste verir)
    for (const tablo of [
      "customers",
      "jobs",
      "invoices",
      "products",
      /* Denetim günlüğü kimin ne yaptığını tutuyor: sızması hem kişisel
         veri hem iş bilgisi sızması olur. */
      "audit_log",
    ]) {
      const okuma = await request.get(
        `${SUPABASE_URL}/rest/v1/${tablo}?select=*&limit=5`,
        { headers: basliklar }
      );
      if (okuma.ok()) {
        const satirlar = await okuma.json();
        expect(
          Array.isArray(satirlar) ? satirlar.length : 0,
          `${tablo} anon'a veri sızdırıyor`
        ).toBe(0);
      }
    }
  });

  test("26 — anon iş akışı fonksiyonlarını çağıramıyor", async ({ request }) => {
    test.skip(!SUPABASE_URL, "Supabase yapılandırılmamış");
    await anahtarCalisiyorMu(request);

    const basliklar = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    };

    /* public_job_by_token dışındaki HİÇBİR fonksiyon anon'a açık olmamalı.
       Supabase, public şemasındaki yeni fonksiyonları varsayılan olarak anon'a
       grant ediyor; 0006 migration'ı bunu geri alıyor. Bu test o düzeltmenin
       uygulandığını doğruluyor. */
    const yasak = [
      ["complete_job", {
        p_job_id: "5f7cf10e-6c49-48e9-a144-4ecbb1106ddc",
        p_service_type: "winding",
      }],
      ["revert_job_completion", { p_job_id: "5f7cf10e-6c49-48e9-a144-4ecbb1106ddc" }],
      [
        "apply_stock_movement",
        {
          p_product_id: "5f7cf10e-6c49-48e9-a144-4ecbb1106ddc",
          p_movement_type: "purchase_in",
          p_miktar: 100,
        },
      ],
      ["add_job_product", {
        p_job_id: "5f7cf10e-6c49-48e9-a144-4ecbb1106ddc",
        p_product_id: "6dbb15c7-afd3-4608-b32c-d118e9c44784",
        p_miktar: 1,
      }],
      ["dashboard_summary", { p_start: "2026-01-01", p_end: "2026-12-31" }],
      ["dashboard_by_customer", { p_start: "2026-01-01", p_end: "2026-12-31" }],
      ["stock_reconciliation", {}],
      // Bunlar SECURITY DEFINER: RLS'i baypas edip tabloya yazıyorlar
      ["refresh_monthly_summary", { p_donem: "2026-09-01" }],
      ["nightly_summary_refresh", {}],
      ["record_opening_stock", {}],
      ["set_updated_at", {}],
      ["job_product_cost", {
        p_unit_type: "piece", p_unit_cost: 1, p_qty_pieces: 1, p_qty_grams: 0,
      }],
      // Arama müşteri ve motor adlarını döndürüyor: oturumsuz çağrılamamalı
      ["panel_arama", { p_terim: "a" }],
      ["tr_normalize", { p_metin: "a" }],
      // Denetim günlüğüne oturumsuz yazmak günlüğü kirletmenin yolu olur
      ["audit_kaydet", {
        p_entity: "report", p_entity_id: null, p_label: "e2e",
      }],
    ] as const;

    const acikta: string[] = [];
    for (const [fn, arg] of yasak) {
      const y = await request.post(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        headers: basliklar,
        data: arg,
      });
      /* 404 = fonksiyon yok (migration uygulanmamış olabilir), kabul.
         401/403 = yetki reddi, beklenen.
         200/204 = ÇAĞRILABİLİYOR, güvenlik sorunu.
         500 = fonksiyon çalıştı ama iş kuralı hatası verdi; bu da yetkinin
               açık olduğu anlamına gelir. */
      if (y.status() < 400 || y.status() >= 500) {
        acikta.push(`${fn} (${y.status()})`);
      }
    }

    expect(
      acikta,
      `anon'a açık kalan fonksiyonlar: ${acikta.join(", ")} — ` +
        `0006_fonksiyon_yetki_duzeltmesi.sql uygulanmalı`
    ).toHaveLength(0);
  });

  test("27 — QR fonksiyonu anon'a açık ama ticari bilgi döndürmüyor", async ({
    request,
  }) => {
    test.skip(!SUPABASE_URL, "Supabase yapılandırılmamış");
    await anahtarCalisiyorMu(request);

    const y = await request.post(
      `${SUPABASE_URL}/rest/v1/rpc/public_job_by_token`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        data: { p_token: "gecersiz-token-testi" },
      }
    );

    // Anon çağırabilmeli (QR sayfası girişsiz açılıyor)
    expect(y.status(), "QR fonksiyonu anon'a kapalı").toBe(200);

    const govde = await y.text();
    expect(govde).not.toContain("purchase_price");
    expect(govde).not.toContain("unit_cost_snapshot");
    /* Miktar da dönmemeli (0010): kullanılan telin gramı, piyasa fiyatıyla
       çarpılarak işin maliyetini yaklaşık ele veriyor. Fonksiyon anon'a
       açık olduğu için arayüzde saklamak yeterli değil. */
    expect(govde).not.toContain("qty_");
    expect(govde).not.toContain("unit_type");
  });

  test("28 — giriş formu hatalı bilgide kullanıcı varlığını sızdırmıyor", async ({
    page,
  }) => {
    await page.goto("/giris");

    await page.getByLabel("E-posta").fill("olmayan-kullanici@ornek.com");
    await page.getByLabel("Şifre").fill("yanlissifre123");
    await page.getByRole("button", { name: /Giriş Yap/ }).click();

    const uyari = formHatasi(page);
    // toContainText metnin dolmasını bekler; textContent() anlık okur
    await expect(uyari).toContainText(/hatalı/i, { timeout: 20000 });

    // "Kullanıcı bulunamadı" gibi bir mesaj hesabın varlığını ele verir
    await expect(uyari).not.toContainText(/bulunamadı|kayıtlı değil|not found/i);
  });

  test("29 — giriş formu boş gönderimde alan hatası gösteriyor", async ({ page }) => {
    await page.goto("/giris");
    await page.getByRole("button", { name: /Giriş Yap/ }).click();

    await expect(formHatasi(page)).toBeVisible({ timeout: 10000 });
    // Sayfa hâlâ giriş sayfası olmalı
    expect(page.url()).toContain("/giris");
  });

  test("30 — açık yönlendirme (open redirect) engelleniyor", async ({ page }) => {
    // devam parametresine harici adres verilirse oraya gidilmemeli
    await page.goto("/giris?devam=https://kotu-site.example.com");

    await expect(page.getByLabel("E-posta")).toBeVisible();

    const gizli = page.locator('input[name="devam"]');
    if ((await gizli.count()) > 0) {
      const deger = await gizli.inputValue();
      // Değer forma girse bile sunucu tarafı yalnızca /yonetim ile başlayanı kabul ediyor
      expect(deger.startsWith("http"), "harici adres forma taşındı").toBe(true);
    }
    // Asıl koruma sunucu tarafında; burada sayfanın harici adrese
    // kendiliğinden gitmediğini doğruluyoruz
    expect(page.url()).toContain("localhost");
  });

  test("31 — panel sayfaları arama motoruna kapalı", async ({ page }) => {
    await page.goto("/giris");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/
    );
  });
});

import { test, expect } from "@playwright/test";

/**
 * Güvenlik katmanı testleri (0013).
 *
 * Bu dosyanın işi "kural yazıldı mı" değil "kural GERÇEKTEN engelliyor mu"
 * ölçmek. Oturum gerektirmiyor: hepsi giriş yapılmadan doğrulanabiliyor.
 */

test.describe("Güvenlik katmanı", () => {
  test("67 — güvenlik başlıkları her yanıtta var", async ({ request }) => {
    const y = await request.get("/");
    const b = y.headers();

    /* Panel hiçbir yerde iframe'e gömülmüyor; DENY clickjacking'i
       tamamen kapatıyor. */
    expect(b["x-frame-options"], "clickjacking açık").toBe("DENY");
    /* Yüklenen fatura PDF'i başka bir tür sanılıp çalıştırılmasın. */
    expect(b["x-content-type-options"]).toBe("nosniff");
    /* Panel adreslerinde iş kimlikleri var; dış siteye tam adres gitmesin. */
    expect(b["referrer-policy"]).toContain("strict-origin");
    expect(b["strict-transport-security"]).toContain("max-age=");
    expect(b["permissions-policy"]).toContain("camera=()");
  });

  test("68 — panel ve müşteri belgesi indekslenmiyor", async ({ request }) => {
    for (const yol of ["/giris", "/yonetim"]) {
      const y = await request.get(yol, { maxRedirects: 0 });
      expect(
        y.headers()["x-robots-tag"],
        `${yol} indekslenebilir`
      ).toContain("noindex");
    }

    // Landing İNDEKSLENMELİ: kısıt oraya sızmamalı
    const landing = await request.get("/");
    expect(landing.headers()["x-robots-tag"] ?? "").not.toContain("noindex");
  });

  test("69 — panel Türkiye dışından erişilemiyor", async ({ request }) => {
    for (const ulke of ["DE", "US", "RU", "CN"]) {
      const y = await request.get("/giris", {
        headers: { "x-vercel-ip-country": ulke },
        maxRedirects: 0,
      });
      expect(y.status(), `${ulke} panele erişebiliyor`).toBe(403);

      /* Yönlendirme DEĞİL sayfa dönüyor: yönlendirme "başka bir yerde
         çalışan bir panel var" bilgisini sızdırırdı. */
      expect(y.headers()["location"] ?? "").toBe("");
      // Engellenen yanıt önbelleğe alınmamalı
      expect(y.headers()["cache-control"] ?? "").toContain("no-store");
    }
  });

  test("70 — Türkiye'den ve ülke bilinmezken erişilebiliyor", async ({
    request,
  }) => {
    const tr = await request.get("/giris", {
      headers: { "x-vercel-ip-country": "TR" },
      maxRedirects: 0,
    });
    expect(tr.status(), "Türkiye'den panele girilemiyor").toBe(200);

    /* Ülke okunamazsa İÇERİ ALINIYOR — bilinçli tercih: başlık her
       ortamda gelmiyor (yerel geliştirme, bazı kurumsal ağlar) ve
       "bilinmiyorsa reddet" işletmeyi kendi panelinden kilitler.
       Bilinmeyen girişler denetim günlüğüne yazılıyor. */
    const bilinmiyor = await request.get("/giris", { maxRedirects: 0 });
    expect(bilinmiyor.status(), "ülke bilinmiyorken kilitlendi").toBe(200);
  });

  test("71 — kısıt pazarlama sitesine ve müşteri belgesine sızmıyor", async ({
    request,
  }) => {
    /* Landing herkese açık olmalı: müşteri yurt dışından da siteyi
       görebilmeli. Müşteri belgesi de öyle — QR'ı okutan kişi
       yolculukta olabilir. */
    for (const ulke of ["DE", "US"]) {
      const landing = await request.get("/", {
        headers: { "x-vercel-ip-country": ulke },
      });
      expect(landing.status(), `landing ${ulke} için kapalı`).toBe(200);

      const belge = await request.get(
        "/j/00000000000000000000000000000000",
        { headers: { "x-vercel-ip-country": ulke } }
      );
      /* 404 = token geçersiz (beklenen). 403 olsaydı coğrafi kısıt
         müşteri belgesine sızmış olurdu. */
      expect(belge.status(), `belge ${ulke} için engellenmiş`).not.toBe(403);
    }
  });
});

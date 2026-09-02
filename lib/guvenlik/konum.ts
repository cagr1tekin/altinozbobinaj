import type { NextRequest } from "next/server";

/**
 * Coğrafi erişim kısıtı.
 *
 * Ne yapar, ne yapmaz — bu ayrım önemli:
 *   YAPAR : Türkiye dışından yapılan panel girişlerini engeller ve
 *           hepsini denetim günlüğüne yazar.
 *   YAPMAZ: VPN kullanan birini durdurmaz. Ülke bilgisi IP'den geliyor;
 *           Türkiye çıkışlı bir VPN bu kontrolü geçer. Yani bu bir
 *           GÜVENLİK SINIRI değil, bir FİLTREdir — gerçek sınır Supabase
 *           kimlik doğrulaması ve RLS.
 *
 * Neden yine de değerli? Otomatik tarayıcılar ve yurt dışından yapılan
 * kaba kuvvet denemelerinin ezici çoğunluğu VPN kullanmıyor; bu filtre
 * onları giriş formuna ulaşmadan kesiyor.
 */

/** İzin verilen ülkeler. Tek eleman ama liste: ileride şube eklenebilir. */
const IZINLI_ULKELER = new Set(["TR"]);

/**
 * Ülke bilgisi okunamadığında ne olacağı.
 *
 * `false` (içeri al) bilinçli bir tercih: başlık her ortamda gelmiyor
 * (yerel geliştirme, bazı kurumsal ağlar, Vercel dışı bir dağıtım) ve
 * "bilinmiyorsa reddet" demek işletmenin kendi panelinden tamamen
 * kilitlenmesi riski demek. Bilinmeyen girişler günlüğe "unknown_country"
 * olarak yazılıyor; şüpheli bir örüntü oluşursa Raporlar sekmesinden
 * görülüyor.
 */
const BILINMEYENI_ENGELLE = false;

export type KonumSonucu = {
  izinli: boolean;
  ulke: string | null;
  /** Denetim günlüğüne yazılacak sonuç */
  sonuc: "allowed" | "blocked_country" | "unknown_country";
};

/**
 * Vercel ülke kodunu `x-vercel-ip-country` başlığında gönderiyor.
 * `request.geo` yerine başlık okunuyor: geo yalnızca Vercel'de dolu,
 * başlık ise proxy zincirinde de görünüyor ve test edilebiliyor.
 */
export function konumKontrol(request: NextRequest): KonumSonucu {
  const ham =
    request.headers.get("x-vercel-ip-country") ??
    /* Cloudflare önde olursa: bazı kurulumlarda Vercel'in önünde CF var
       ve o kendi başlığını gönderiyor. */
    request.headers.get("cf-ipcountry");

  const ulke = ham ? ham.trim().toUpperCase() : null;

  if (!ulke || ulke === "XX") {
    // XX = Vercel'in "bilinmiyor" değeri
    return {
      izinli: !BILINMEYENI_ENGELLE,
      ulke: null,
      sonuc: "unknown_country",
    };
  }

  if (IZINLI_ULKELER.has(ulke)) {
    return { izinli: true, ulke, sonuc: "allowed" };
  }

  return { izinli: false, ulke, sonuc: "blocked_country" };
}

/**
 * IP'nin son okteti maskeleniyor.
 *
 * Tam IP kişisel veri ve tespit için gerekmiyor: "aynı ağdan mı geliyor"
 * sorusuna ilk üç oktet zaten cevap veriyor. Saklamadığımız veri
 * sızdıramayacağımız veridir.
 */
export function ipMaskele(request: NextRequest): string | null {
  const ham =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip");

  if (!ham) return null;

  if (ham.includes(":")) {
    // IPv6: ilk iki blok yeterli
    const parcalar = ham.split(":");
    return `${parcalar[0]}:${parcalar[1]}:…`;
  }

  const p = ham.split(".");
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : null;
}

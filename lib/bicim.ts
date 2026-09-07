/**
 * Biçimlendirme ve ortak sözlük.
 *
 * Neden `components/panel/ui.tsx` içinde değil? Müşteriye açık belge sayfası
 * (/j/…) pazarlama sitesinin tasarım dilini kullanıyor; tarih biçimini ya da
 * işlem adını panelin arayüz modülünden almak iki tasarım sistemini
 * gereksizce birbirine bağlar. Buradaki şeyler stil değil, **veri sunumu** —
 * ikisi de aynı kaynaktan okumalı.
 *
 * Panel tarafı bunları `ui.tsx` üzerinden yeniden ihraç ediyor, yani mevcut
 * çağrı yerleri değişmiyor.
 */
import type { ServiceType } from "@/lib/supabase/database.types";

/**
 * Sunucu saat dilimi UTC (Vercel), atölye ise Türkiye saatinde. timeZone
 * verilmediğinde Intl sunucunun dilimini kullanıyor ve sayfalar sunucuda
 * render edildiği için bütün saatler 3 saat geride görünüyordu. Diğer yönde
 * de bozuk: tarayıcıda render edilen bir bileşen ziyaretçinin dilimini
 * kullanır. İşletme tek bir yerde, o yüzden diliminin sabit olması doğru.
 */
export const ATOLYE_DILIMI = "Europe/Istanbul";

export function formatTarih(deger: string | null): string {
  if (!deger) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ATOLYE_DILIMI,
  }).format(new Date(deger));
}

export function formatTarihSaat(deger: string | null): string {
  if (!deger) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ATOLYE_DILIMI,
  }).format(new Date(deger));
}

/* -------------------------------------------------------------------------
 * İşlem türü sözlüğü
 *
 * Tek kaynak: hem panel hem müşteri belgesi aynı metni kullanıyor. İki yerde
 * ayrı yazılsa biri değişip diğeri kalır ve müşteriye giden belge panelde
 * görünenden farklı olur.
 * ------------------------------------------------------------------------- */

/** Başlık/rozet hâli (büyük harfle başlar). */
export const ISLEM_TURU: Record<ServiceType, string> = {
  winding: "Motor sarımı",
  revision: "Revizyon",
};

/** Cümle içinde geçen hâli (küçük harf). */
export const ISLEM_TURU_CUMLE: Record<ServiceType, string> = {
  winding: "motor sarımı",
  revision: "revizyon",
};

/**
 * Enum tanım sırası. Veritabanı da bu sırayı uyguluyor
 * (complete_job içinde `array_agg(distinct t order by t)`), ama arayüz
 * sıralamayı veritabanından gelen diziye bırakmamalı: eski bir kayıt ya
 * da elle yapılmış bir düzeltme başka sırada gelebilir ve müşteri belgesi
 * bir seferinde "revizyon ve motor sarımı", başka seferinde tersini
 * yazardı.
 */
const SIRA: ServiceType[] = ["winding", "revision"];

/** Diziyi tanım sırasına sokar, tekrarları atar. */
export function islemleriSirala(turler: ServiceType[]): ServiceType[] {
  return SIRA.filter((t) => turler.includes(t));
}

/**
 * Müşteriye gösterilen ifade:
 *   tek işlem  → "motor sarımı işlemi"
 *   iki işlem  → "motor sarımı ve revizyon işlemleri"
 *
 * Türkçe'de çokluk ekini de değiştirmek gerekiyor; "işlemi/işlemleri"
 * ayrımı çağrı yerlerine bırakılsa biri unutur.
 */
export function islemIfadesi(turler: ServiceType[]): string | null {
  const sirali = islemleriSirala(turler);
  if (sirali.length === 0) return null;

  const adlar = sirali.map((t) => ISLEM_TURU_CUMLE[t]);
  return adlar.length === 1
    ? `${adlar[0]} işlemi`
    : `${adlar.join(" ve ")} işlemleri`;
}

/**
 * Stok miktarının işaretini yön seçiminden üretir.
 *
 * Kullanıcı miktarı her zaman pozitif yazıyor; giriş mi çıkış mı olduğu
 * ayrı bir seçim. Sahada "-3" yazdırmak iki hataya yol açıyordu: eksiyi
 * unutmak (çıkış giriş olarak kaydediliyordu) ve girişe eksi yazmak.
 *
 * Boş string dönmesi bilinçli: forma gizli alan olarak yazılıyor ve boş
 * değer "miktar girilmedi" anlamına geliyor — 0 göndermek şemayı
 * "miktar girilmeli" hatasıyla değil, sessiz bir sıfırla geçerdi.
 */
export function stokIsareti(ham: string, giris: boolean): number | "" {
  const sayi = Number(ham);
  if (ham.trim().length === 0 || !Number.isFinite(sayi) || sayi === 0) {
    return "";
  }
  return giris ? Math.abs(sayi) : -Math.abs(sayi);
}

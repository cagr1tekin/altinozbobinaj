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

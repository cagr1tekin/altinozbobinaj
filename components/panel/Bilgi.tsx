"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Açıklama metinleri — istendiğinde açılan.
 *
 * Panelde her ekranda öğretici metin vardı ("bu alan şuna yarar", "şu
 * neden böyle"). İlk kullanımda gerekliydi ama her gün aynı ekrana bakan
 * biri için okunacak bir şey değil; yalnızca göz yoruyor ve asıl veriyi
 * aşağı itiyordu.
 *
 * Metin SİLİNMİYOR — bir bilgi ikonunun arkasına giriyor. Öğrenmek
 * isteyen açıyor, bilen görmüyor.
 *
 * Panel DOM'da her zaman duruyor (`hidden` ile gizleniyor, koşullu
 * render değil): `aria-describedby` ile bağlandığı için ekran okuyucu
 * kapalıyken de metne ulaşabilmeli.
 */

const IKON_SINIF =
  "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-pnl-faint transition-colors hover:bg-pnl-bg hover:text-pnl-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pnl-primary aria-expanded:text-pnl-primary";

const PANEL_SINIF =
  "mt-2 rounded-lg border border-pnl-line bg-pnl-bg px-3 py-2.5 text-sm leading-relaxed text-pnl-muted";

/** İkon düğmesi. Tek başına anlam taşımadığı için erişilebilir ad zorunlu. */
export function BilgiDugmesi({
  acik,
  panelId,
  ad,
  onClick,
}: {
  acik: boolean;
  panelId: string;
  ad: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={acik}
      aria-controls={panelId}
      /* Metin yok, ikon var: ad olmadan ekran okuyucuda "düğme" diye
         okunurdu. Ad neyin açıklamasını verdiğini söylüyor. */
      aria-label={`${ad} — açıklama`}
      className={IKON_SINIF}
    >
      <Info className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}

/**
 * Kendi başına duran açıklama.
 *
 * Eskiden bir <p> olan metinlerin yerine geçiyor: ikon kendi satırında,
 * çünkü zaten kendi satırında duran bir paragrafın yerini alıyor.
 */
export default function Bilgi({
  ad,
  children,
}: {
  /** Neyin açıklaması olduğu — ekran okuyucu için. */
  ad: string;
  children: ReactNode;
}) {
  const [acik, setAcik] = useState(false);
  const panelId = useId();

  return (
    <div>
      <BilgiDugmesi
        acik={acik}
        panelId={panelId}
        ad={ad}
        onClick={() => setAcik((a) => !a)}
      />
      <div id={panelId} hidden={!acik} className={PANEL_SINIF}>
        {children}
      </div>
    </div>
  );
}

/**
 * Bölüm başlığı + açıklama ikonu.
 *
 * Başlık satırının tamamını ve altındaki paneli birlikte çiziyor:
 * ikon başlığın yanında, panel başlığın altında tam genişlikte. İkisi
 * ayrı bileşen olsaydı panelin yerini her çağrı yeri kendi ayarlardı.
 *
 * `aciklama` ile `bilgi` farklı şeyler ve karıştırılmamalı:
 *   aciklama → VERİ ("3 fatura · 4.500 TL", "01.08 – 01.09")
 *   bilgi    → ÖĞRETİCİ metin ("her ziyaret bir segment")
 * Veri her zaman görünür kalıyor; öğretici metin ikonun arkasında.
 */
export function BolumBasligi({
  baslik,
  aciklama,
  bilgi,
  eylem,
}: {
  baslik?: string;
  aciklama?: ReactNode;
  bilgi?: ReactNode;
  eylem?: ReactNode;
}) {
  const [acik, setAcik] = useState(false);
  const panelId = useId();

  return (
    <div className="mb-3">
      <div className="flex items-end justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0">
            {baslik && <h2 className="text-base font-semibold">{baslik}</h2>}
            {aciklama && (
              <p className="mt-0.5 text-sm text-pnl-muted">{aciklama}</p>
            )}
          </div>
          {bilgi && (
            <BilgiDugmesi
              acik={acik}
              panelId={panelId}
              ad={baslik ?? "Bölüm"}
              onClick={() => setAcik((a) => !a)}
            />
          )}
        </div>
        {eylem}
      </div>

      {bilgi && (
        <div id={panelId} hidden={!acik} className={PANEL_SINIF}>
          {bilgi}
        </div>
      )}
    </div>
  );
}

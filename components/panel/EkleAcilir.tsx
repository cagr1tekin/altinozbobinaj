"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Listenin ilk satırı gibi duran "yeni ekle" açılırı.
 *
 * Neden ayrı bir form bölümü değil? Her sayfada üstte "Yeni X" formu,
 * altta "X'ler" listesi olması ekranı ikiye bölüyordu; kullanıcı liste
 * görmek için her seferinde formu geçmek zorunda kalıyordu. Form artık
 * listenin içinde, kapalı hâlde tek satır yer kaplıyor.
 *
 * `details/summary` yerine state kullanılıyor: kapatma butonu, açıkken
 * değişen ikon ve aria-expanded gibi davranışlar için kontrol gerekiyor.
 */
export default function EkleAcilir({
  etiket,
  children,
  ilkAcik = false,
}: {
  etiket: string;
  children: ReactNode;
  /** Liste boşken form doğrudan açık gelsin — yapılacak tek iş o. */
  ilkAcik?: boolean;
}) {
  const [acik, setAcik] = useState(ilkAcik);
  const panelId = useId();

  return (
    <div className="bg-pnl-surface">
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        aria-expanded={acik}
        aria-controls={panelId}
        className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 px-4 text-left font-semibold text-pnl-primary transition-colors hover:bg-pnl-bg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pnl-primary"
      >
        {acik ? (
          <X className="h-5 w-5 shrink-0" aria-hidden="true" />
        ) : (
          <Plus className="h-5 w-5 shrink-0" aria-hidden="true" />
        )}
        {acik ? "Vazgeç" : etiket}
      </button>

      {acik && (
        <div id={panelId} className="border-t border-pnl-line p-4">
          {children}
        </div>
      )}
    </div>
  );
}

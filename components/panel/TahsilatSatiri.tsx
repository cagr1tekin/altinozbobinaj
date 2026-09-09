"use client";

import { useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { tahsilatGuncelle, tahsilatSil } from "@/lib/actions/tahsilat";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";
import { formatPara, formatTarih } from "@/components/panel/ui";
import type { SegmentTahsilati } from "@/lib/supabase/database.types";

/**
 * Tek vade satırı — okuma, düzenleme, silme.
 *
 * Düzenleme kapalı başlıyor: liste okunmak için var, her satırın altında
 * açık bir form olsa vadeler görünmez olurdu.
 *
 * TARİH düzenlenebilir olmak ZORUNDA: yanlış aya yazılmış bir tahsilat
 * gelir raporunu sessizce bozuyor ve tek çare kaydı silip yeniden
 * girmek olurdu (denetim günlüğünde iki gürültülü satır).
 */
export default function TahsilatSatiri({
  tahsilat,
  segmentId,
  sira,
}: {
  tahsilat: SegmentTahsilati;
  segmentId: string;
  /** Kaçıncı vade — "1. vade" kullanıcının kendi dili. */
  sira: number;
}) {
  const [duzenle, setDuzenle] = useState(false);

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {sira}. vade · {formatPara(tahsilat.tutar)}
          </p>
          <p className="mt-0.5 truncate text-sm text-pnl-muted">
            {formatTarih(tahsilat.tarih)}
            {tahsilat.not_ && ` · ${tahsilat.not_}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDuzenle((d) => !d)}
          aria-expanded={duzenle}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-pnl-muted transition-colors hover:bg-pnl-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-pnl-primary"
        >
          {duzenle ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Pencil className="h-5 w-5" aria-hidden="true" />
          )}
          <span className="sr-only">
            {duzenle ? "Düzenlemeyi kapat" : `${sira}. vadeyi düzenle`}
          </span>
        </button>

        <Form action={tahsilatSil}>
          {() => (
            <>
              <input type="hidden" name="id" value={tahsilat.tahsilat_id} />
              <input type="hidden" name="segment_id" value={segmentId} />
              <GonderButonu tur="ikincil" tamGenislik={false}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{sira}. vadeyi sil</span>
              </GonderButonu>
            </>
          )}
        </Form>
      </div>

      {duzenle && (
        <div className="mt-3 border-t border-pnl-line pt-3">
          <Form action={tahsilatGuncelle}>
            {(state) => {
              const hatalar =
                state.status === "error" ? state.fieldErrors : undefined;
              return (
                <div className="space-y-4">
                  <input type="hidden" name="id" value={tahsilat.tahsilat_id} />
                  <input type="hidden" name="segment_id" value={segmentId} />
                  <Alan
                    ad="amount"
                    etiket="Alınan tutar (TL)"
                    tip="number"
                    adim="0.01"
                    zorunlu
                    varsayilan={String(tahsilat.tutar)}
                    hatalar={hatalar}
                  />
                  <Alan
                    ad="paid_on"
                    etiket="Alındığı tarih"
                    tip="date"
                    zorunlu
                    varsayilan={tahsilat.tarih}
                    ipucu="Tarihi değiştirmek geliri başka bir aya taşır."
                    hatalar={hatalar}
                  />
                  <Alan
                    ad="note"
                    etiket="Not"
                    varsayilan={tahsilat.not_ ?? undefined}
                    hatalar={hatalar}
                  />
                  <GonderButonu>Vadeyi Güncelle</GonderButonu>
                </div>
              );
            }}
          </Form>
        </div>
      )}
    </li>
  );
}

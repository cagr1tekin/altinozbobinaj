"use client";

import { useState } from "react";
import { faturaOlustur } from "@/lib/actions/faturalar";
import { Alan, Form, GonderButonu } from "@/components/yonetim/Form";

type MusteriSecenek = {
  id: string;
  name: string;
  segments: { id: string; segment_date: string }[];
};

export default function FaturaFormu({
  musteriler,
}: {
  musteriler: MusteriSecenek[];
}) {
  const [secilenMusteri, setSecilenMusteri] = useState(
    musteriler[0]?.id ?? ""
  );

  if (musteriler.length === 0) {
    return (
      <p className="text-sm text-paper-muted">
        Fatura girmek için önce müşteri tanımlayın.
      </p>
    );
  }

  const bugun = new Date().toISOString().slice(0, 10);
  const segmentler =
    musteriler.find((m) => m.id === secilenMusteri)?.segments ?? [];

  return (
    <Form action={faturaOlustur}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="alan-customer_id"
                className="mb-1.5 block text-sm font-medium text-paper"
              >
                Müşteri
                <span className="ml-1 text-silver-main" aria-hidden="true">*</span>
                <span className="sr-only"> (zorunlu)</span>
              </label>
              <select
                id="alan-customer_id"
                name="customer_id"
                required
                value={secilenMusteri}
                onChange={(e) => setSecilenMusteri(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-ink px-3 py-2.5 text-sm text-paper focus:border-silver-main focus:outline-none focus:ring-1 focus:ring-silver-main"
              >
                {musteriler.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Segment bağlantısı opsiyonel: fatura bir ziyarete ait
                olmayabilir (örn. dönemsel toplu fatura). */}
            <Alan
              ad="segment_id"
              etiket="İlgili segment (opsiyonel)"
              hatalar={hatalar}
              secenekler={[
                { deger: "", etiket: "— Segment seçilmedi —" },
                ...segmentler.map((s) => ({
                  deger: s.id,
                  etiket: new Intl.DateTimeFormat("tr-TR").format(
                    new Date(s.segment_date)
                  ),
                })),
              ]}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Alan ad="invoice_no" etiket="Fatura no" hatalar={hatalar} />
              <Alan
                ad="issue_date"
                etiket="Fatura tarihi"
                tip="date"
                zorunlu
                varsayilan={bugun}
                hatalar={hatalar}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Alan
                ad="net_amount"
                etiket="Net tutar (₺)"
                tip="number"
                adim="0.01"
                varsayilan="0"
                hatalar={hatalar}
              />
              <Alan
                ad="tax_amount"
                etiket="Vergi (₺)"
                tip="number"
                adim="0.01"
                varsayilan="0"
                hatalar={hatalar}
              />
              <Alan
                ad="gross_amount"
                etiket="Brüt tutar (₺)"
                tip="number"
                adim="0.01"
                varsayilan="0"
                ipucu="Net + vergi"
                hatalar={hatalar}
              />
            </div>

            <p className="text-xs text-paper-muted">
              Kâr/zarar hesabı net tutar üzerinden yapılır. Brüt tutar, net
              tutar ile verginin toplamına eşit olmalıdır.
            </p>

            <Alan ad="note" etiket="Not" cokSatir hatalar={hatalar} />

            <GonderButonu>Faturayı Kaydet</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

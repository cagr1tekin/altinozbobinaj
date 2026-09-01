"use client";

import { useState } from "react";
import { isMalzemeEkle } from "@/lib/actions/isler";
import type { Product } from "@/lib/supabase/database.types";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";
import { birimAdi, birimOrnek, formatSayi } from "@/components/panel/ui";

type MalzemeUrunu = Pick<
  Product,
  "id" | "name" | "unit_type_default" | "qty_pieces" | "qty_grams"
>;

/** Ürünün kendi biriminde stok miktarı: "12 adet" / "4.457 gram". */
function stokMetni(u: MalzemeUrunu): string {
  const deger = u.unit_type_default === "piece" ? u.qty_pieces : u.qty_grams;
  return `${formatSayi(Number(deger))} ${birimAdi(u.unit_type_default)}`;
}

export default function MalzemeFormu({
  isId,
  urunler,
}: {
  isId: string;
  urunler: MalzemeUrunu[];
}) {
  /* Miktarın birimi seçilen ürüne bağlı olduğu için seçim izleniyor. */
  const [urunId, setUrunId] = useState(urunler[0]?.id ?? "");
  const secili = urunler.find((u) => u.id === urunId) ?? urunler[0];
  const birim = secili?.unit_type_default ?? "piece";

  if (urunler.length === 0) {
    return (
      <p className="text-sm text-pnl-muted">
        Önce Ürünler &amp; Stok sayfasından ürün tanımlamanız gerekiyor.
      </p>
    );
  }

  return (
    <Form action={isMalzemeEkle}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <input type="hidden" name="job_id" value={isId} />

            <Alan
              ad="product_id"
              etiket="Ürün"
              zorunlu
              hatalar={hatalar}
              deger={urunId}
              onChange={(e) => setUrunId(e.target.value)}
              secenekler={urunler.map((u) => ({
                deger: u.id,
                etiket: `${u.name} (stok: ${stokMetni(u)})`,
              }))}
            />

            {/* Tek miktar alanı: ürünün birimi neyse o. Adet ve kilogram
                kutularının yan yana durması hangisinin doldurulacağı
                konusunda tereddüt yaratıyordu. */}
            <Alan
              ad="miktar"
              etiket={`Miktar (${birimAdi(birim)})`}
              tip="number"
              adim="1"
              placeholder={birimOrnek(birim)}
              zorunlu
              hatalar={hatalar}
            />

            {/* Stogun ne zaman dustugu belirsiz kaliyordu; acikca yaziliyor */}
            <p className="rounded-lg border border-pnl-line bg-pnl-bg px-3 py-2 text-xs text-pnl-muted">
              Malzeme eklemek stoğu{" "}
              <strong className="text-pnl-text">düşürmez</strong>. Stok, iş{" "}
              <strong className="text-pnl-text">tamamlandığında</strong> düşülür.
            </p>

            <GonderButonu>Malzeme Ekle</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

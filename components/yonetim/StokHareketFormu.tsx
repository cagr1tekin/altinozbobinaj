"use client";

import type { Product } from "@/lib/supabase/database.types";
import { stokHareketiUygula } from "@/lib/actions/urunler";
import { Alan, Form, GonderButonu } from "@/components/yonetim/Form";

export default function StokHareketFormu({
  urunler,
}: {
  urunler: Pick<Product, "id" | "name">[];
}) {
  if (urunler.length === 0) {
    return (
      <p className="text-sm text-paper-muted">
        Stok hareketi girmek için önce ürün tanımlayın.
      </p>
    );
  }

  return (
    <Form action={stokHareketiUygula}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <Alan
              ad="product_id"
              etiket="Ürün"
              zorunlu
              hatalar={hatalar}
              secenekler={urunler.map((u) => ({ deger: u.id, etiket: u.name }))}
            />
            <Alan
              ad="movement_type"
              etiket="Hareket tipi"
              secenekler={[
                { deger: "purchase_in", etiket: "Stok girişi (alım)" },
                { deger: "adjustment", etiket: "Sayım düzeltmesi" },
              ]}
              ipucu="İşe çıkış ve iade hareketleri iş tamamlama akışında otomatik oluşur."
              hatalar={hatalar}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Alan ad="qty_pieces_delta" etiket="Adet" tip="number" adim="1" varsayilan="0" hatalar={hatalar} />
              <Alan ad="qty_kg_delta" etiket="Kilogram" tip="number" adim="0.001" varsayilan="0" hatalar={hatalar} />
            </div>
            <p className="text-xs text-paper-muted">
              Sayım düzeltmesinde eksi değer girebilirsiniz (örn. -3). Stok
              girişinde miktar eksi olamaz.
            </p>
            <Alan ad="note" etiket="Not" placeholder="Örn: Fatura #123" hatalar={hatalar} />
            <GonderButonu>Hareketi Uygula</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

"use client";

import { useState } from "react";
import type { Product } from "@/lib/supabase/database.types";
import { stokHareketiUygula } from "@/lib/actions/urunler";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";
import { birimAdi, birimOrnek } from "@/components/panel/ui";

type StokUrunu = Pick<Product, "id" | "name" | "unit_type_default">;

export default function StokHareketFormu({
  urunler,
}: {
  urunler: StokUrunu[];
}) {
  /* Miktar alanı tek: hangi birimde olduğu seçilen ürüne bağlı. Bu yüzden
     seçim burada izleniyor. Varsayılan ilk ürün — select de onu gösteriyor. */
  const [urunId, setUrunId] = useState(urunler[0]?.id ?? "");
  const secili = urunler.find((u) => u.id === urunId) ?? urunler[0];
  const birim = secili?.unit_type_default ?? "piece";

  if (urunler.length === 0) {
    return (
      <p className="text-sm text-pnl-muted">
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
              deger={urunId}
              onChange={(e) => setUrunId(e.target.value)}
              secenekler={urunler.map((u) => ({
                deger: u.id,
                etiket: `${u.name} (${birimAdi(u.unit_type_default)})`,
              }))}
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
            {/* Tek miktar alanı: birim ürüne göre belirleniyor, kullanıcı
                hangi kutuya yazacağını seçmek zorunda kalmıyor. */}
            <Alan
              ad="miktar"
              etiket={`Miktar (${birimAdi(birim)})`}
              tip="number"
              adim="1"
              placeholder={birimOrnek(birim)}
              zorunlu
              hatalar={hatalar}
            />
            <p className="text-xs text-pnl-muted">
              Sayım düzeltmesinde eksi değer girebilirsiniz (örn. -3). Stok
              girişinde miktar eksi olamaz.
            </p>
            <Alan
              ad="note"
              etiket="Not"
              placeholder="Örn: Fatura #123"
              hatalar={hatalar}
            />
            <GonderButonu>Hareketi Uygula</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

"use client";

import { urunOlustur } from "@/lib/actions/urunler";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";

export default function UrunFormu() {
  return (
    <Form action={urunOlustur}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <Alan ad="name" etiket="Ürün adı" zorunlu placeholder="Örn: Bakır Tel 1.2mm" hatalar={hatalar} />
            <Alan ad="sku" etiket="Stok kodu" placeholder="Örn: BKR-12" hatalar={hatalar} />
            <Alan
              ad="purchase_price"
              etiket="Alış fiyatı (₺)"
              tip="number"
              adim="0.01"
              varsayilan="0"
              ipucu="İşe eklendiği anda sabitlenir; sonraki fiyat değişiklikleri geçmiş işleri etkilemez."
              hatalar={hatalar}
            />
            <Alan
              ad="unit_type_default"
              etiket="Takip birimi"
              secenekler={[
                { deger: "piece", etiket: "Adet" },
                { deger: "kg", etiket: "Kilogram" },
                { deger: "both", etiket: "Adet + Kilogram" },
              ]}
              hatalar={hatalar}
            />
            <Alan ad="notes" etiket="Not" cokSatir hatalar={hatalar} />
            <GonderButonu>Ürünü Kaydet</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

"use client";

import { useState } from "react";
import { urunOlustur } from "@/lib/actions/urunler";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";
import { type Birim, fiyatBirimi } from "@/components/panel/ui";

export default function UrunFormu() {
  /* Birim, fiyatın neyin karşılığı olduğunu belirliyor; bu yüzden alan
     sırası önce birim, sonra fiyat. Ters sırada kullanıcı fiyatı neye göre
     gireceğini bilmeden yazıyordu. */
  const [birim, setBirim] = useState<Birim>("piece");

  return (
    <Form action={urunOlustur}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <Alan
              ad="name"
              etiket="Ürün adı"
              zorunlu
              placeholder="Örn: Bakır Tel 1.2mm"
              hatalar={hatalar}
            />
            <Alan
              ad="sku"
              etiket="Stok kodu"
              placeholder="Örn: BKR-12"
              hatalar={hatalar}
            />
            <Alan
              ad="unit_type_default"
              etiket="Takip birimi"
              deger={birim}
              onChange={(e) => setBirim(e.target.value as Birim)}
              secenekler={[
                { deger: "piece", etiket: "Adet" },
                { deger: "gram", etiket: "Gram" },
              ]}
              ipucu="Ürün tek birimle izlenir. Sonradan değiştirmek stok geçmişini bozar."
              hatalar={hatalar}
            />
            <Alan
              ad="purchase_price"
              etiket={`Alış fiyatı (${fiyatBirimi(birim)})`}
              tip="number"
              adim="0.01"
              varsayilan="0"
              ipucu={
                birim === "gram"
                  ? "Fiyat kilogram başına giriliyor; maliyet kullanılan grama göre hesaplanıyor. İşe eklendiği anda sabitlenir."
                  : "İşe eklendiği anda sabitlenir; sonraki fiyat değişiklikleri geçmiş işleri etkilemez."
              }
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

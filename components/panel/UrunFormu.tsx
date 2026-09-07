"use client";

import { useState } from "react";
import { urunStokEkle } from "@/lib/actions/urunler";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";
import { type Birim, birimAdi, birimOrnek, fiyatBirimi } from "@/components/panel/ui";

/**
 * Yeni ürün — ilk alımıyla birlikte.
 *
 * Ürün tanımı ile ilk stok girişi tek formda: bir ürünün fiyatı ancak
 * alındığı anda belli oluyor. Ayrı ekranlarda sorulduğunda fiyatı 0
 * kalmış, stoğu hiç girilmemiş ürünler oluşuyordu.
 */
export default function UrunFormu() {
  /* Birim, hem miktarın hem fiyatın neyin karşılığı olduğunu
     belirliyor; bu yüzden alan sırası önce birim, sonra miktar/fiyat. */
  const [birim, setBirim] = useState<Birim>("piece");

  return (
    <Form action={urunStokEkle}>
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
              ad="miktar"
              etiket={`Aldığınız miktar (${birimAdi(birim)})`}
              tip="number"
              adim="1"
              placeholder={birimOrnek(birim)}
              zorunlu
              hatalar={hatalar}
            />
            <Alan
              ad="purchase_price"
              etiket={`Alış fiyatı (${fiyatBirimi(birim)})`}
              tip="number"
              adim="0.01"
              zorunlu
              ipucu={
                birim === "gram"
                  ? "Fiyat kilogram başına giriliyor; maliyet kullanılan grama göre hesaplanıyor."
                  : "Her yeni stok girişinde fiyatı yeniden girebilirsiniz."
              }
              hatalar={hatalar}
            />
            <Alan
              ad="note"
              etiket="Not"
              placeholder="Örn: Fatura #123"
              hatalar={hatalar}
            />
            <GonderButonu>Ürünü ve Stoğu Kaydet</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

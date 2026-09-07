"use client";

import type { Product } from "@/lib/supabase/database.types";
import { urunGuncelle } from "@/lib/actions/urunler";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";

/**
 * Ürün bilgisi düzenleme — fiyat HARİÇ.
 *
 * Fiyat bilinçli olarak yok: fiyatın değiştiği an bir alım anıdır ve o
 * alımın miktarı da vardır. Buradan değiştirilebilse, stok geçmişinde
 * karşılığı olmayan bir fiyat değişikliği kalırdı.
 *
 * Takip birimi de yok: adet/gram değişimi geçmiş hareketleri okunamaz
 * hâle getiriyor.
 */
export default function UrunDuzenleFormu({ urun }: { urun: Product }) {
  return (
    <Form action={urunGuncelle}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <input type="hidden" name="id" value={urun.id} />
            <input
              type="hidden"
              name="unit_type_default"
              value={urun.unit_type_default}
            />
            <Alan
              ad="name"
              etiket="Ürün adı"
              zorunlu
              varsayilan={urun.name}
              hatalar={hatalar}
            />
            <Alan
              ad="sku"
              etiket="Stok kodu"
              varsayilan={urun.sku}
              hatalar={hatalar}
            />
            <Alan
              ad="notes"
              etiket="Not"
              cokSatir
              varsayilan={urun.notes}
              hatalar={hatalar}
            />
            <p className="text-sm text-pnl-faint">
              Fiyat ve takip birimi buradan değişmez: fiyat stok girişinde
              girilir, birim değişikliği stok geçmişini bozar.
            </p>
            <GonderButonu>Değişikliği Kaydet</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

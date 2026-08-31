"use client";

import { isMalzemeEkle } from "@/lib/actions/isler";
import type { Product } from "@/lib/supabase/database.types";
import { Alan, Form, GonderButonu } from "@/components/yonetim/Form";
import { formatKg } from "@/components/yonetim/ui";

export default function MalzemeFormu({
  isId,
  urunler,
}: {
  isId: string;
  urunler: Pick<Product, "id" | "name" | "qty_pieces" | "qty_kg">[];
}) {
  if (urunler.length === 0) {
    return (
      <p className="text-sm text-paper-muted">
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
              secenekler={urunler.map((u) => ({
                deger: u.id,
                etiket: `${u.name} (stok: ${u.qty_pieces} adet / ${formatKg(u.qty_kg)} kg)`,
              }))}
            />

            {/* PRD 5.3: iki birim bağımsız, otomatik dönüşüm yok */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Alan
                ad="qty_pieces"
                etiket="Adet"
                tip="number"
                adim="1"
                varsayilan="0"
                hatalar={hatalar}
              />
              <Alan
                ad="qty_kg"
                etiket="Kilogram"
                tip="number"
                adim="0.001"
                varsayilan="0"
                hatalar={hatalar}
              />
            </div>

            <p className="text-xs text-paper-muted">
              Adet ve kilogram birbirinden bağımsız izlenir; biri diğerine
              çevrilmez. Yalnızca kullandığınız birimi doldurun.
            </p>

            {/* Stogun ne zaman dustugu belirsiz kaliyordu; acikca yaziliyor */}
            <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-paper-muted">
              Malzeme eklemek stoğu <strong className="text-paper">düşürmez</strong>.
              Stok, iş <strong className="text-paper">tamamlandığında</strong> düşülür.
            </p>

            <GonderButonu>Malzeme Ekle</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

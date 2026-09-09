"use client";

import { isTutarKaydet } from "@/lib/actions/isler";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";

/**
 * İş tutarı — yalnızca NOT.
 *
 * Hiçbir tahsilat, ciro ya da kâr hesabına girmiyor. Para segment
 * düzeyinde takip ediliyor; bu alan ustanın "bu motora şu kadar
 * demiştik" notu.
 *
 * İşin durumundan BAĞIMSIZ: tamamlanmış işte de düzenlenebiliyor.
 * Eskiden yalnızca tamamlama formunda vardı ve iş kapandıktan sonra
 * ne görülebiliyor ne değiştirilebiliyordu — oysa pazarlık iş
 * bittikten sonra da değişiyor.
 *
 * Segment sayfası bu notları toplayıp "anlaşılan toplam tutar" alanına
 * varsayılan olarak öneriyor; buradaki rakamlar orada işe yarıyor.
 */
export default function IsTutarFormu({
  isId,
  mevcutTutar,
}: {
  isId: string;
  mevcutTutar: number | null;
}) {
  return (
    <Form action={isTutarKaydet}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <input type="hidden" name="job_id" value={isId} />
            <Alan
              ad="agreed_amount"
              etiket="İş tutarı (TL)"
              tip="number"
              adim="0.01"
              varsayilan={mevcutTutar === null ? undefined : String(mevcutTutar)}
              placeholder="Boş bırakabilirsiniz"
              ipucu="Not amaçlıdır: hiçbir gelir, tahsilat veya kâr hesabına girmez. Para segment sayfasından takip edilir. Bu işin tutarı, segmentteki anlaşılan tutara varsayılan olarak önerilir. Boş bırakıp kaydederseniz not silinir."
              hatalar={hatalar}
            />
            <GonderButonu tur="ikincil">
              {mevcutTutar === null ? "Tutarı Kaydet" : "Tutarı Güncelle"}
            </GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

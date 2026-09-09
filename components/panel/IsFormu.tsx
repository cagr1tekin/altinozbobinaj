"use client";

import { isOlustur } from "@/lib/actions/isler";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";
import Bilgi from "@/components/panel/Bilgi";

export default function IsFormu({ segmentId }: { segmentId: string }) {
  return (
    <Form action={isOlustur}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <input type="hidden" name="segment_id" value={segmentId} />
            <Alan
              ad="title"
              etiket="İş başlığı"
              zorunlu
              placeholder="Örn: 75 kW asenkron motor sarımı"
              hatalar={hatalar}
            />
            <Alan ad="description" etiket="Açıklama" cokSatir hatalar={hatalar} />
            {/* Fiyat çoğu zaman iş alınırken konuşuluyor. Aynı kolona
                yazıyor: iş sayfasındaki "İş tutarı" alanıyla aynı şey ve
                orada her zaman değiştirilebiliyor. */}
            <Alan
              ad="agreed_amount"
              etiket="İş tutarı (TL)"
              tip="number"
              adim="0.01"
              placeholder="Boş bırakabilirsiniz"
              ipucu="Not amaçlıdır: hiçbir gelir veya tahsilat hesabına girmez. Segmentteki anlaşılan toplam tutara varsayılan olarak önerilir. İş sayfasından her zaman değiştirebilirsiniz."
              hatalar={hatalar}
            />
            <Bilgi ad="Yeni işin durumu">
              Eklenen iş doğrudan &quot;devam ediyor&quot; durumunda başlar.
            </Bilgi>
            <GonderButonu>İş Ekle</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

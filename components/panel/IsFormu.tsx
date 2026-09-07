"use client";

import { isOlustur } from "@/lib/actions/isler";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";

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
            {/* Tutar burada da girilebiliyor: fiyat çoğu zaman iş alınırken
                konuşuluyor, işi kapatırken değil. Aynı kolona yazıyor, yani
                buraya girilen değer tamamlama formunda hazır çıkıyor. */}
            <Alan
              ad="charged_amount"
              etiket="Müşteriden alınan tutar (TL)"
              tip="number"
              adim="0.01"
              placeholder="Boş bırakabilirsiniz"
              ipucu="Not amaçlıdır, raporlardaki ciroya girmez. İşi tamamlarken bu alan hazır gelir ve değiştirilebilir."
              hatalar={hatalar}
            />
            <p className="text-sm text-pnl-faint">
              Eklenen iş doğrudan &quot;devam ediyor&quot; durumunda başlar.
            </p>
            <GonderButonu>İş Ekle</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

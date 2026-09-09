"use client";

import { tahsilatEkle } from "@/lib/actions/tahsilat";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";
import { formatPara } from "@/components/panel/ui";
import { isoTarih } from "@/lib/donem";

/**
 * Yeni vade — alınan para.
 *
 * Anlaşılan tutardan ayrı bir kayıt ve bir segmentte birden çok
 * olabiliyor: "1.000 verdi, kalanı ay sonunda" gerçek bir durum ve
 * sistemin eskiden karşılığı yoktu.
 *
 * TARİH burada asıl bilgi. Aylık gelir bu tarihe göre hesaplanıyor;
 * fatura tarihine ya da işin bittiği güne değil. Bugün hazır geliyor
 * çünkü tahsilat çoğunlukla alındığı gün giriliyor, ama geriye
 * alınabiliyor — dünkü parayı bugün girmek yaygın.
 */
export default function TahsilatFormu({
  segmentId,
  kalan,
}: {
  segmentId: string;
  /** Açık bakiye. null = anlaşılan tutar henüz girilmemiş. */
  kalan: number | null;
}) {
  /* Sunucuda değil istemcide hesaplanıyor: kullanıcının takvim günü
     önemli. Sunucu saatiyle istemci arasındaki fark, gece yarısına
     yakın girilen bir tahsilatı bir gün öteye atardı. */
  const bugun = isoTarih(new Date());

  return (
    <Form action={tahsilatEkle}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <input type="hidden" name="segment_id" value={segmentId} />

            <Alan
              ad="amount"
              etiket="Alınan tutar (TL)"
              tip="number"
              adim="0.01"
              zorunlu
              /* Kalan hazır YAZILMIYOR, yalnızca söyleniyor: "tamamını
                 aldım" ile "bir kısmını aldım" arasındaki fark bu
                 ekranın tek sebebi; hazır yazmak tek vadeye geri
                 dönmenin kolay yolu olurdu. */
              placeholder={
                kalan !== null && kalan > 0
                  ? `Kalan ${formatPara(kalan)}`
                  : "Örn: 1500"
              }
              ipucu="Bu seferde eline geçen para. Anlaşılan tutarın tamamı olmak zorunda değil; kalan için sonra yeni vade eklersiniz."
              hatalar={hatalar}
            />

            <Alan
              ad="paid_on"
              etiket="Alındığı tarih"
              tip="date"
              zorunlu
              varsayilan={bugun}
              ipucu="Aylık gelir bu tarihe göre hesaplanır — paranın hangi ay kasaya girdiği. Geçmiş bir gün seçebilirsiniz; ileri tarih kabul edilmez."
              hatalar={hatalar}
            />

            <Alan
              ad="note"
              etiket="Not"
              placeholder="Örn: nakit / havale"
              hatalar={hatalar}
            />

            <GonderButonu>Vadeyi Kaydet</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

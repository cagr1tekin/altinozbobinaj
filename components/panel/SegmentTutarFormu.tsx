"use client";

import { segmentTutarKaydet } from "@/lib/actions/musteriler";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";
import { formatPara } from "@/components/panel/ui";

/**
 * Faturasız ciro — elden alınan tutar.
 *
 * Bir segmentte YA fatura YA bu tutar olur. Kural veritabanında (iki
 * yönlü trigger); buradaki iş, kuralı kullanıcıya ÖNCEDEN söylemek:
 * fatura varken alan hiç açılmıyor, çünkü doldurup gönderdikten sonra
 * hata almak kullanıcıya "neden" sorusunu bıraktı.
 */
export default function SegmentTutarFormu({
  segmentId,
  mevcutTutar,
  faturaVar,
  faturaToplam,
}: {
  segmentId: string;
  mevcutTutar: number | null;
  faturaVar: boolean;
  faturaToplam: number;
}) {
  if (faturaVar) {
    return (
      <div className="px-4 py-3 text-sm text-pnl-muted">
        <p>
          Bu segmentin cirosu faturadan geliyor:{" "}
          <span className="font-semibold text-pnl-text">
            {formatPara(faturaToplam)}
          </span>
        </p>
        <p className="mt-1.5 text-pnl-faint">
          Elden tutar girmek için önce faturayı kaldırın — aksi hâlde aynı
          para iki kez sayılırdı.
        </p>
      </div>
    );
  }

  return (
    <Form action={segmentTutarKaydet}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <input type="hidden" name="segment_id" value={segmentId} />
            <Alan
              ad="charged_amount"
              etiket="Müşteriden alınan tutar (TL)"
              tip="number"
              adim="0.01"
              varsayilan={mevcutTutar === null ? undefined : String(mevcutTutar)}
              placeholder="Örn: 4500"
              ipucu="Fatura kesilmeyen, elden ödenen işler için. Raporlardaki ciroya bu tutar girer. Boş bırakıp kaydederseniz tutar kaldırılır ve fatura yükleyebilirsiniz."
              hatalar={hatalar}
            />
            <GonderButonu>
              {mevcutTutar === null ? "Tutarı Kaydet" : "Tutarı Güncelle"}
            </GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

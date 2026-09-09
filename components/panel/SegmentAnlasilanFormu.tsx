"use client";

import { segmentAnlasilanKaydet } from "@/lib/actions/musteriler";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";
import { formatPara } from "@/components/panel/ui";

/**
 * Müşteriyle anlaşılan TOPLAM tutar — faturasız segment için.
 *
 * Bu bir tahsilat değil, bir borç: "ne kadara anlaştık". Alınan para
 * ayrıca vade olarak giriliyor. İkisini tek alanda tutmak sistemin
 * eski hatasıydı — anlaşılan para tek seferde ödenmiş sayılıyordu.
 *
 * Fatura varken alan hiç açılmıyor: fatura zaten anlaşılan tutarı
 * söylüyor. Kural veritabanında; buradaki iş kuralı ÖNCEDEN söylemek,
 * doldurup gönderdikten sonra hata almak "neden" sorusunu bırakıyordu.
 */
export default function SegmentAnlasilanFormu({
  segmentId,
  mevcutTutar,
  faturaVar,
  faturaToplam,
  isToplami,
}: {
  segmentId: string;
  mevcutTutar: number | null;
  faturaVar: boolean;
  faturaToplam: number;
  /**
   * İşlere not olarak girilmiş tutarların toplamı.
   *
   * Hiç kaydedilmemişken forma HAZIR geliyor: usta işleri açarken
   * fiyatları zaten konuşmuş oluyor, aynı rakamları ikinci kez
   * toplamak gereksiz bir iş. Yanlışsa silip doğrusu yazılıyor —
   * varsayılan bir öneri, kayıt değil.
   */
  isToplami: number | null;
}) {
  if (faturaVar) {
    return (
      <div className="px-4 py-3 text-sm text-pnl-muted">
        <p>
          Anlaşılan tutar faturadan geliyor:{" "}
          <span className="font-semibold text-pnl-text">
            {formatPara(faturaToplam)}
          </span>
        </p>
        <p className="mt-1.5 text-pnl-faint">
          Elle tutar girmek için önce faturayı kaldırın.
        </p>
      </div>
    );
  }

  /* Öneri YALNIZCA hiç kaydedilmemişken. Kaydedilmiş bir tutarın
     üzerine öneri yazmak kullanıcının kararını sessizce geri alırdı. */
  const onerilen =
    mevcutTutar === null && isToplami !== null && isToplami > 0
      ? isToplami
      : null;

  return (
    <Form action={segmentAnlasilanKaydet}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <input type="hidden" name="segment_id" value={segmentId} />

            {onerilen !== null && (
              <p className="rounded-lg border border-pnl-line bg-pnl-bg px-3 py-2.5 text-sm text-pnl-muted">
                İşlere girilen tutarların toplamı{" "}
                <span className="font-semibold text-pnl-text">
                  {formatPara(onerilen)}
                </span>{" "}
                — hazır yazıldı. Doğru değilse değiştirin.
              </p>
            )}

            <Alan
              ad="agreed_amount"
              etiket="Anlaşılan toplam tutar (TL)"
              tip="number"
              adim="0.01"
              varsayilan={
                mevcutTutar !== null
                  ? String(mevcutTutar)
                  : onerilen !== null
                    ? String(onerilen)
                    : undefined
              }
              placeholder="Örn: 4500"
              ipucu="Müşteriyle konuşulan toplam para. Alınan para değil — tahsilatı aşağıdan vade vade giriyorsunuz. Boş bırakıp kaydederseniz tutar kaldırılır ve fatura yükleyebilirsiniz."
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

"use client";

import { faturaYukle } from "@/lib/actions/faturalar";
import { Form, GonderButonu } from "@/components/panel/Form";

/**
 * Fatura yükleme.
 *
 * Tutarlar PDF'in metin katmanından okunuyor; kullanıcı elle tutar
 * girmiyor. Okuma başarısız olursa kayıt yapılmıyor ve nedeni gösteriliyor.
 */
export default function FaturaYukleFormu({
  segmentId,
}: {
  segmentId: string;
}) {
  return (
    <Form action={faturaYukle}>
      {(state) => (
        <div className="space-y-4">
          <input type="hidden" name="segment_id" value={segmentId} />

          <div>
            <label
              htmlFor="fatura-dosya"
              className="mb-1.5 block text-sm font-medium"
            >
              Fatura PDF&apos;i
              <span className="ml-0.5 text-pnl-danger" aria-hidden="true">*</span>
              <span className="sr-only"> (zorunlu)</span>
            </label>
            <input
              id="fatura-dosya"
              name="dosya"
              type="file"
              accept="application/pdf,.pdf"
              required
              aria-describedby="fatura-dosya-ipucu"
              className="w-full rounded-lg border border-pnl-edge bg-pnl-surface p-3 text-base file:mr-3 file:min-h-[36px] file:cursor-pointer file:rounded-md file:border-0 file:bg-pnl-primary file:px-4 file:text-sm file:font-semibold file:text-white focus:border-pnl-primary focus:outline-none focus:ring-2 focus:ring-pnl-primary/30"
            />
            <p id="fatura-dosya-ipucu" className="mt-1.5 text-sm text-pnl-faint">
              e-fatura sağlayıcınızdan indirdiğiniz PDF. Tutarlar otomatik
              okunur; fotoğraf veya tarama okunamaz.
            </p>
          </div>

          {state.status === "idle" && (
            <p className="text-sm text-pnl-faint">
              Aynı fatura iki kez yüklenemez.
            </p>
          )}

          <GonderButonu>Faturayı Yükle ve Oku</GonderButonu>
        </div>
      )}
    </Form>
  );
}

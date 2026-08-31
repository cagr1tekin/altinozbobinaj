"use client";

import { useState } from "react";
import { isTamamla, isTamamlamaGeriAl } from "@/lib/actions/isler";
import { Form, GonderButonu } from "@/components/yonetim/Form";

type StokUyarisi = {
  urunAdi: string;
  gerekenAdet: number;
  gerekenKg: number;
  mevcutAdet: number;
  mevcutKg: number;
};

/**
 * İş tamamlama / geri alma paneli.
 *
 * Stok yetersizse veritabanı tamamlamayı reddediyor. Kullanıcıyı çıkışsız
 * bırakmamak için önce uyarı gösteriliyor, onay verilirse allow_negative
 * ile devam ediliyor — eksi stok bilinçli bir tercih olarak kayda geçiyor.
 */
export default function TamamlamaPaneli({
  isId,
  tamamlandiMi,
  malzemeSayisi,
  stokUyarilari,
}: {
  isId: string;
  tamamlandiMi: boolean;
  malzemeSayisi: number;
  stokUyarilari: StokUyarisi[];
}) {
  const [zorlamaOnayi, setZorlamaOnayi] = useState(false);

  if (tamamlandiMi) {
    return (
      <Form action={isTamamlamaGeriAl}>
        {() => (
          <div className="space-y-3">
            <p className="text-sm text-paper-muted">
              Tamamlamayı geri almak malzemeleri stoğa iade eder ve işi
              &quot;devam ediyor&quot; durumuna döndürür. Basılmış QR etiketi
              geçerliliğini korur.
            </p>
            <input type="hidden" name="job_id" value={isId} />
            <GonderButonu ikincil>Tamamlamayı Geri Al</GonderButonu>
          </div>
        )}
      </Form>
    );
  }

  const stokYetersiz = stokUyarilari.length > 0;

  return (
    <Form action={isTamamla}>
      {() => (
        <div className="space-y-4">
          <input type="hidden" name="job_id" value={isId} />

          {malzemeSayisi === 0 && (
            <p className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-paper-muted">
              Bu işe malzeme girilmemiş. Tamamlarsanız stok değişmez —
              yalnızca işçilik içeren işler için bu normaldir.
            </p>
          )}

          {stokYetersiz && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p className="font-semibold">
                Stok yetersiz, tamamlama reddedilecek
              </p>
              <ul className="mt-2 space-y-1">
                {stokUyarilari.map((u) => (
                  <li key={u.urunAdi}>
                    <span className="font-medium">{u.urunAdi}</span>: gereken{" "}
                    {u.gerekenAdet > 0 && `${u.gerekenAdet} adet`}
                    {u.gerekenAdet > 0 && u.gerekenKg > 0 && " / "}
                    {u.gerekenKg > 0 && `${u.gerekenKg} kg`}, mevcut{" "}
                    {u.mevcutAdet} adet / {u.mevcutKg} kg
                  </li>
                ))}
              </ul>
              <p className="mt-3">
                Genellikle bu, girilmemiş bir stok alımı anlamına gelir. Doğrusu
                Ürünler sayfasından stok girişi yapmaktır.
              </p>

              <label className="mt-3 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  name="allow_negative"
                  value="1"
                  checked={zorlamaOnayi}
                  onChange={(e) => setZorlamaOnayi(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-silver-main"
                />
                <span>
                  Yine de tamamla ve stoğun eksiye düşmesini kabul ediyorum
                </span>
              </label>
            </div>
          )}

          <GonderButonu>
            {stokYetersiz && !zorlamaOnayi
              ? "İşi Tamamla (stok yetersiz)"
              : "İşi Tamamla"}
          </GonderButonu>
        </div>
      )}
    </Form>
  );
}

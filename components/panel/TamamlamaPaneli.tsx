"use client";

import { useState } from "react";
import { isTamamla, isTamamlamaGeriAl } from "@/lib/actions/isler";
import { Form, GonderButonu } from "@/components/panel/Form";
import type { ServiceType } from "@/lib/supabase/database.types";
import { ISLEM_TURU } from "@/components/panel/ui";

const ISLEM_SECENEKLERI: Array<{ deger: ServiceType; aciklama: string }> = [
  { deger: "winding", aciklama: "Sargılar sökülüp yeniden sarıldı" },
  { deger: "revision", aciklama: "Bakım, rulman/parça değişimi, temizlik" },
];

type StokUyarisi = {
  urunAdi: string;
  /* Ürün tek birimle izleniyor; hangi birim olduğu burada taşınıyor ki
     uyarı "3 adet" mi "250 gram" mı olduğunu doğru yazsın. */
  birim: "piece" | "gram";
  gereken: number;
  mevcut: number;
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
  /* Ön seçim YOK: hangisinin yapıldığı bilinçli bir karar olmalı.
     Varsayılan işaretli olsa acele eden kullanıcı yanlış türü onaylar ve
     müşteriye giden belge yanlış işlemi yazar. */
  /* Çoklu seçim: bir motora aynı ziyarette hem sarım hem revizyon
     yapılabiliyor. En az biri hâlâ zorunlu. */
  const [islemler, setIslemler] = useState<ServiceType[]>([]);

  const degistir = (tur: ServiceType) =>
    setIslemler((onceki) =>
      onceki.includes(tur)
        ? onceki.filter((t) => t !== tur)
        : [...onceki, tur]
    );

  if (tamamlandiMi) {
    return (
      /* key ZORUNLU — süs değil.
         İki dal da bu bileşenin kökünde bir <Form> render ediyor. React
         konuma göre eşleştirdiği için aynı tipi görüp örneği yeniden
         kullanıyor ve Form'un içindeki useActionState durumu hayatta
         kalıyor. Sonuç: tamamlama formunda oluşan "Yapılan işlemi seçin"
         hatası, iş tamamlandıktan sonra GERİ AL butonunun üstünde
         görünüyordu — orada anlamsız bir uyarı.

         Aynı sızıntının ikinci yolu: iki farklı iş sayfası arasında
         istemci tarafı gezinme. Route aynı olduğu için ağaç korunuyor ve
         bir işteki hata öbür işte görünüyor. Bu yüzden key'e isId de
         giriyor; iş değişince durum sıfırlanıyor. */
      <Form key={`geri-al-${isId}`} action={isTamamlamaGeriAl}>
        {() => (
          <div className="space-y-3">
            <p className="text-sm text-pnl-muted">
              Tamamlamayı geri almak malzemeleri stoğa iade eder ve işi
              &quot;devam ediyor&quot; durumuna döndürür. Basılmış QR etiketi
              geçerliliğini korur.
            </p>
            <input type="hidden" name="job_id" value={isId} />
            <GonderButonu tur="ikincil" tamGenislik={false}>Tamamlamayı Geri Al</GonderButonu>
          </div>
        )}
      </Form>
    );
  }

  const stokYetersiz = stokUyarilari.length > 0;

  return (
    <Form key={`tamamla-${isId}`} action={isTamamla}>
      {(state) => (
        <div className="space-y-4">
          <input type="hidden" name="job_id" value={isId} />

          {/* Yapılan işlem — zorunlu.
              Radyo düğmesi kullanılıyor: iki seçenek de aynı anda görünüyor,
              açılır listede olduğu gibi tıklayıp aramak gerekmiyor. */}
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">
              Yapılan işlem(ler)
              <span className="ml-0.5 text-pnl-danger" aria-hidden="true">
                *
              </span>
              <span className="sr-only"> (zorunlu)</span>
            </legend>

            <div className="grid gap-2 sm:grid-cols-2">
              {ISLEM_SECENEKLERI.map((secenek) => {
                const secili = islemler.includes(secenek.deger);
                return (
                  <label
                    key={secenek.deger}
                    className={`flex min-h-[64px] cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      secili
                        ? "border-pnl-primary bg-pnl-chip-info"
                        : "border-pnl-edge bg-pnl-surface hover:bg-pnl-bg"
                    }`}
                  >
                    {/* checkbox, radio değil: ikisi birden seçilebiliyor.
                        `required` KULLANILMIYOR — checkbox'ta her birini
                        tek tek zorunlu yapar; "en az biri" kuralı
                        butonun devre dışı olmasıyla sağlanıyor. */}
                    <input
                      type="checkbox"
                      name="service_types"
                      value={secenek.deger}
                      checked={secili}
                      onChange={() => degistir(secenek.deger)}
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-pnl-primary"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {ISLEM_TURU[secenek.deger]}
                      </span>
                      <span className="mt-0.5 block text-xs text-pnl-muted">
                        {secenek.aciklama}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            {state.status === "error" && state.fieldErrors?.service_types && (
              <p className="mt-1.5 text-sm font-medium text-pnl-danger">
                {state.fieldErrors.service_types[0]}
              </p>
            )}
            <p className="mt-1.5 text-sm text-pnl-faint">
              İkisi birden yapıldıysa ikisini de işaretleyin. Müşteri QR
              kodunu okuttuğunda bu bilgiyi görecek.
            </p>
          </fieldset>

          {malzemeSayisi === 0 && (
            <p className="rounded-lg border border-pnl-edge bg-pnl-bg px-4 py-3 text-sm text-pnl-muted">
              Bu işe malzeme girilmemiş. Tamamlarsanız stok değişmez —
              yalnızca işçilik içeren işler için bu normaldir.
            </p>
          )}

          {stokYetersiz && (
            <div className="rounded-lg border border-pnl-warn/40 bg-pnl-chip-warn p-4 text-sm text-pnl-chip-warn-text">
              <p className="font-semibold">
                Stok yetersiz, tamamlama reddedilecek
              </p>
              <ul className="mt-2 space-y-1">
                {stokUyarilari.map((u) => (
                  <li key={u.urunAdi}>
                    <span className="font-medium">{u.urunAdi}</span>: gereken{" "}
                    {`${u.gereken} ${u.birim === "piece" ? "adet" : "gram"}`}
                    , mevcut{" "}
                    {`${u.mevcut} ${u.birim === "piece" ? "adet" : "gram"}`}
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
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-pnl-primary"
                />
                <span>
                  Yine de tamamla ve stoğun eksiye düşmesini kabul ediyorum
                </span>
              </label>
            </div>
          )}

          {/* required tek başına yeterli değil: tarayıcı uyarısı gösteriyor
              ama buton tıklanabilir kalıyor ve kullanıcı neden gönderilmediğini
              anlamıyor. Devre dışı bırakmak sebebi görünür kılıyor. */}
          <GonderButonu devreDisi={islemler.length === 0}>
            {islemler.length === 0
              ? "Önce yapılan işlemi seçin"
              : stokYetersiz && !zorlamaOnayi
                ? "İşi Tamamla (stok yetersiz)"
                : "İşi Tamamla"}
          </GonderButonu>
        </div>
      )}
    </Form>
  );
}

import { FileText } from "lucide-react";
import { butonStilleri } from "./ui";

/**
 * PDF bağlantıları.
 *
 * İki seçenek: iç kullanım (maliyet, miktar ve tahsilat dahil) ve müşteri
 * kopyası (üçü de gizli). Ayrı butonlar, çünkü hangisinin verileceği
 * bilinçli bir karar olmalı — tek butonda bir onay kutusu olsa yanlış
 * kopya yazdırmak bir kere tıklamamakla olurdu.
 *
 * `tarihAraligi` verildiğinde belgeyi bir aralıkla sınırlayan tarih
 * alanları çıkıyor. Yalnızca LİSTE içeren belgelerde anlamlı: müşteri
 * belgesi çok sayıda segment barındırıyor ve "sadece bu yılı yazdır"
 * gerçek bir ihtiyaç. Tek bir işin ya da tek bir segmentin belgesinde
 * aralık sormanın karşılığı yok — orada alan hiç görünmüyor.
 */
const tarihGirdisi =
  "min-h-[44px] w-full rounded-lg border border-pnl-edge bg-pnl-surface px-3 text-base focus:border-pnl-primary focus:outline-none focus:ring-2 focus:ring-pnl-primary/30";

export function PdfBaglantilari({
  temelUrl,
  etiket,
  tarihAraligi,
}: {
  temelUrl: string;
  etiket: string;
  tarihAraligi?: { baslangic: string; bitis: string };
}) {
  const ayirici = temelUrl.includes("?") ? "&" : "?";

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <a
          href={temelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={butonStilleri.ikincil}
        >
          <FileText className="h-5 w-5" aria-hidden="true" />
          {etiket}
        </a>
        <a
          href={`${temelUrl}${ayirici}maliyet=0`}
          target="_blank"
          rel="noopener noreferrer"
          className={butonStilleri.ikincil}
        >
          <FileText className="h-5 w-5" aria-hidden="true" />
          Müşteri kopyası
        </a>
      </div>

      {tarihAraligi && (
        <TarihAraligiFormu temelUrl={temelUrl} aralik={tarihAraligi} />
      )}
    </div>
  );
}

/**
 * Tarihe göre sınırlı belge.
 *
 * `details` içinde gizli ve varsayılan kapalı: günlük kullanımda tüm
 * geçmişi yazdırmak yetiyor, aralık seçmek nadir bir ihtiyaç ve iki
 * butonun arasına girip asıl eylemi gölgelememeli.
 *
 * GET formu, `target="_blank"` ile: PDF yeni sekmede açılıyor ve panel
 * sayfası yerinde kalıyor — aynı sekmede açılsa kullanıcı geri tuşuna
 * basmak zorunda kalıyordu.
 */
function TarihAraligiFormu({
  temelUrl,
  aralik,
}: {
  temelUrl: string;
  aralik: { baslangic: string; bitis: string };
}) {
  /* Sorgu parametreleri gizli alana çevriliyor: GET formu action'daki
     query string'i düşürüyor ve `id` kaybolduğunda route 404 veriyordu. */
  const [yol, sorgu] = temelUrl.split("?");
  const mevcut = Array.from(new URLSearchParams(sorgu ?? "").entries());

  return (
    <details className="rounded-lg border border-pnl-line bg-pnl-surface">
      <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-sm text-pnl-muted">
        Tarih aralığı seçerek al
      </summary>

      <div className="border-t border-pnl-line p-3">
        <form action={yol} target="_blank" className="space-y-3">
          {mevcut.map(([ad, deger]) => (
            <input key={ad} type="hidden" name={ad} value={deger} />
          ))}

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[130px] flex-1">
              <label htmlFor="pdf-bas" className="mb-1 block text-sm">
                Başlangıç
              </label>
              <input
                id="pdf-bas"
                name="bas"
                type="date"
                defaultValue={aralik.baslangic}
                className={tarihGirdisi}
              />
            </div>
            <div className="min-w-[130px] flex-1">
              <label htmlFor="pdf-bit" className="mb-1 block text-sm">
                Bitiş
              </label>
              <input
                id="pdf-bit"
                name="bit"
                type="date"
                defaultValue={aralik.bitis}
                className={tarihGirdisi}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button type="submit" className={butonStilleri.ikincil}>
              <FileText className="h-5 w-5" aria-hidden="true" />
              Aralıkla al
            </button>
            {/* Müşteri kopyası ayrı buton, aynı formdan: `maliyet=0`
                değerini submit eden buton taşıyor. Tek butonla onay
                kutusu olsaydı yanlış kopya bir kez unutmakla çıkardı. */}
            <button
              type="submit"
              name="maliyet"
              value="0"
              className={butonStilleri.ikincil}
            >
              <FileText className="h-5 w-5" aria-hidden="true" />
              Müşteri kopyası
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}

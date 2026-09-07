import Link from "next/link";
import { DONEMLER } from "@/lib/donem";

/**
 * Dönem seçimi.
 *
 * Hazır aralıklar link, serbest aralık GET formu — seçim URL'de kalıyor,
 * geri tuşu ve paylaşılabilir bağlantı çalışıyor, client state gerekmiyor.
 *
 * Serbest aralık `details` içinde gizli: günlük kullanımda hazır dönemler
 * yetiyor, tarih girmek nadir bir ihtiyaç ve ekranı meşgul etmemeli.
 */
const tarihGirdisi =
  "min-h-[44px] w-full rounded-lg border border-pnl-edge bg-pnl-surface px-3 text-base focus:border-pnl-primary focus:outline-none focus:ring-2 focus:ring-pnl-primary/30";

export default function DonemSecici({
  temelYol = "/yonetim/raporlar",
  aktifDonem,
  baslangic,
  bitis,
  korunan,
}: {
  temelYol?: string;
  aktifDonem: string;
  baslangic: string;
  bitis: string;
  /**
   * Dönem değişirken korunması gereken diğer parametreler (örn. Özet'teki
   * arama terimi). Korunmazsa dönem değiştirmek aramayı sıfırlıyordu ve
   * kullanıcı terimi yeniden yazmak zorunda kalıyordu.
   */
  korunan?: Record<string, string | undefined>;
}) {
  const ekstra = Object.entries(korunan ?? {}).filter(
    (e): e is [string, string] => Boolean(e[1])
  );

  const baglanti = (donem: string) => {
    const p = new URLSearchParams([["donem", donem], ...ekstra]);
    return `${temelYol}?${p.toString()}`;
  };

  return (
    <div className="space-y-3">
      <nav aria-label="Dönem">
        <ul className="flex gap-2">
          {DONEMLER.map((d) => {
            const aktif = d.deger === aktifDonem;
            return (
              <li key={d.deger} className="flex-1">
                <Link
                  href={baglanti(d.deger)}
                  aria-current={aktif ? "true" : undefined}
                  className={`flex min-h-[44px] items-center justify-center rounded-lg border text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-pnl-primary ${
                    aktif
                      ? "border-pnl-primary bg-pnl-chip-info text-pnl-chip-info-text"
                      : "border-pnl-edge bg-pnl-surface text-pnl-muted hover:bg-pnl-bg"
                  }`}
                >
                  {d.etiket}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <details
        className="rounded-lg border border-pnl-line bg-pnl-surface"
        /* Serbest aralık seçiliyse açık başlıyor: kapalı kalsa kullanıcı
           hangi tarihlerin geçerli olduğunu göremiyordu. */
        open={aktifDonem === "serbest"}
      >
        <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-sm text-pnl-muted">
          Tarih aralığı seç
          {aktifDonem === "serbest" && (
            <span className="ml-2 font-medium text-pnl-text">
              {baslangic} → {bitis}
            </span>
          )}
        </summary>
        <form
          action={temelYol}
          className="flex flex-wrap items-end gap-2 border-t border-pnl-line p-3"
        >
          {/* Korunan parametreler gizli alan olarak taşınıyor: GET formu
              yalnızca kendi alanlarını gönderiyor, URL'dekileri düşürüyor. */}
          {ekstra.map(([ad, deger]) => (
            <input key={ad} type="hidden" name={ad} value={deger} />
          ))}
          <div className="min-w-[130px] flex-1">
            <label htmlFor="donem-bas" className="mb-1 block text-sm">
              Başlangıç
            </label>
            <input
              id="donem-bas"
              name="bas"
              type="date"
              defaultValue={baslangic}
              className={tarihGirdisi}
            />
          </div>
          <div className="min-w-[130px] flex-1">
            <label htmlFor="donem-bit" className="mb-1 block text-sm">
              Bitiş
            </label>
            <input
              id="donem-bit"
              name="bit"
              type="date"
              defaultValue={bitis}
              className={tarihGirdisi}
            />
          </div>
          <button
            type="submit"
            className="min-h-[44px] cursor-pointer rounded-lg border border-pnl-edge px-4 text-sm font-semibold transition-colors hover:bg-pnl-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-pnl-primary"
          >
            Uygula
          </button>
        </form>
      </details>
    </div>
  );
}

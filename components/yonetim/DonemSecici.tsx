"use client";

import Link from "next/link";

/**
 * Dönem seçimi. Hazır aralıklar link (paylaşılabilir/geri tuşu çalışır),
 * serbest aralık ise GET formu — server component'in searchParams'ını
 * okuyabilmesi için client state yerine URL kullanılıyor.
 */
const donemler = [
  { deger: "ay", etiket: "Son 1 ay" },
  { deger: "ceyrek", etiket: "Son 3 ay" },
  { deger: "yil", etiket: "Son 1 yıl" },
];

export default function DonemSecici({
  aktifDonem,
  baslangic,
  bitis,
}: {
  aktifDonem: string;
  baslangic: string;
  bitis: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <nav aria-label="Hazır dönemler">
        <ul className="flex flex-wrap gap-2">
          {donemler.map((d) => {
            const aktif = d.deger === aktifDonem;
            return (
              <li key={d.deger}>
                <Link
                  href={`/yonetim?donem=${d.deger}`}
                  aria-current={aktif ? "true" : undefined}
                  className={`flex min-h-[40px] items-center rounded-xl border px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main ${
                    aktif
                      ? "border-silver-main/60 bg-white/5 text-paper"
                      : "border-white/15 text-paper/70 hover:bg-white/5 hover:text-paper"
                  }`}
                >
                  {d.etiket}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="donem-bas" className="mb-1 block text-xs text-paper-muted">
            Başlangıç
          </label>
          <input
            id="donem-bas"
            name="bas"
            type="date"
            defaultValue={baslangic}
            className="rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-paper focus:border-silver-main focus:outline-none focus:ring-1 focus:ring-silver-main"
          />
        </div>
        <div>
          <label htmlFor="donem-bit" className="mb-1 block text-xs text-paper-muted">
            Bitiş
          </label>
          <input
            id="donem-bit"
            name="bit"
            type="date"
            defaultValue={bitis}
            className="rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-paper focus:border-silver-main focus:outline-none focus:ring-1 focus:ring-silver-main"
          />
        </div>
        <button
          type="submit"
          className="min-h-[40px] cursor-pointer rounded-xl border border-white/15 px-4 text-sm font-semibold text-paper transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main"
        >
          Uygula
        </button>
      </form>
    </div>
  );
}

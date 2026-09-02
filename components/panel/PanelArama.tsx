import { Search } from "lucide-react";

/**
 * Özet sayfasındaki tek arama kutusu: müşteri adı ve motor adı.
 *
 * GET formu — sonuç URL'de kalıyor, geri tuşu ve paylaşılabilir bağlantı
 * çalışıyor, client state gerekmiyor. Aynı gerekçe MusteriArama'da da
 * geçerli; kalıp bilinçli olarak aynı.
 */
export default function PanelArama({ varsayilan }: { varsayilan: string }) {
  return (
    <form role="search" className="flex gap-2">
      <div className="relative flex-1">
        <label htmlFor="panel-ara" className="sr-only">
          Müşteri veya motor ara
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-pnl-faint"
          aria-hidden="true"
        />
        <input
          id="panel-ara"
          name="ara"
          type="search"
          defaultValue={varsayilan}
          placeholder="Müşteri veya motor adı"
          className="min-h-[48px] w-full rounded-lg border border-pnl-edge bg-pnl-surface pl-10 pr-3 text-base placeholder:text-pnl-faint focus:border-pnl-primary focus:outline-none focus:ring-2 focus:ring-pnl-primary/30"
        />
      </div>
      <button
        type="submit"
        className="min-h-[48px] shrink-0 cursor-pointer rounded-lg border border-pnl-edge bg-pnl-surface px-4 font-semibold transition-colors hover:bg-pnl-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-pnl-primary"
      >
        Ara
      </button>
    </form>
  );
}

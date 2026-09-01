import { Search } from "lucide-react";

/**
 * Müşteri arama. GET formu — sonuç URL'de kalır, geri tuşu ve
 * paylaşılabilir bağlantı çalışır, client state gerekmez.
 */
export default function MusteriArama({ varsayilan }: { varsayilan: string }) {
  return (
    <form role="search" className="flex gap-2">
      <div className="relative flex-1">
        <label htmlFor="musteri-ara" className="sr-only">
          Müşteri ara
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-pnl-faint"
          aria-hidden="true"
        />
        <input
          id="musteri-ara"
          name="q"
          type="search"
          defaultValue={varsayilan}
          placeholder="Müşteri adı"
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

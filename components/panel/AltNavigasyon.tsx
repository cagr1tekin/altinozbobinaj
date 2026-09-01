"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, Package, ChartColumn } from "lucide-react";

/**
 * Ana navigasyon.
 *
 * Mobilde ekranın altında sabit tab bar — parmağın ulaştığı yer orası.
 * Masaüstünde aynı sekmeler üstte yatay şerit olur; iki ayrı navigasyon
 * modeli yerine tek model, iki yerleşim.
 *
 * Dört sekme sınırı bilinçli: beşincisi eklenmek istenirse özet sayfasına
 * kısayol olarak konur.
 */
const sekmeler = [
  { href: "/yonetim", etiket: "Özet", ikon: LayoutGrid },
  { href: "/yonetim/musteriler", etiket: "Müşteri", ikon: Users },
  { href: "/yonetim/urunler", etiket: "Stok", ikon: Package },
  { href: "/yonetim/raporlar", etiket: "Rapor", ikon: ChartColumn },
] as const;

function aktifMi(pathname: string, href: string): boolean {
  if (href === "/yonetim") return pathname === "/yonetim";
  return pathname.startsWith(href);
}

export default function AltNavigasyon() {
  const pathname = usePathname();

  return (
    <>
      {/* Mobil: alt sabit bar */}
      <nav
        aria-label="Ana menü"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-pnl-line bg-pnl-surface md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex">
          {sekmeler.map((s) => {
            const Ikon = s.ikon;
            const aktif = aktifMi(pathname, s.href);
            return (
              <li key={s.href} className="flex-1">
                <Link
                  href={s.href}
                  aria-current={aktif ? "page" : undefined}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pnl-primary ${
                    aktif ? "text-pnl-primary" : "text-pnl-faint"
                  }`}
                >
                  <Ikon
                    className="h-6 w-6"
                    strokeWidth={aktif ? 2.25 : 1.75}
                    aria-hidden="true"
                  />
                  <span className={`text-[11px] ${aktif ? "font-semibold" : ""}`}>
                    {s.etiket}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Masaüstü: üstte yatay şerit */}
      <nav
        aria-label="Ana menü"
        className="hidden border-b border-pnl-line bg-pnl-surface md:block"
      >
        <ul className="mx-auto flex max-w-4xl gap-1 px-4">
          {sekmeler.map((s) => {
            const Ikon = s.ikon;
            const aktif = aktifMi(pathname, s.href);
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={aktif ? "page" : undefined}
                  className={`flex min-h-[48px] items-center gap-2 border-b-2 px-4 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pnl-primary ${
                    aktif
                      ? "border-pnl-primary font-semibold text-pnl-primary"
                      : "border-transparent text-pnl-muted hover:text-pnl-text"
                  }`}
                >
                  <Ikon className="h-[18px] w-[18px]" aria-hidden="true" />
                  {s.etiket}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

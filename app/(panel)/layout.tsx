import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

/**
 * Yönetim paneli kabuğu.
 *
 * Pazarlama sitesinden tamamen ayrı bir tasarım sistemi kullanır
 * (design-system/PANEL.md): açık tema, tek font, düz yüzeyler.
 *
 * Inter yalnızca burada yükleniyor — kök layout'ta tanımlı olsaydı
 * landing sayfası da gereksiz yere indirirdi.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Yönetim | Altınöz Bobinaj",
  robots: { index: false, follow: false },
  /* Kök layout landing'in manifestini veriyor (site.webmanifest); panel
     kendi manifestini kullanmalı ki ana ekrana eklenince /yonetim
     adresinde açılsın. Statik dosya: Next.js manifest.ts'i route group
     içinde üretmiyor, yalnızca app kökünde tanıyor. */
  manifest: "/panel.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Altınöz Yönetim",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  /* Landing koyu tema kullanıyor; panel açık. Tarayıcı çubuğu rengi de
     ayrışmalı, yoksa PWA olarak açıldığında koyu şerit kalıyor. */
  themeColor: "#F8FAFC",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  /* Çentikli ekranlarda tam ekran modu için */
  viewportFit: "cover",
};

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${inter.variable} min-h-screen bg-pnl-bg font-panel text-pnl-text antialiased [font-variant-numeric:tabular-nums]`}
    >
      {children}
    </div>
  );
}

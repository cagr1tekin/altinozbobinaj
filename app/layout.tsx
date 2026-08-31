import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Playfair_Display } from "next/font/google";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import "./globals.css";

/* latin-ext olmadan ğ, ş, ı, İ glifleri eksik kalıyor ve tarayıcı
   bu harflerde yedek fonta düşüyor. Site tamamen Türkçe. */
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

/**
 * Kok metadata yalnizca her rotada gecerli olan seyleri tasiyor.
 * Landing page'e ozel baslik/aciklama/OG bilgileri app/(site)/layout.tsx
 * icinde; yonetim paneli ve giris sayfasi kendi metadata'sini veriyor
 * (ikisi de robots: noindex).
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://altinozbobinaj.com"),
  title: "Altınöz Bobinaj",
  authors: [{ name: "Altınöz Bobinaj" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    /* iOS, apple-touch-icon olarak SVG'yi desteklemiyor; PNG şart. */
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body
        className={`${plusJakarta.variable} ${playfairDisplay.variable} font-sans`}
      >
        {/* GA ID'si .env dosyasindan okunur: NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX */}
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics GA_MEASUREMENT_ID={process.env.NEXT_PUBLIC_GA_ID} />
        )}
        {children}
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Playfair_Display } from "next/font/google";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://altinozbobinaj.com"),
  title: "Altınöz Bobinaj | Balıkesir Bobinaj ve Motor Sarımı",
  description:
    "Balıkesir Karesi'de profesyonel bobinaj, elektrik motoru sarımı, su pompası revizyonu ve fren bobini sarımı hizmetleri. Endüstriyel motor bakım ve onarımında güvenilir çözüm ortağınız.",
  keywords: [
    "bobinaj",
    "motor sarımı",
    "altınöz bobinaj",
    "balıkesir bobinaj",
    "karesi bobinaj",
    "elektrik motoru tamiri",
    "su pompası tamiri",
    "fren bobini sarımı",
    "endüstriyel bobinaj",
    "motor bakım onarım",
  ],
  authors: [{ name: "Altınöz Bobinaj" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Altınöz Bobinaj | Balıkesir Bobinaj ve Motor Sarımı",
    description:
      "Balıkesir Karesi'de profesyonel bobinaj, elektrik motoru sarımı, su pompası revizyonu ve fren bobini sarımı hizmetleri.",
    type: "website",
    locale: "tr_TR",
    siteName: "Altınöz Bobinaj",
    images: [
      {
        url: "/images/referanslar/IMG_5595.webp", // En iyi referans görseli
        width: 1200,
        height: 630,
        alt: "Altınöz Bobinaj Atölye ve Hizmetleri",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Altınöz Bobinaj | Balıkesir Bobinaj ve Motor Sarımı",
    description:
      "Balıkesir Karesi'de profesyonel bobinaj, elektrik motoru sarımı, su pompası revizyonu ve fren bobini sarımı hizmetleri.",
    images: ["/images/referanslar/IMG_5595.webp"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Altınöz Bobinaj",
    image:
      "https://altinozbobinaj.com/images/referanslar/IMG_5595.webp",
    "@id": "https://altinozbobinaj.com",
    url: "https://altinozbobinaj.com",
    telephone: "+905425918372",
    email: "altinozbobinajsan@gmail.com",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Yeni Sanayi Sitesi, 19 Ağustos Cd.",
      addressLocality: "Karesi",
      addressRegion: "Balıkesir",
      postalCode: "10100",
      addressCountry: "TR",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 39.662356,
      longitude: 27.910002,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ],
        opens: "08:00",
        closes: "18:00",
      },
    ],
    priceRange: "₺₺",
    servesCuisine: "Bobinaj ve Motor Bakımı",
  };

  const referencesItemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Altınöz Bobinaj Referans Görselleri",
    description:
      "Balıkesir Karesi'de Altınöz Bobinaj tarafından tamamlanan seçili motor sarımı, su pompası revizyonu ve endüstriyel bakım onarım referans çalışmaları.",
    itemListElement: [
      {
        "@type": "ImageObject",
        position: 1,
        url: "https://altinozbobinaj.com/images/referanslar/IMG_5595.webp",
        name: "Balıkesir Altınöz Bobinaj komple elektrik motor revizyonu referansı",
        description:
          "Balıkesir Altınöz Bobinaj tarafından gerçekleştirilen komple elektrik motor revizyonu ve sarımı referans çalışması.",
      },
      {
        "@type": "ImageObject",
        position: 2,
        url: "https://altinozbobinaj.com/images/referanslar/IMG_5615.webp",
        name: "Yüksek voltajlı elektrik motor sarımı Altınöz Bobinaj Balıkesir",
        description:
          "Balıkesir'de yüksek voltajlı elektrik motor sarımı ve izolasyon işlemi Altınöz Bobinaj referans görseli.",
      },
      {
        "@type": "ImageObject",
        position: 3,
        url: "https://altinozbobinaj.com/images/referanslar/IMG_7183.webp",
        name: "Balıkesir ağır sanayi elektrik motoru sargısı referansı",
        description:
          "Balıkesir ağır sanayi elektrik motoru sargısı ve bakım onarım hizmeti Altınöz Bobinaj referans çalışması.",
      },
      {
        "@type": "ImageObject",
        position: 4,
        url: "https://altinozbobinaj.com/images/referanslar/IMG_5289.webp",
        name: "Servo motor tamiri ve test hattı Altınöz Bobinaj",
        description:
          "Altınöz Bobinaj Balıkesir atölyesinde gerçekleştirilen servo motor tamiri ve test hattı referans görseli.",
      },
      {
        "@type": "ImageObject",
        position: 5,
        url: "https://altinozbobinaj.com/images/referanslar/IMG_4804.webp",
        name: "Balıkesir endüstriyel motor sarımı referans görseli",
        description:
          "Balıkesir'de endüstriyel elektrik motor sarımı ve balans ayarı Altınöz Bobinaj referans fotoğrafı.",
      },
      {
        "@type": "ImageObject",
        position: 6,
        url: "https://altinozbobinaj.com/images/referanslar/IMG_5600.webp",
        name: "Trafo ve özel bobin sargısı Altınöz Bobinaj Balıkesir",
        description:
          "Trafo ve özel bobin sargısı üzerine Balıkesir Altınöz Bobinaj tarafından gerçekleştirilen referans çalışması.",
      },
    ],
  };

  return (
    <html lang="tr">
      <body className={`${plusJakarta.variable} ${playfairDisplay.variable} font-sans`}>
        {/* Google Analytics - ID'yi .env dosyasına eklemeyi unutmayın: NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX */}
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics GA_MEASUREMENT_ID={process.env.NEXT_PUBLIC_GA_ID} />
        )}
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(referencesItemListJsonLd) }}
        />
        <Header />
        <main className="min-h-screen pt-20">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

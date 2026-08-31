import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import MobileCallBar from "@/components/layout/MobileCallBar";

const SITE_URL = "https://altinozbobinaj.com";

/* Bu layout yalnizca pazarlama sitesini sariyor. Yonetim paneli
   (app/yonetim) ve giris sayfasi (app/giris) bu grubun disinda oldugu
   icin header/footer/cagri barini almiyor. */
export const metadata: Metadata = {
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
  /* metadataBase, icons, manifest ve authors kok layout'ta tanimli;
     burada tekrarlanmiyor. */
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Altınöz Bobinaj | Balıkesir Bobinaj ve Motor Sarımı",
    description:
      "Balıkesir Karesi'de profesyonel bobinaj, elektrik motoru sarımı, su pompası revizyonu ve fren bobini sarımı hizmetleri.",
    type: "website",
    locale: "tr_TR",
    siteName: "Altınöz Bobinaj",
    url: SITE_URL,
    /* og:image, app/opengraph-image.tsx dosya konvansiyonundan otomatik
       uretiliyor (1200x630 PNG). Elle images tanimlamak gerekmiyor. */
  },
  twitter: {
    card: "summary_large_image",
    title: "Altınöz Bobinaj | Balıkesir Bobinaj ve Motor Sarımı",
    description:
      "Balıkesir Karesi'de profesyonel bobinaj, elektrik motoru sarımı, su pompası revizyonu ve fren bobini sarımı hizmetleri.",
    /* twitter:image de app/twitter-image.tsx uzerinden geliyor. */
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

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /* ProfessionalService, LocalBusiness'in alt tipi: yerel isletme rich
     result'larini korur ama hizmet sektorunu dogru tanimlar. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: "Altınöz Bobinaj",
    description:
      "Balıkesir Karesi'de 1976'dan bu yana elektrik motoru sarımı, bobinaj, su pompası revizyonu ve fren bobini sarımı hizmetleri.",
    image: `${SITE_URL}/images/referanslar/IMG_5595.webp`,
    logo: `${SITE_URL}/logo2.webp`,
    "@id": SITE_URL,
    url: SITE_URL,
    foundingDate: "1976",
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
    areaServed: [
      { "@type": "City", name: "Balıkesir" },
      { "@type": "Country", name: "Türkiye" },
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: "+905425918372",
        contactType: "customer service",
        areaServed: "TR",
        availableLanguage: "Turkish",
      },
      {
        "@type": "ContactPoint",
        telephone: "+905061210573",
        contactType: "customer service",
        areaServed: "TR",
        availableLanguage: "Turkish",
      },
    ],
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
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Bobinaj ve Motor Bakım Hizmetleri",
      itemListElement: [
        {
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: "Elektrik Motoru Sarımı",
            description:
              "AC elektrik motorlarının fabrika standartlarında sarımı, verniklenmesi ve fırınlanması.",
          },
        },
        {
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: "Su Pompası Revizyon ve Parça Tedarik",
            description:
              "Dalgıç, santrifüj ve hidrofor sistemlerinde salmastra, rulman ve sargı yenileme; yedek parça tedariki.",
          },
        },
        {
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: "Fren Bobini Sarımı",
            description:
              "Vinç, asansör ve endüstriyel makinelerde elektromanyetik fren bobini sarımı ve testi.",
          },
        },
      ],
    },
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
        url: `${SITE_URL}/images/referanslar/IMG_5595.webp`,
        name: "Balıkesir Altınöz Bobinaj komple elektrik motor revizyonu referansı",
        description:
          "Balıkesir Altınöz Bobinaj tarafından gerçekleştirilen komple elektrik motor revizyonu ve sarımı referans çalışması.",
      },
      {
        "@type": "ImageObject",
        position: 2,
        url: `${SITE_URL}/images/referanslar/IMG_5615.webp`,
        name: "Yüksek voltajlı elektrik motor sarımı Altınöz Bobinaj Balıkesir",
        description:
          "Balıkesir'de yüksek voltajlı elektrik motor sarımı ve izolasyon işlemi Altınöz Bobinaj referans görseli.",
      },
      {
        "@type": "ImageObject",
        position: 3,
        url: `${SITE_URL}/images/referanslar/IMG_7183.webp`,
        name: "Balıkesir ağır sanayi elektrik motoru sargısı referansı",
        description:
          "Balıkesir ağır sanayi elektrik motoru sargısı ve bakım onarım hizmeti Altınöz Bobinaj referans çalışması.",
      },
      {
        "@type": "ImageObject",
        position: 4,
        url: `${SITE_URL}/images/referanslar/IMG_5289.webp`,
        name: "Servo motor tamiri ve test hattı Altınöz Bobinaj",
        description:
          "Altınöz Bobinaj Balıkesir atölyesinde gerçekleştirilen servo motor tamiri ve test hattı referans görseli.",
      },
      {
        "@type": "ImageObject",
        position: 5,
        url: `${SITE_URL}/images/referanslar/IMG_4804.webp`,
        name: "Balıkesir endüstriyel motor sarımı referans görseli",
        description:
          "Balıkesir'de endüstriyel elektrik motor sarımı ve balans ayarı Altınöz Bobinaj referans fotoğrafı.",
      },
      {
        "@type": "ImageObject",
        position: 6,
        url: `${SITE_URL}/images/referanslar/IMG_5600.webp`,
        name: "Trafo ve özel bobin sargısı Altınöz Bobinaj Balıkesir",
        description:
          "Trafo ve özel bobin sargısı üzerine Balıkesir Altınöz Bobinaj tarafından gerçekleştirilen referans çalışması.",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(referencesItemListJsonLd),
        }}
      />

      {/* Klavye kullanicilari icin icerige atlama linki */}
      <a
        href="#hero"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink-soft focus:px-4 focus:py-2 focus:text-paper focus:outline focus:outline-2 focus:outline-silver-main"
      >
        İçeriğe geç
      </a>

      <Header />
      <main className="min-h-screen pt-20">{children}</main>
      <Footer />
      <MobileCallBar />
    </>
  );
}

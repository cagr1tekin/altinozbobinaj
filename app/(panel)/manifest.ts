import type { MetadataRoute } from "next";

/**
 * Yonetim paneli icin ayri PWA manifesti.
 *
 * Pazarlama sitesinin public/site.webmanifest dosyasi degismedi; o
 * altinozbobinaj.com kok adresi icin. Bu manifest panelin ana ekrana
 * kisayol olarak eklenmesini saglar ve dogrudan /yonetim adresinde acilir.
 *
 * Not: Bu dosya /manifest.webmanifest adresinde yayinlanir. Panel
 * sayfalari bu manifesti <link rel="manifest"> ile kendileri isaret
 * etmelidir; kok layout'taki manifest landing icindir.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Altınöz Bobinaj Yönetim",
    short_name: "Altınöz Yönetim",
    description:
      "Müşteri, iş, stok ve fatura takibi. Yalnızca Altınöz Bobinaj personeli içindir.",
    lang: "tr",
    start_url: "/yonetim",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8FAFC",
    theme_color: "#F8FAFC",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Müşteriler", url: "/yonetim/musteriler" },
      { name: "Stok", url: "/yonetim/urunler" },
    ],
  };
}

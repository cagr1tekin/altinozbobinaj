import { MetadataRoute } from "next";

const BASE_URL = "https://altinozbobinaj.com";

/* İçerik her deploy'da değişmiyor; new Date() kullanmak her build'de
   lastModified'ı tazeleyip arama motorlarına yanlış sinyal veriyordu.
   İçerik güncellendiğinde bu tarih elle güncellenmeli. */
const LAST_CONTENT_UPDATE = "2026-08-31";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: LAST_CONTENT_UPDATE,
      changeFrequency: "monthly",
      priority: 1,
    },
    // Eğer ileride /hizmetlerimiz gibi sayfalar açılırsa buraya eklenecek
  ];
}

import { MetadataRoute } from "next";

const BASE_URL = "https://altinozbobinaj.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      /* /_next/ bilinçli olarak engellenmiyor: engellenirse Googlebot
         sayfanın CSS/JS'ini çekemez (render tabanlı indeksleme bozulur) ve
         /_next/image ile servis edilen optimize görseller Google Görseller'de
         indekslenemez. */
      disallow: ["/api/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}

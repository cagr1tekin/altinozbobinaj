import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://altinozbobinaj.com";

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    // Eğer ileride /hizmetlerimiz gibi sayfalar açılırsa buraya eklenecek
  ];
}

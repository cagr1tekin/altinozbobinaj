import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Kullanıcı klasöründeki başıboş bir pnpm-lock.yaml yüzünden Turbopack
     workspace root'u yanlış tahmin ediyordu; sabitliyoruz. */
  turbopack: {
    root: path.resolve(__dirname),
  },
  /* pdfjs-dist Next tarafindan bundle edilmemeli: paket kendi worker
     dosyasini (pdf.worker.mjs) calisma aninda goreceli yoldan yukluyor,
     bundle edilince o dosya chunk klasorune kopyalanmadigi icin
     "Setting up fake worker failed" hatasi veriyor. Harici birakilinca
     node_modules'tan dogrudan yukleniyor ve worker'i buluyor. */
  serverExternalPackages: ["pdfjs-dist"],
  /* Güvenlik başlıkları.
     Denetimde eksik bulundu: hiçbiri tanımlı değildi, yani panel bir
     iframe'e gömülebiliyordu (clickjacking) ve tarayıcı HTTPS'i zorlamak
     için her seferinde yönlendirmeye güveniyordu. */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          /* Panel ve landing hiçbir yerde iframe'e gömülmüyor; SAMEORIGIN
             yerine DENY, çünkü kendi sitemizde de gömmüyoruz. */
          { key: "X-Frame-Options", value: "DENY" },
          /* MIME sniffing: yüklenen fatura PDF'i tarayıcı tarafından
             başka bir tür sanılıp çalıştırılmasın. */
          { key: "X-Content-Type-Options", value: "nosniff" },
          /* Dış siteye giderken tam adres sızmasın; panel adreslerinde
             iş kimlikleri var. */
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          /* Kullanılmayan güçlü API'ler kapalı. */
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          /* HSTS: tarayıcı bir daha HTTP denemez. preload yok — geri
             alınması zor ve alan adı sahibinin bilinçli kararı olmalı. */
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        /* Panel ve müşteri belgesi asla indekslenmemeli. Sayfa
           metadata'sında da var; başlık ikinci katman ve PDF/API
           yanıtlarını da kapsıyor. */
        source: "/(yonetim|giris|j)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  images: {
    /* Projede uzak görsel yok; unsplash izni kaldırıldı.
       Uzak kaynak eklenirse remotePatterns buraya geri gelir. */
    formats: ["image/avif", "image/webp"],
  },
  poweredByHeader: false,
};

export default nextConfig;

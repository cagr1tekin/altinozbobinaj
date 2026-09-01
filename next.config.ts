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
  images: {
    /* Projede uzak görsel yok; unsplash izni kaldırıldı.
       Uzak kaynak eklenirse remotePatterns buraya geri gelir. */
    formats: ["image/avif", "image/webp"],
  },
  poweredByHeader: false,
};

export default nextConfig;

import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Kullanıcı klasöründeki başıboş bir pnpm-lock.yaml yüzünden Turbopack
     workspace root'u yanlış tahmin ediyordu; sabitliyoruz. */
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    /* Projede uzak görsel yok; unsplash izni kaldırıldı.
       Uzak kaynak eklenirse remotePatterns buraya geri gelir. */
    formats: ["image/avif", "image/webp"],
  },
  poweredByHeader: false,
};

export default nextConfig;

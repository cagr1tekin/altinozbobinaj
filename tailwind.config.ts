import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Primary – Premium Silver (3 ton) */
        "silver-light": "#F8FAFC",
        "silver-main": "#94A3B8",
        "silver-dark": "#475569",
        /* Zemin (koyu tema) */
        ink: {
          DEFAULT: "#09090b", /* Zinc 950 – sayfa zemini */
          soft: "#18181b", /* Zinc 900 – yüzey/kart zemini */
        },
        /* Metin */
        paper: {
          DEFAULT: "#fafafa", /* Zinc 50 – ana metin */
          muted: "#a1a1aa", /* Zinc 400 – ikincil metin */
        },
      },
      backgroundImage: {
        /* %10 vurgu – dekoratif silver gradient (metin maskesi, ikon zemini) */
        "silver-gradient":
          "linear-gradient(135deg, #E2E8F0 0%, #94A3B8 50%, #475569 100%)",
        /* CTA / istatistik zemini – gri gradyanın luminans aralığı daraltılmış
           hâli. 3 duraklı silver-gradient üzerine hiçbir metin rengi AA'yı
           geçemiyor (koyu ucunda text-ink 2.5:1, açık ucunda beyaz 1.1:1);
           bu iki durakla text-ink her noktada 13:1+ oluyor. */
        "silver-cta": "linear-gradient(135deg, #F1F5F9 0%, #CBD5E1 100%)",
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "sans-serif"],
        display: ["var(--font-playfair-display)", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;

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

        /* ------------------------------------------------------------------
         * YÖNETİM PANELİ — ayrı tasarım sistemi (design-system/PANEL.md)
         *
         * Yukarıdaki tokenlar pazarlama sitesinin koyu temasına ait.
         * Aşağıdakiler yalnızca /giris, /yonetim/*, /j/* içindir.
         * İki set birbirinin yerine KULLANILMAZ; pnl- öneki bu ayrımı
         * gözle görülür kılmak için var.
         * ---------------------------------------------------------------- */
        pnl: {
          bg: "#F8FAFC",        /* sayfa zemini */
          surface: "#FFFFFF",   /* kart, satır, form */
          text: "#0F172A",      /* ana metin — kart üzerinde 17.9:1 */
          muted: "#475569",     /* ikincil metin — 7.6:1 */
          faint: "#64748B",     /* üçüncül / ipucu — 4.8:1 */
          line: "#E2E8F0",      /* dekoratif ayırıcı */
          edge: "#8A94A6",      /* form kenarlığı — 3.06:1 (WCAG 1.4.11) */
          primary: "#2563EB",   /* birincil eylem — beyaz metinle 5.2:1 */
          "primary-dark": "#1D4ED8",
          success: "#15803D",
          danger: "#B91C1C",
          warn: "#B45309",
          /* Rozet zeminleri */
          "chip-neutral": "#F1F5F9",
          "chip-info": "#DBEAFE",
          "chip-info-text": "#1D4ED8",
          "chip-ok": "#DCFCE7",
          "chip-ok-text": "#166534",
          "chip-warn": "#FEF3C7",
          "chip-warn-text": "#92400E",
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
        /* Pazarlama sitesi */
        sans: ["var(--font-plus-jakarta)", "sans-serif"],
        display: ["var(--font-playfair-display)", "serif"],
        /* Yönetim paneli — tek aile, yalnızca ağırlık değişir */
        panel: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

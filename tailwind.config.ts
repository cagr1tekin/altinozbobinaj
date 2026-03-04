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
        /* Neutral – Dark Theme */
        "surface-light": "#09090b", /* Dark background (Zinc 950) */
        "surface-dark": "#fafafa", /* Light text (Zinc 50) */
      },
      backgroundImage: {
        /* %10 vurgu – silver gradient */
        "silver-gradient":
          "linear-gradient(135deg, #E2E8F0 0%, #94A3B8 50%, #475569 100%)",
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "sans-serif"],
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "marquee-reverse": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0%)" },
        },
      },
      animation: {
        marquee: "marquee 45s linear infinite",
        "marquee-slow": "marquee 70s linear infinite",
        "marquee-reverse": "marquee-reverse 45s linear infinite",
        "marquee-reverse-slow": "marquee-reverse 70s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;

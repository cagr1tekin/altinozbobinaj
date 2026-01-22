import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Primary – Bakır (3 ton) */
        "copper-light": "#E8C39E",
        "copper-main": "#C2784F",
        "copper-dark": "#8A4B29",
        /* Neutral – 60-30 kuralı */
        "surface-light": "#FAFAFA",
        "surface-dark": "#121212",
      },
      backgroundImage: {
        /* %10 vurgu – bakır gradient */
        "copper-gradient":
          "linear-gradient(135deg, #8A4B29 0%, #C2784F 50%, #E8C39E 100%)",
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

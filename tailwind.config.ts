import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink:    "#1C1612",
        amber:  "#C47B45",
        sand:   "#E8A96A",
        peach:  "#F4D4B0",
        cream:  "#F7F0E6",
        cream2: "#EFE6D8",
        sage:   "#3D7A6A",
        muted:  "#9B8878",
        border: "#E2D8CC",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        ui:      ["var(--font-plus-jakarta)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

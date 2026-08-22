import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Theme-aware CSS Variable Color Tokens */
        canvas: "rgb(var(--bg-main) / <alpha-value>)",
        card: "rgb(var(--bg-card) / <alpha-value>)",
        sidebar: "rgb(var(--bg-sidebar) / <alpha-value>)",
        borderCustom: "rgb(var(--border-color) / <alpha-value>)",
        textPrimary: "rgb(var(--text-primary) / <alpha-value>)",
        textSecondary: "rgb(var(--text-secondary) / <alpha-value>)",
        brandBlue: "rgb(var(--accent-blue) / <alpha-value>)",

        /* Existing Legacy Palette (Maintained for Backwards Compatibility) */
        navy: {
          950: "#0a0f1f",
          900: "#0f172a",
          800: "#16213e",
          700: "#1e2a4a",
        },
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          400: "#5b8def",
          500: "#3866d8",
          600: "#2a4fc0",
        },
        accent: {
          purple: "#8b7cf6",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
      keyframes: {
        pulseWave: {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        pulseWave: "pulseWave 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
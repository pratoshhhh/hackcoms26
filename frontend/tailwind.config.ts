import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        halo: {
          bg: "#0a0e14",
          panel: "#111823",
          border: "#1f2a3a",
          clear: "#22c55e",
          possible: "#eab308",
          blocked: "#ef4444",
          offline: "#64748b",
          accent: "#38bdf8",
        },
      },
    },
  },
  plugins: [],
};
export default config;

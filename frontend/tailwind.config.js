import animate from "tailwindcss-animate";
/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
      mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"],
    },
    fontSize: {
      "2xs": ["11px", "16px"],
      xs: ["12px", "16px"],
      sm: ["13px", "20px"],
      base: ["14px", "20px"],
      md: ["16px", "24px"],
      lg: ["20px", "28px"],
      xl: ["24px", "32px"],
    },
    extend: {
      colors: {
        bg: v("bg"),
        "surface-1": v("surface-1"),
        "surface-2": v("surface-2"),
        "surface-3": v("surface-3"),
        line: v("line"),
        "line-strong": v("line-strong"),
        "text-1": v("text-1"),
        "text-2": v("text-2"),
        "text-3": v("text-3"),
        accent: v("accent"),
        ok: v("ok"),
        warn: v("warn"),
        crit: v("crit"),
        muted: v("muted"),
      },
      borderRadius: { DEFAULT: "6px", md: "6px", lg: "8px" },
      transitionTimingFunction: { std: "cubic-bezier(0.2, 0, 0, 1)" },
      boxShadow: { float: "var(--shadow-float)", raise: "var(--shadow-raise)" },
    },
  },
  plugins: [animate],
};

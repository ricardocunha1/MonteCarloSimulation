/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // CM brand palette, backed by the CSS custom properties in src/index.css.
      colors: {
        cm: {
          "dark-blue": "var(--cm-dark-blue)",
          "light-blue": "var(--cm-light-blue)",
          teal: "var(--cm-teal)",
          gold: "var(--cm-gold)",
          orange: "var(--cm-orange)",
          red: "var(--cm-red)",
          purple: "var(--cm-purple)",
        },
      },
    },
  },
  plugins: [],
};

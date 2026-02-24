/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--cb-font-sans)"],
        mono: ["var(--cb-font-mono)"],
      },
      borderRadius: {
        lg: "var(--cb-radius-md)",
        md: "var(--cb-radius)",
        sm: "var(--cb-radius-sm)",
      },
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: {
          DEFAULT: "rgb(var(--foreground) / <alpha-value>)",
          2: "rgb(var(--foreground-2) / <alpha-value>)",
          3: "rgb(var(--foreground-3) / <alpha-value>)",
        },
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--popover) / <alpha-value>)",
          foreground: "rgb(var(--popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          subtle: "rgb(var(--border-subtle) / <alpha-value>)",
        },
        input: "rgb(var(--input) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        /* Direct status color access */
        status: {
          ok: "rgb(var(--cb-status-ok) / <alpha-value>)",
          warn: "rgb(var(--cb-status-warn) / <alpha-value>)",
          error: "rgb(var(--cb-status-error) / <alpha-value>)",
          info: "rgb(var(--cb-status-info) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
}

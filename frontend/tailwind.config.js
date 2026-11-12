/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1440px" },
    },
    extend: {
      spacing: {
        13: "3.25rem",
        15: "3.75rem",
      },
      colors: {
        /* VVS gold (D-72): the old teal brand scale now resolves to gold, so every teal-* class follows the landing theme. */
        teal: { 50: "#FBF8EF", 100: "#F5EDD5", 200: "#EBDCAB", 300: "#E0C77E", 400: "#D2B260", 500: "#B8913A", 600: "#9A7A2C", 700: "#7A5C1A", 800: "#5E4614", 900: "#46340F", 950: "#2A1F08" },
        ink: { DEFAULT: "#14171C", 900: "#0E1013", 800: "#16181C", 700: "#1F2228" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        "input-bg": "hsl(var(--input-bg))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: "hsl(var(--sidebar))",
        "sidebar-foreground": "hsl(var(--sidebar-foreground))",
        "sidebar-muted": "hsl(var(--sidebar-muted))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(100%)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "card-sheen": {
          from: { transform: "translateX(-150%) skewX(-12deg)" },
          to: { transform: "translateX(250%) skewX(-12deg)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.25s ease-out",
        "card-sheen": "card-sheen 900ms ease",
      },
    },
  },
  plugins: [],
};
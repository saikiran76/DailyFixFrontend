/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',
        dark: {
          DEFAULT: '#1a1b26',
          lighter: '#24283b',
        },
        gray: {
          400: '#9ca3af',
          600: '#4b5563',
          700: '#374151',
        }
      }
    },
  },
  plugins: [],
}
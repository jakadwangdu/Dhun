/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#101211',
        raise: '#232725',
        mint: '#7CF2C8',
        lime: '#D4F25A',
        lilac: '#C9A5F0',
        mute: '#8D9490',
      }
    },
  },
  plugins: [],
}

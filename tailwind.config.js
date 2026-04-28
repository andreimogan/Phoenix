/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nav: {
          bg: 'var(--nav-bg)',
          height: 'var(--nav-height)',
        },
        'nav-input': 'var(--nav-input-bg)',
        'nav-button': 'var(--nav-button-bg)',
        'nav-button-active': 'var(--nav-button-active-bg)',
        'content-bg': 'var(--content-bg)',
      },
      height: {
        nav: 'var(--nav-height)',
      },
      minHeight: {
        nav: 'var(--nav-height)',
      },
    },
  },
  plugins: [],
}

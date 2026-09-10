/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#8DD9C4',
        secondary: '#FFBFA3',
        accent: '#FFE082',
        cream: '#FFF8EF',
        charcoal: '#3A2E2A',
        warning: '#FF9F43',
        danger: '#FF6B6B',
        success: '#6BCB77',
        info: '#7EC8E3',
      },
      fontFamily: {
        sans: ['Nunito', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 20px rgba(58, 46, 42, 0.08)',
        card: '0 2px 12px rgba(58, 46, 42, 0.06)',
      },
    },
  },
  plugins: [],
};

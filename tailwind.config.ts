import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['var(--font-cairo)', 'system-ui', 'sans-serif'] },
      colors: {
        brand: {
          50: '#eefbf5',
          100: '#d6f5e6',
          500: '#12a36b',
          600: '#0d8758',
          700: '#0b6c47',
          900: '#073d29',
        },
        ink: '#14201b',
      },
    },
  },
  plugins: [],
};
export default config;

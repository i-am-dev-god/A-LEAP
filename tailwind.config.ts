import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#04070d',
        abyss: '#060c15',
        cyan: { DEFAULT: '#43e2ff', dim: '#1c8ba3' },
        amber: { DEFAULT: '#ffb648' },
        mint: '#5ff5d0',
        ember: '#ff5f7a',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      boxShadow: {
        panel: '0 24px 70px -22px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.06)',
        glow: '0 0 0 1px rgba(67,226,255,0.28), 0 0 42px -8px rgba(67,226,255,0.45)',
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
};

export default config;

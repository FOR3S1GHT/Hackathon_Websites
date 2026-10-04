import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        // Neo-brutalist neutrals (raw hex, not HSL, because they are literal palette values)
        ink: '#000000',
        paper: '#FFFFFF',
        concrete: '#808080',
        ash: '#E5E5E5',
        soot: '#242424',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        none: '0px',
      },
      borderWidth: {
        3: '3px',
        4: '4px',
      },
      fontFamily: {
        sans: ['Archivo', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        display: ['Archivo Black', 'Archivo', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '10xl': ['9.5rem', { lineHeight: '0.82', letterSpacing: '-0.045em' }],
        '9xl': ['7rem', { lineHeight: '0.85', letterSpacing: '-0.04em' }],
        '8xl': ['5rem', { lineHeight: '0.87', letterSpacing: '-0.035em' }],
      },
      boxShadow: {
        // Hard, offset, zero blur - the neo-brutalist signature.
        brutal: '4px 4px 0 0 #000000',
        'brutal-sm': '3px 3px 0 0 #000000',
        'brutal-lg': '6px 6px 0 0 #000000',
        'brutal-xl': '10px 10px 0 0 #000000',
        'brutal-invert': '4px 4px 0 0 #FFFFFF',
        'brutal-sm-invert': '3px 3px 0 0 #FFFFFF',
        'brutal-lg-invert': '6px 6px 0 0 #FFFFFF',
        'brutal-xl-invert': '10px 10px 0 0 #FFFFFF',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'marquee-reverse': {
          from: { transform: 'translateX(-50%)' },
          to: { transform: 'translateX(0)' },
        },
        blink: {
          '0%, 45%': { opacity: '1' },
          '50%, 95%': { opacity: '0.15' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        marquee: 'marquee 38s linear infinite',
        'marquee-reverse': 'marquee-reverse 38s linear infinite',
        blink: 'blink 1.6s steps(1) infinite',
        shimmer: 'shimmer 1.8s infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

export default config

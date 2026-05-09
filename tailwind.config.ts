
import type {Config} from 'tailwindcss';

export default {
  darkMode: ['class'],
  // Static production build may miss dynamically composed ribbon classes; safelist keeps them in final CSS.
  safelist: [
    // Shared ribbon utility classes used across dashboard + financial summary cards.
    'border-2',
    'bg-gradient-to-r',
    // Emerald ribbon
    'border-emerald-300/70', 'from-emerald-50', 'to-emerald-100/70', 'dark:from-emerald-950/25', 'dark:to-emerald-900/20',
    // Sky/Cyan ribbon
    'border-sky-300/70', 'from-sky-50', 'to-cyan-100/70', 'dark:from-sky-950/25', 'dark:to-cyan-900/20',
    // Violet/Fuchsia ribbon
    'border-violet-300/70', 'from-violet-50', 'to-fuchsia-100/70', 'dark:from-violet-950/25', 'dark:to-fuchsia-900/20',
    // Amber/Orange ribbon
    'border-amber-300/70', 'from-amber-50', 'to-orange-100/70', 'dark:from-amber-950/25', 'dark:to-orange-900/20',
    // Rose/Pink ribbon
    'border-rose-300/70', 'from-rose-50', 'to-pink-100/70', 'dark:from-rose-950/25', 'dark:to-pink-900/20',
    // Teal/Emerald ribbon
    'border-teal-300/70', 'from-teal-50', 'dark:from-teal-950/25',
    // Indigo/Blue ribbon
    'border-indigo-300/70', 'from-indigo-50', 'to-blue-100/70', 'dark:from-indigo-950/25', 'dark:to-blue-900/20',
    // Common gradient middle/ dark background tone.
    'via-white', 'dark:via-card',
  ],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // No Tailwind in route handlers; scanning avoids Windows EBUSY if api/ is locked (dev + build-static)
    '!./src/app/api/**',
    // Admin + components/admin yahan include zaroori: warna `md:grid-cols-[360px_1fr]` JIT me generate hi nahi hota
    // aur panel hamesha single-column dikhta hai. `build-static` admin folder hata kar build karta hai — `./src/app/**`
    // sirf maujooda files scan karta hai; missing subtree par ENOENT nahi.
  ],
  theme: {
    extend: {
      fontFamily: {
        /** `layout.tsx` me `next/font` CSS vars — CDN par depend mat karo */
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        headline: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        code: ['monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        // GlobalFileHoverPreviewSwitch + ui/Switch — knob 32px, ON end left = 100% − 35px (32+3 pad)
        'file-hover-switch-on': {
          '0%': { left: '3px', width: '32px' },
          '45%': { left: '3px', width: 'calc(100% - 6px)' },
          '100%': { left: 'calc(100% - 35px)', width: '32px' },
        },
        'file-hover-switch-off': {
          '0%': { left: 'calc(100% - 35px)', width: '32px' },
          '45%': { left: '3px', width: 'calc(100% - 6px)' },
          '100%': { left: '3px', width: '32px' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        // Header GlobalFileHoverPreviewSwitch — 400ms motion (ANIM_MS se match)
        'file-hover-switch-on': 'file-hover-switch-on 400ms linear forwards',
        'file-hover-switch-off': 'file-hover-switch-off 400ms linear forwards',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;

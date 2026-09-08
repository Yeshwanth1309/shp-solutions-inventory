import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Fonts: a system stack rather than next/font/google.
 *
 * This is a deliberate choice, not a fallback — a warehouse/counter tool run
 * on shared, possibly older machines benefits from zero webfont download, and
 * every OS's default UI face is already tuned for on-screen legibility at
 * small sizes. The stack is defined once in globals.css as --font-sans /
 * --font-mono and consumed via Tailwind's fontFamily config.
 */

export const metadata: Metadata = {
  title: 'SHP Solutions — Inventory',
  description: 'Stock tracking for printers, toners, ink and spare parts.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F7F5F1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import '../src/styles/index.css';

export const metadata: Metadata = {
  title: 'Career Navigator',
  description: 'Professional persona builder UI',
};

// PUBLIC_INTERFACE
export default function RootLayout({ children }: { children: React.ReactNode }) {
  /** Root layout for the Next.js App Router application. */
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

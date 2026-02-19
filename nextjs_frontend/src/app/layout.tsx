import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Navigator",
  description: "Professional persona builder workflow"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brand Spend Tracker",
  description: "Monthly operations spending tracker with Supabase",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false }
  }
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

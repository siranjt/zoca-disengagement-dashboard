import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import "./globals.css";
import NextAuthSessionProvider from "@/components/SessionProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Beacon — Zoca",
  description:
    "Live customer signals · auto-scored by Claude. Surfaces customers at risk from silence, response drops, and volume collapse.",
  manifest: "/manifest.json",
  themeColor: "#0b051d",
  openGraph: {
    title: "Beacon — A signal worth following.",
    description: "Live customer signals · auto-scored by Claude",
    images: ["/og-card.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Beacon — A signal worth following.",
    description: "Live customer signals · auto-scored by Claude",
    images: ["/og-card.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-16.svg",  sizes: "16x16",   type: "image/svg+xml" },
      { url: "/favicon-32.svg",  sizes: "32x32",   type: "image/svg+xml" },
      { url: "/favicon-48.svg",  sizes: "48x48",   type: "image/svg+xml" },
      { url: "/favicon-192.svg", sizes: "192x192", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable}`}>
      <body>
        <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
      </body>
    </html>
  );
}

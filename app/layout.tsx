import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Elychimp — Rule the Streets of Elysium | Hyperliquid L2",
  description:
    "Leonida grit meets high-speed on-chain culture. Assemble your 5-piece fit, claim limited drop crates, and lock your syndicate pass on Elysium L2.",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Space+Grotesk:wght@500;700;900&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-screen flex-col bg-[#08090d] text-gray-100 antialiased selection:bg-amber-400 selection:text-black">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:border-2 focus:border-black focus:bg-amber-400 focus:px-4 focus:py-2 focus:font-mono-street focus:text-xs focus:font-medium focus:text-black focus:shadow-brutal focus:outline-none"
        >
          Skip to main content
        </a>
        <Providers>
          <Navbar />
          <main id="main-content" className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

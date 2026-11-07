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
          href="https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400;1,9..40,700&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-screen flex-col bg-[#04181C] text-[#DBF2F9] antialiased selection:bg-[#34B7DD] selection:text-[#04181C]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:border focus:border-[#34B7DD] focus:bg-[#34B7DD] focus:px-4 focus:py-2 focus:focus:text-xs focus:font-bold focus:text-[#04181C] focus:shadow-lg focus:outline-none"
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

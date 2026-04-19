import type { Metadata } from "next";
import { Inter, Geist_Mono, Caveat } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Synapse — Think Inside Ideas",
  description:
    "A real-time AI thinking environment where concepts become interactive systems you can explore, manipulate, and understand.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} ${caveat.variable} h-full antialiased`}
    >
      {/*
        suppressHydrationWarning on <body>: some browser extensions (Grammarly,
        ColorZilla, etc.) inject attributes like `data-new-gr-c-s-check-loaded`
        and `data-gr-ext-installed` before React hydrates, which would otherwise
        produce a hydration mismatch. The flag is one level deep — it only
        silences the warning for <body>'s own attributes, not its children.
      */}
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-background text-foreground"
      >
        {children}
      </body>
    </html>
  );
}

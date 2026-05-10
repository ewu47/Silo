import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import "./globals.css";
import HeaderAuth from "@/components/HeaderAuth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Silo",
  description: "Data-driven commodity sale recommendations for grain farmers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col bg-zinc-50 text-zinc-900 overflow-hidden">
        <header className="border-b border-zinc-200 bg-white shrink-0">
          <div className="px-4 h-12 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image src="/silo.png" alt="Silo logo" width={36} height={36} className="object-contain" />
              <a href="/" className="text-2xl font-bold tracking-tight text-zinc-900 hover:opacity-80 transition-opacity">
                Silo
              </a>
            </div>
            <HeaderAuth />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
          <div className="px-4 h-12 flex items-center">
            <span className="text-sm font-semibold tracking-tight text-zinc-900">Silo</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

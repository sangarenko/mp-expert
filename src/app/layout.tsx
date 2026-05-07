import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MP Эксперт — AI-гуру по маркетплейсам WB & Ozon",
  description: "AI-эксперт по маркетплейсам Wildberries и Ozon. Задайте вопрос про рекламу, ранжирование, карго, логистику и получите ответ с конкретными цифрами.",
  keywords: ["Wildberries", "Ozon", "маркетплейс", "AI", "селлер", "реклама WB", "ранжирование"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

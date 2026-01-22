import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Altınöz Bobinaj | Endüstriyel Motor Sarımı ve Bakım",
  description:
    "Ankara'da profesyonel bobinaj, elektrik motoru sarımı ve bakımı. 30 yıllık tecrübe ile garantili hizmet.",
  keywords: [
    "bobinaj",
    "motor sarımı",
    "altınöz bobinaj",
    "elektrik motoru tamiri",
    "endüstriyel motor bakımı",
    "motor sargı",
    "bobinaj hizmetleri",
    "Ankara bobinaj",
  ],
  authors: [{ name: "Altınöz Bobinaj" }],
  openGraph: {
    title: "Altınöz Bobinaj | Endüstriyel Motor Sarımı ve Bakım",
    description:
      "Ankara'da profesyonel bobinaj, elektrik motoru sarımı ve bakımı. 30 yıllık tecrübe ile garantili hizmet.",
    type: "website",
    locale: "tr_TR",
    siteName: "Altınöz Bobinaj",
  },
  twitter: {
    card: "summary_large_image",
    title: "Altınöz Bobinaj | Endüstriyel Motor Sarımı ve Bakım",
    description:
      "Ankara'da profesyonel bobinaj, elektrik motoru sarımı ve bakımı. 30 yıllık tecrübe ile garantili hizmet.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={`${plusJakarta.variable} font-sans`}>
        <Header />
        <main className="min-h-screen pt-20">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

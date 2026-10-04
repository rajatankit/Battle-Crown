import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SupportChat from "../components/SupportChat";
import Footer from "../components/Footer";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Battle Crown - Esports Tournament Platform",
  description: "Join skill-based BGMI and Free Fire tournaments on Battle Crown.",
  // ── PWA ──────────────────────────────────────────────────────────
  manifest: "/manifest.json",
  icons: {
    icon: "/crown-logo.png",
    apple: "/crown-logo.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // ── PWA ──────────────────────────────────────────────────────────
  themeColor: "#0b0f17",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        {children}
        <Script
          src="https://sdk.cashfree.com/js/v3/cashfree.js"
          strategy="beforeInteractive"
        />
        <SupportChat /> {/* 2. Yahan body ke andar component rakh de */}

        <Footer />

        {/* ── PWA service worker registration ──────────────────────── */}
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch((err) => {
                  console.error('Service worker registration failed:', err);
                });
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
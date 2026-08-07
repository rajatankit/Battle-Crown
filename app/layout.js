import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SupportChat from "../components/SupportChat"; 
import Footer from "../components/Footer";


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
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        {children}
        <SupportChat /> {/* 2. Yahan body ke andar component rakh de */}

        <Footer />

      </body>
    </html>
  );
}
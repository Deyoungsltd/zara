import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { Orbitron } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "ZARA - AI Assistant",
  description: "Your personal JARVIS-like AI assistant with voice, vision, and agentic capabilities",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-512.png" },
};

export const viewport: Viewport = {
  themeColor: "#00e8ff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistMono.variable} ${orbitron.variable} antialiased bg-[#050810] text-foreground`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}

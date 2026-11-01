import { Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ui = Manrope({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-ui", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata = {
  title: "Bantay",
  description: "Keeps watch over your important bank alerts, deliveries, bills and credit card dues.",
  applicationName: "Bantay",
  appleWebApp: { capable: true, title: "Bantay", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1513" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

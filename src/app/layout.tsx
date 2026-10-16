import type { Metadata } from "next";
import { Anton, Inter_Tight, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
const display = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});
const sans = Inter_Tight({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
});
export const metadata: Metadata = {
  title: "Argue — Relay",
  description: "Different languages. A real conversation.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={display.variable + " " + sans.variable + " " + mono.variable}
      >
        {children}
      </body>
    </html>
  );
}

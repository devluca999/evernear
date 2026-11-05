import type { Metadata } from "next";
import { Space_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";

const ui = Space_Grotesk({ variable: "--font-ui-loaded", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono-loaded", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Evernear",
  description: "An agent that sources, verifies and pays for parts, on NEAR.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="clean" data-mode="dark" className={`${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

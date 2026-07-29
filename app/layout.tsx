import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OppMatch",
  description: "Find companies, programs, and opportunities that fit you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

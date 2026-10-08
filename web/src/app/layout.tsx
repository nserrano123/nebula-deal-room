import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nebula",
  description: "Your agent in the meeting you're not invited to.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Silent Witness Admin",
  description: "Internal admin dashboard for onboarding firms and deploying tenant bots."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


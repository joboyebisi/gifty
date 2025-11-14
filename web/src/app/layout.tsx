import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Providers } from "./providers";
import { TelegramAuth } from "../components/TelegramAuth";

export const metadata: Metadata = {
  title: "Gifty",
  description: "Give delightful stablecoin gifts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="relative">
        <Providers>
          <Suspense fallback={null}>
            <TelegramAuth />
          </Suspense>
          <div className="relative z-10">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

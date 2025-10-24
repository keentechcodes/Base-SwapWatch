import type { Metadata } from "next";
import "./globals.css";
// import VisualEditsMessenger from "../visual-edits/VisualEditsMessenger";
// import ErrorReporter from "@/components/ErrorReporter";
// import Script from "next/script";

// Configure for Cloudflare Pages edge runtime
export const runtime = 'edge';

// Force dynamic rendering to avoid prerendering errors
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "SwapWatch — Terminal Wallet Rooms",
  description: "Create or join a room to monitor Base Chain wallet swaps in a terminal-inspired UI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
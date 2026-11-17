import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Pixelify_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Pixel display face for headings and numbers, Plex for readable body copy.
const display = Pixelify_Sans({ subsets: ["latin"], variable: "--nf-display" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--nf-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--nf-mono" });

export const metadata: Metadata = {
  title: "SketchFrame — turn words into an animated comic movie",
  description: "Paste a script or idea. Get black-and-white sketches and a short film with consistent characters.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--card)",
              border: "2px solid var(--ink)",
              borderRadius: "4px",
              color: "var(--ink)",
              boxShadow: "var(--shadow-ink)",
              fontFamily: "var(--nf-body)",
            },
          }}
        />
      </body>
    </html>
  );
}

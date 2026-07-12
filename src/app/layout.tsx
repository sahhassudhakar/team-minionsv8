import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * "Improve Typography" — the app previously declared `font-family: "Inter"`
 * in globals.css without ever loading it, so every browser silently fell
 * back to its default UI font (Arial/Segoe UI/etc.), which is what read as
 * generic/AI-templated. These two are now actually loaded and paired the
 * way a corporate report typically is: a clean grotesk sans (Inter) for
 * interface text and tabular data, and a refined serif (Source Serif 4)
 * reserved for page titles, report headings, and the report cover — the
 * same pairing style used by consulting-style PDF reports (a serif display
 * face over a sans body) rather than one typeface doing every job.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Team Minions — Evidence & Disclosure Agent",
  description: "Evidence-first ESG disclosure platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable}`}>
      <body className="antialiased">
        <TooltipProvider delayDuration={200}>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}

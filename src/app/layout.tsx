import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Team Minions — Evidence & Disclosure Agent",
  description: "Evidence-first ESG disclosure platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <TooltipProvider delayDuration={200}>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}

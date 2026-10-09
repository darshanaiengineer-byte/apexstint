import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter, JetBrains_Mono } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import { ThemeProvider } from "@/components/site/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const barlow = Barlow_Condensed({ variable: "--font-barlow", subsets: ["latin"], weight: ["500", "600", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ApexStint — race strategy explorer", template: "%s · ApexStint" },
  description:
    "Explore recorded Formula 1 race data — lap times, pit stops and tyre stints — and compare hypothetical pit strategies with a transparent, deterministic model.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1b1c20" },
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${barlow.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2">
              Skip to content
            </a>
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

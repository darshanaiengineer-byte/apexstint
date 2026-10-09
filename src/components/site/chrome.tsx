import Link from "next/link";
import { ThemeToggle } from "./theme";

/** Original ApexStint mark: a racing line kissing an apex point. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--foreground)" />
      <path d="M6 25 C 12 25, 13 9, 20 9 S 27 15, 27 15" fill="none" stroke="var(--background)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16.4" cy="13.2" r="3" fill="var(--signal)" />
    </svg>
  );
}

const NAV = [
  { href: "/", label: "Races" },
  { href: "/methodology", label: "Methodology" },
  { href: "/data", label: "Data" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-bold uppercase tracking-wider">
          <LogoMark className="size-7" />
          <span className="hidden min-[400px]:inline">
            Apex<span className="text-signal">Stint</span>
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-0.5 text-sm" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:px-3">
              {n.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 text-sm text-muted-foreground sm:px-6 md:grid-cols-[1fr_auto]">
        <div className="max-w-2xl space-y-2">
          <p className="flex items-center gap-2 font-display text-base font-semibold uppercase tracking-wider text-foreground">
            <LogoMark className="size-5" /> ApexStint
          </p>
          <p>
            An independent fan project for exploring race strategy. Not affiliated with, endorsed by or connected to Formula 1, the FIA, any team or
            tyre supplier. F1-related trademarks belong to their owners.
          </p>
          <p>
            Race data: <a className="underline underline-offset-2 hover:text-foreground" href="https://github.com/jolpica/jolpica-f1">Jolpica-F1</a> and{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://openf1.org">OpenF1</a>, used under CC BY-NC-SA 4.0. Simulated
            figures are hypothetical.
          </p>
        </div>
        <nav className="flex gap-4 md:flex-col md:items-end" aria-label="Footer">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

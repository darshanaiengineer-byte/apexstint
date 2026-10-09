import Link from "next/link";
import { AlertTriangle, Info, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Full-panel empty / error state with an action. */
export function StatePanel({
  kind = "empty",
  title,
  children,
  action,
  className,
}: {
  kind?: "empty" | "error" | "notfound";
  title: string;
  children?: React.ReactNode;
  action?: { href: string; label: string };
  className?: string;
}) {
  const Icon = kind === "error" ? AlertTriangle : kind === "notfound" ? SearchX : Info;
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center", className)}
      role={kind === "error" ? "alert" : undefined}
    >
      <Icon className={cn("size-8", kind === "error" ? "text-destructive" : "text-muted-foreground")} aria-hidden />
      <h2 className="font-display text-2xl font-semibold uppercase tracking-wide">{title}</h2>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && (
        <Button asChild variant="outline" className="mt-2">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}

/** Inline note. "recorded" and "hypo" tones reinforce the data-provenance language. */
export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "hypo" | "recorded";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-border bg-muted/40",
    warn: "border-amber-500/40 bg-amber-500/10",
    hypo: "border-hypo/40 bg-hypo/10",
    recorded: "border-signal/40 bg-signal/10",
  } as const;
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>
      {title && <p className="mb-1 font-semibold text-foreground">{title}</p>}
      <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div>
    </div>
  );
}

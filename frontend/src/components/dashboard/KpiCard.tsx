import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean; neutral?: boolean; suffix?: string };
  progress?: number;
  icon?: LucideIcon;
};

export function KpiCard({ label, value, delta, progress, icon: Icon }: Props) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/40">
      <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        {Icon && <Icon className="size-4 text-muted-foreground" />}
      </div>
      <div className="font-mono text-3xl font-semibold tracking-tighter tabular-nums">
        {value}
      </div>
      {delta && (
        <div
          className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"
        >
          <span
            className={`rounded px-1.5 py-0.5 ${
              delta.neutral
                ? "bg-white/5"
                : delta.positive
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {delta.value}
          </span>
          <span className="text-muted-foreground">{delta.suffix ?? "vs período anterior"}</span>
        </div>
      )}
      {progress !== undefined && (
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-primary transition-all duration-700"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
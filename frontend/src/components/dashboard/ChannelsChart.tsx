import type { Client } from "@/lib/api/client";

type Props = { clients: Client[] };

export function ChannelsChart({ clients }: Props) {
  // Top 5 clientes por investimento.
  const rows = [...clients]
    .map((c) => ({
      name: c.name,
      roas: c.summary.roas,
      spend: c.summary.total_spend,
      currency: c.currency,
    }))
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  if (!rows.length) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-6">
          <h3 className="font-semibold">Performance por Cliente</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Sem dados no período.</p>
        </div>
      </div>
    );
  }

  const max = Math.max(...rows.map((c) => c.roas), 1);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border p-6">
        <h3 className="font-semibold">Top Clientes (ROAS)</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{rows.length} maiores por investimento</p>
      </div>
      <div className="space-y-5 p-6">
        {rows.map((c) => {
          const pct = (c.roas / max) * 100;
          return (
            <div key={c.name} className="group">
              <div className="mb-2 flex justify-between text-sm">
                <span className="truncate pr-3 text-muted-foreground transition-colors group-hover:text-foreground">
                  {c.name}
                </span>
                <span className="font-mono tabular-nums">{c.roas.toFixed(2)}x</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-700 group-hover:from-primary group-hover:to-[oklch(0.7_0.17_162)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                Investimento {c.spend.toLocaleString("pt-BR", { style: "currency", currency: c.currency || "BRL", maximumFractionDigits: 0 })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

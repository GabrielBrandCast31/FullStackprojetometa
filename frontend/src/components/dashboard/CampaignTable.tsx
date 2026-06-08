import { fmtMoney, fmtNum, type Campaign } from "@/lib/api/client";

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "ACTIVE";
  const isPaused = (status || "").includes("PAUSED");
  const label = isActive ? "Ativa" : isPaused ? "Pausada" : status || "—";
  const map = isActive
    ? "bg-success/10 text-success"
    : isPaused
    ? "bg-primary/10 text-primary"
    : "bg-white/5 text-muted-foreground";
  const dot = isActive ? "bg-success" : isPaused ? "bg-primary" : "bg-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${map}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

type Props = { campaigns: Campaign[]; limit?: number };

export function CampaignTable({ campaigns, limit = 25 }: Props) {
  const rows = [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, limit);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-6">
        <div>
          <h3 className="font-semibold">Detalhe de Campanhas</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rows.length} de {campaigns.length} campanhas {campaigns.length > limit && "(top por gasto)"}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-4 font-medium">Campanha</th>
              <th className="px-6 py-4 font-medium">Cliente</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 text-right font-medium">Investido</th>
              <th className="px-6 py-4 text-right font-medium">Resultados</th>
              <th className="px-6 py-4 text-right font-medium">CPA</th>
              <th className="px-6 py-4 text-right font-medium">ROAS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!rows.length && (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma campanha no período.
              </td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-white/[0.02]">
                <td className="px-6 py-4 font-medium">{c.name}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{c.client}</td>
                <td className="px-6 py-4"><StatusBadge status={c.status} /></td>
                <td className="px-6 py-4 text-right font-mono tabular-nums">{fmtMoney(c.spend, c.currency)}</td>
                <td className="px-6 py-4 text-right font-mono tabular-nums">
                  {fmtNum(c.results)}
                  {c.results_label && <span className="ml-1 text-[10px] text-muted-foreground">{c.results_label}</span>}
                </td>
                <td className="px-6 py-4 text-right font-mono tabular-nums">
                  {c.cost_per_result ? fmtMoney(c.cost_per_result, c.currency) : "—"}
                </td>
                <td className={`px-6 py-4 text-right font-mono tabular-nums ${
                  c.roas >= 2 ? "text-success" : c.roas >= 1 ? "" : "text-destructive"
                }`}>
                  {c.roas.toFixed(2)}x
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

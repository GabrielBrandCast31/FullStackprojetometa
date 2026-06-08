import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Search, RefreshCw, LogOut, AlertCircle, FileText } from "lucide-react";
import { useDashboard, type Period } from "@/hooks/useDashboard";
import { fmtMoney, fmtNum } from "@/lib/api/client";
import { cpaClass, cpaMedian, roasClass } from "@/lib/saldo";
// @ts-expect-error report.js — gerador PDF de campanhas filtradas
import { generateCampaignsReport } from "@/lib/report.js";

const PERIODS: { id: Period; label: string }[] = [
  { id: "last_7d", label: "7 dias" },
  { id: "last_30d", label: "30 dias" },
  { id: "last_90d", label: "90 dias" },
];

export const Route = createFileRoute("/campaigns")({
  head: () => ({ meta: [{ title: "Campanhas — Brandcast" }] }),
  component: CampaignsPage,
});

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "ACTIVE";
  const isPaused = (status || "").includes("PAUSED");
  const label = isActive ? "Ativa" : isPaused ? "Pausada" : status || "—";
  const cls = isActive
    ? "bg-success/10 text-success"
    : isPaused
    ? "bg-primary/10 text-primary"
    : "bg-white/5 text-muted-foreground";
  const dot = isActive ? "bg-success" : isPaused ? "bg-primary" : "bg-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cls}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function CampaignsPage() {
  const nav = useNavigate();
  const [period, setPeriod] = useState<Period>("last_30d");
  const d = useDashboard(period);

  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "PAUSED" | "ALL">("ACTIVE");
  const [clientFilter, setClientFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"spend" | "roas" | "results" | "ctr">("spend");

  const allCampaigns = useMemo(
    () => d.clients.flatMap((c) =>
      c.campaigns.map((cp) => ({ ...cp, currency: c.currency, _clientName: c.name }))),
    [d.clients],
  );

  const clientOptions = useMemo(
    () => [...new Set(d.clients.map((c) => c.name))].sort(),
    [d.clients],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCampaigns.filter((c) => {
      if (statusFilter === "ACTIVE" && c.status !== "ACTIVE") return false;
      if (statusFilter === "PAUSED" && !(c.status || "").includes("PAUSED")) return false;
      if (clientFilter !== "ALL" && c._clientName !== clientFilter) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => {
      if (sortBy === "spend") return b.spend - a.spend;
      if (sortBy === "roas") return b.roas - a.roas;
      if (sortBy === "results") return b.results - a.results;
      if (sortBy === "ctr") return b.ctr - a.ctr;
      return 0;
    });
  }, [allCampaigns, statusFilter, clientFilter, search, sortBy]);

  const cpaRef = useMemo(() => cpaMedian(filtered), [filtered]);

  if (!d.authChecked || d.tokenConfigured === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Verificando sessão...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary/30">
      <Sidebar onLogout={d.logout} userName={d.user?.name || d.user?.email || ""} />

      <main className="p-6 lg:ml-64 lg:p-8">
        <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Campanhas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {d.loading
                ? "Carregando..."
                : <>
                    {filtered.length} de {allCampaigns.length} campanha(s)
                    {d.fromCache && <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">cache 30min</span>}
                  </>}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {PERIODS.map((p) => (
                <button key={p.id} onClick={() => setPeriod(p.id)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    period === p.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            {filtered.length > 0 && (
              <button onClick={() => generateCampaignsReport({
                campaigns: filtered, clients: d.clients, datePreset: period,
                filters: { statusFilter, clientFilter, search },
                onError: () => {},
              })} title="PDF das campanhas filtradas"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground">
                <FileText className="size-4" /> PDF
              </button>
            )}
            <button onClick={d.refresh} disabled={d.loading}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-50">
              <RefreshCw className={`size-4 ${d.loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
            <button onClick={d.logout}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
              <LogOut className="size-4" /> Sair
            </button>
          </div>
        </header>

        {d.error && (
          <div className="mb-6 flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" /> {d.error}
          </div>
        )}

        {/* Filtros */}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm">
            <option value="ACTIVE">Apenas ativas</option>
            <option value="PAUSED">Pausadas</option>
            <option value="ALL">Todas</option>
          </select>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm">
            <option value="ALL">Todos os clientes</option>
            {clientOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" placeholder="Buscar campanha..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm">
            <option value="spend">Ordenar: Maior gasto</option>
            <option value="roas">Ordenar: Maior ROAS</option>
            <option value="results">Ordenar: Mais conversões</option>
            <option value="ctr">Ordenar: Maior CTR</option>
          </select>
        </div>

        {/* Tabela */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Campanha</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Investido</th>
                  <th className="px-4 py-3 text-right font-medium">Impressões</th>
                  <th className="px-4 py-3 text-right font-medium">Alcance</th>
                  <th className="px-4 py-3 text-right font-medium">Cliques</th>
                  <th className="px-4 py-3 text-right font-medium">CTR</th>
                  <th className="px-4 py-3 text-right font-medium">Conversões</th>
                  <th className="px-4 py-3 text-right font-medium">Custo/Conv.</th>
                  <th className="px-4 py-3 text-right font-medium">Conversas</th>
                  <th className="px-4 py-3 text-right font-medium">Receita</th>
                  <th className="px-4 py-3 text-right font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => (
                  <tr key={c.id}
                      className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                      onClick={() => nav({ to: "/campaigns/$id", params: { id: c.id } })}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name}</div>
                      {c.objective && <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{c.objective}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{c._clientName}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtMoney(c.spend, c.currency)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtNum(c.impressions)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtNum(c.reach)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {fmtNum(c.clicks)}
                      {c.link_clicks > 0 && (
                        <div className="text-[10px] text-muted-foreground">{fmtNum(c.link_clicks)} no link</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{c.ctr.toFixed(2)}%</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {fmtNum(c.results)}
                      {c.results_label && <div className="text-[10px] text-muted-foreground">{c.results_label}</div>}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${cpaClass(c.cost_per_result, cpaRef)}`}>
                      {c.cost_per_result ? fmtMoney(c.cost_per_result, c.currency) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtNum(c.conversations)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtMoney(c.revenue, c.currency)}</td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${roasClass(c.roas)}`}>
                      {c.roas.toFixed(2)}x
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={13} className="p-8 text-center text-sm text-muted-foreground">
                    Nenhuma campanha para os filtros atuais.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { CostChart } from "@/components/dashboard/CostChart";
import { SaldoModal } from "@/components/dashboard/SaldoModal";
import { ChevronLeft, DollarSign, MousePointerClick, TrendingUp, Wallet, Target, BarChart3, Eye, Users, MessageCircle, LogOut, RefreshCw } from "lucide-react";
import { useDashboard, type Period } from "@/hooks/useDashboard";
import { fmtMoney, fmtNum } from "@/lib/api/client";
import { computeSaldo, accountStatusLabel, cpaClass, cpaMedian, roasClass } from "@/lib/saldo";

const PERIODS: { id: Period; label: string }[] = [
  { id: "last_7d", label: "7d" }, { id: "last_30d", label: "30d" }, { id: "last_90d", label: "90d" },
];

export const Route = createFileRoute("/clients/$id")({
  head: () => ({ meta: [{ title: "Cliente — Brandcast" }] }),
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const nav = useNavigate();
  const { id } = useParams({ from: "/clients/$id" });
  const [period, setPeriod] = useState<Period>("last_30d");
  const d = useDashboard(period);
  const [editing, setEditing] = useState(false);

  const client = useMemo(
    () => d.clients.find((c) => c.account_id === id) || null,
    [d.clients, id],
  );

  const saldo = useMemo(
    () => client ? computeSaldo(client, d.manualSaldo, period) : null,
    [client, d.manualSaldo, period],
  );

  // KPIs do cliente
  const k = useMemo(() => {
    if (!client) return null;
    const camps = client.campaigns || [];
    const spend = camps.reduce((s, c) => s + c.spend, 0);
    const revenue = camps.reduce((s, c) => s + c.revenue, 0);
    const results = camps.reduce((s, c) => s + (c.results || 0), 0);
    const conversations = camps.reduce((s, c) => s + (c.conversations || 0), 0);
    const impressions = camps.reduce((s, c) => s + c.impressions, 0);
    const reach = camps.reduce((s, c) => s + (c.reach || 0), 0);
    const clicks = camps.reduce((s, c) => s + c.clicks, 0);
    return {
      spend, revenue, results, conversations, impressions, reach, clicks,
      ctr: impressions ? (clicks / impressions) * 100 : 0,
      cpc: clicks ? spend / clicks : 0,
      cpa: results ? spend / results : 0,
      cpcv: conversations ? spend / conversations : 0,
      roas: spend ? revenue / spend : 0,
    };
  }, [client]);

  const cpaRef = useMemo(() => cpaMedian(client?.campaigns || []), [client]);

  // Trend vs período anterior
  const prev = client?.summary_previous;
  function delta(curr: number | undefined, previous: number | undefined): { value: string; positive: boolean } | undefined {
    if (curr == null || !previous) return undefined;
    const v = ((curr - previous) / previous) * 100;
    return { value: `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`, positive: v > 0 };
  }

  // Cliente não está no overview ainda (carregando) ou ID inválido
  useEffect(() => {
    if (!d.loading && d.clients.length && !client) {
      // ID inválido — volta pra lista
      nav({ to: "/clients" });
    }
  }, [client, d.loading, d.clients.length, nav]);

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
        <header className="mb-6 flex items-start gap-4">
          <button onClick={() => nav({ to: "/clients" })}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground">
            <ChevronLeft className="size-4" /> Clientes
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Cliente · Meta Ads</div>
            <h1 className="mt-0.5 truncate text-3xl font-bold tracking-tight">
              {client?.name || (d.loading ? "Carregando..." : "—")}
            </h1>
            {client && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                  client.account_status === 1 ? "bg-success/10 text-success" : "bg-white/5"
                }`}>
                  <span className={`size-1.5 rounded-full ${client.account_status === 1 ? "bg-success" : "bg-muted-foreground"}`} />
                  {accountStatusLabel(client.account_status)}
                </span>
                <span>{client.campaigns.length} campanha(s)</span>
                <span>·</span>
                <span className="font-mono">{client.currency}</span>
                <span>·</span>
                <span className="font-mono">act_{client.account_id}</span>
                {d.fromCache && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">cache 30min</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {PERIODS.map((p) => (
                <button key={p.id} onClick={() => setPeriod(p.id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    period === p.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5"
                  }`}>{p.label}</button>
              ))}
            </div>
            <button onClick={d.refresh} disabled={d.loading}
              className="rounded-md border border-border bg-card p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-50">
              <RefreshCw className={`size-4 ${d.loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={d.logout} title="Sair"
              className="rounded-md border border-border bg-card p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        {/* Saldo strip */}
        {client && saldo && saldo.known && (
          <div className={`mb-6 flex items-center gap-6 rounded-2xl border border-border border-l-4 bg-card p-5 ${
            saldo.level === "critical" ? "border-l-destructive"
            : saldo.level === "warn" ? "border-l-yellow-400"
            : "border-l-success"
          }`}>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo Restante</div>
              <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                saldo.level === "critical" ? "text-destructive"
                : saldo.level === "warn" ? "text-yellow-400" : "text-success"
              }`}>{fmtMoney(saldo.remaining, client.currency)}</div>
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{saldo.consumedPct.toFixed(1).replace(".", ",")}%</strong> consumido ·
                gasto ~{fmtMoney(saldo.dailyRate, client.currency)}/dia
                {saldo.daysLeft != null && <> · {Math.max(0, Math.floor(saldo.daysLeft))} dia(s) restantes</>}
              </p>
              <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-white/5">
                <div className={
                  saldo.level === "critical" ? "h-full bg-destructive"
                  : saldo.level === "warn" ? "h-full bg-yellow-400" : "h-full bg-success"
                } style={{ width: `${Math.min(saldo.consumedPct, 100)}%` }} />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground/70">Fonte: {saldo.source}</div>
            </div>
            <button onClick={() => setEditing(true)}
              className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground">
              Ajustar saldo
            </button>
          </div>
        )}

        {/* KPIs */}
        {client && k && (
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <KpiCard label="Investido" value={fmtMoney(k.spend, client.currency)} icon={DollarSign}
              delta={delta(k.spend, prev?.total_spend)} />
            <KpiCard label="Resultados" value={fmtNum(k.results)} icon={Target}
              delta={delta(k.results, prev?.total_results)} />
            <KpiCard label="Custo/Resultado" value={k.cpa ? fmtMoney(k.cpa, client.currency) : "—"} icon={Wallet}
              delta={delta(k.cpa, prev?.cpa)} />
            <KpiCard label="Conversas" value={fmtNum(k.conversations)} icon={MessageCircle}
              delta={delta(k.conversations, prev?.total_conversations)} />
            <KpiCard label="ROAS" value={k.roas.toFixed(2) + "x"} icon={TrendingUp}
              delta={delta(k.roas, prev?.roas)} />
            <KpiCard label="Receita" value={fmtMoney(k.revenue, client.currency)} icon={DollarSign}
              delta={delta(k.revenue, prev?.total_revenue)} />
            <KpiCard label="Impressões" value={fmtNum(k.impressions)} icon={Eye}
              delta={delta(k.impressions, prev?.total_impressions)} />
            <KpiCard label="Alcance" value={fmtNum(k.reach)} icon={Users} />
            <KpiCard label="Cliques" value={fmtNum(k.clicks)} icon={MousePointerClick}
              delta={delta(k.clicks, prev?.total_clicks)} />
            <KpiCard label="CTR" value={k.ctr.toFixed(2).replace(".", ",") + "%"} icon={BarChart3}
              delta={delta(k.ctr, prev?.avg_ctr)} />
            <KpiCard label="CPC" value={k.cpc ? fmtMoney(k.cpc, client.currency) : "—"} icon={Wallet} />
            <KpiCard label="Custo/Conversa" value={k.cpcv ? fmtMoney(k.cpcv, client.currency) : "—"} icon={MessageCircle}
              delta={delta(k.cpcv, prev?.cost_per_conversation)} />
          </div>
        )}

        {/* Timeseries do cliente */}
        {client && (
          <div className="mb-6">
            <CostChart clients={[client]} period={period} />
          </div>
        )}

        {/* Tabela de campanhas */}
        {client && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-6">
              <h3 className="font-semibold">Campanhas do Cliente</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{client.campaigns.length} no período</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Campanha</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Investido</th>
                    <th className="px-4 py-3 text-right font-medium">Resultados</th>
                    <th className="px-4 py-3 text-right font-medium">Custo/Conv.</th>
                    <th className="px-4 py-3 text-right font-medium">Cliques</th>
                    <th className="px-4 py-3 text-right font-medium">CTR</th>
                    <th className="px-4 py-3 text-right font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...client.campaigns].sort((a, b) => b.spend - a.spend).map((c) => {
                    const isActive = c.status === "ACTIVE";
                    return (
                      <tr key={c.id} className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                          onClick={() => nav({ to: "/campaigns/$id", params: { id: c.id } })}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{c.name}</div>
                          {c.objective && <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{c.objective}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            isActive ? "bg-success/10 text-success" : "bg-white/5 text-muted-foreground"
                          }`}>
                            <span className={`size-1.5 rounded-full ${isActive ? "bg-success" : "bg-muted-foreground"}`} />
                            {isActive ? "Ativa" : "Pausada"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtMoney(c.spend, client.currency)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtNum(c.results)}</td>
                        <td className={`px-4 py-3 text-right font-mono tabular-nums ${cpaClass(c.cost_per_result, cpaRef)}`}>
                          {c.cost_per_result ? fmtMoney(c.cost_per_result, client.currency) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtNum(c.clicks)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{c.ctr.toFixed(2)}%</td>
                        <td className={`px-4 py-3 text-right font-mono tabular-nums ${roasClass(c.roas)}`}>{c.roas.toFixed(2)}x</td>
                      </tr>
                    );
                  })}
                  {!client.campaigns.length && (
                    <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                      Nenhuma campanha no período.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {client && editing && (
          <SaldoModal clientName={client.name}
            current={d.manualSaldo[client.account_id]}
            onClose={() => setEditing(false)}
            onSave={(valor, data) => { d.updateSaldo(client.account_id, valor, data); setEditing(false); }}
            onRemove={() => { d.removeSaldo(client.account_id); setEditing(false); }} />
        )}
      </main>
    </div>
  );
}

import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { CostChart } from "@/components/dashboard/CostChart";
import { SaldoModal } from "@/components/dashboard/SaldoModal";
import { ChevronLeft, DollarSign, MousePointerClick, TrendingUp, Wallet, Target, BarChart3, Eye, Users, MessageCircle, LogOut, RefreshCw, FileText, Trophy, Flame, Sparkles } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboard, type Period } from "@/hooks/useDashboard";
import { fmtMoney, fmtNum } from "@/lib/api/client";
import { computeSaldo, accountStatusLabel, cpaClass, cpaMedian, roasClass } from "@/lib/saldo";
// @ts-expect-error report.js — gerador PDF
import { generateReport } from "@/lib/report.js";

const PALETTE = ["#6C02ED", "#a78bfa", "#3D0DD0", "#4ade80", "#56d4dd", "#fb923c", "#facc15", "#f87171"];
const tooltipStyle: React.CSSProperties = {
  background: "oklch(0.185 0.005 285)", border: "1px solid oklch(0.27 0.01 285)",
  borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Mono, monospace",
};

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
            {client && (
              <button onClick={() => generateReport({
                clients: [client], accountId: client.account_id, datePreset: period,
                manualSaldo: d.manualSaldo, onError: () => {},
              })} title="Relatório PDF deste cliente"
                className="rounded-md border border-border bg-card p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground">
                <FileText className="size-4" />
              </button>
            )}
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

        {/* Destaques (top performers do cliente) */}
        {client && client.campaigns.length > 0 && (
          <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <HighlightCard
              icon={Trophy} cls="border-l-success text-success bg-success/5"
              title="Melhor ROAS"
              campaign={[...client.campaigns].filter((c) => c.spend > 0)
                .sort((a, b) => b.roas - a.roas)[0]}
              valueFmt={(c) => `${c.roas.toFixed(2)}x`}
              currency={client.currency}
            />
            <HighlightCard
              icon={Sparkles} cls="border-l-primary text-primary bg-primary/5"
              title="Menor Custo/Conversão"
              campaign={[...client.campaigns].filter((c) => c.cost_per_result > 0)
                .sort((a, b) => a.cost_per_result - b.cost_per_result)[0]}
              valueFmt={(c) => fmtMoney(c.cost_per_result, client.currency)}
              currency={client.currency}
            />
            <HighlightCard
              icon={Flame} cls="border-l-orange-400 text-orange-400 bg-orange-400/5"
              title="Mais Conversões"
              campaign={[...client.campaigns].filter((c) => c.results > 0)
                .sort((a, b) => b.results - a.results)[0]}
              valueFmt={(c) => fmtNum(c.results) + " " + (c.results_label || "")}
              currency={client.currency}
            />
          </section>
        )}

        {/* Gráficos: distribuição + funil lado a lado */}
        {client && client.campaigns.length > 0 && (
          <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BudgetDistribution client={client} />
            <DeliveryFunnel client={client} />
          </section>
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

// ============== Cards de destaque (Top performers) ==============
type Campaign = NonNullable<ReturnType<typeof useDashboard>["clients"][number]["campaigns"][number]>;

function HighlightCard({ icon: Icon, cls, title, campaign, valueFmt }: {
  icon: typeof Trophy;
  cls: string;
  title: string;
  campaign?: Campaign;
  valueFmt: (c: Campaign) => string;
  currency: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-l-2 border-border bg-card p-5 ${cls}`}>
      <div className="flex items-center gap-2">
        <Icon className="size-4" />
        <span className="text-[10px] font-bold uppercase tracking-widest">{title}</span>
      </div>
      {campaign ? (
        <>
          <div className="mt-2 truncate text-sm font-medium text-foreground" title={campaign.name}>
            {campaign.name}
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums">{valueFmt(campaign)}</div>
        </>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">Sem dados no período.</div>
      )}
    </div>
  );
}

// ============== Donut: Distribuição do orçamento entre campanhas ==============
function BudgetDistribution({ client }: { client: NonNullable<ReturnType<typeof useDashboard>["clients"][number]> }) {
  const camps = [...client.campaigns]
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend);
  const top = camps.slice(0, 7);
  const restSum = camps.slice(7).reduce((s, c) => s + c.spend, 0);
  const data = top.map((c) => ({ name: c.name.length > 30 ? c.name.slice(0, 28) + "…" : c.name, value: c.spend }));
  if (restSum > 0) data.push({ name: "Outros", value: restSum });
  const total = data.reduce((s, d) => s + d.value, 0);
  const topPct = data.length && total ? (data[0].value / total) * 100 : 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border p-5">
        <h3 className="font-semibold">Distribuição do Orçamento</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {camps.length} campanha(s) com gasto · concentração no top: <strong className="text-foreground">{topPct.toFixed(1).replace(".", ",")}%</strong>
        </p>
      </div>
      <div className="p-5">
        <div className="relative h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={62} outerRadius={100}
                paddingAngle={2} strokeWidth={2} stroke="oklch(0.18 0.04 295)">
                {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v: number) => [fmtMoney(v, client.currency), "Investido"]} />
            </PieChart>
          </ResponsiveContainer>
          {data[0] && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-6">
              <div className="font-mono text-2xl font-bold tabular-nums">{topPct.toFixed(0)}%</div>
              <div className="max-w-[140px] truncate px-2 text-[10px] uppercase tracking-wider text-muted-foreground">{data[0].name}</div>
            </div>
          )}
        </div>
        {/* Legenda compacta */}
        <ul className="mt-4 space-y-1.5 text-xs">
          {data.slice(0, 6).map((d, i) => (
            <li key={d.name} className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="flex-1 truncate text-muted-foreground">{d.name}</span>
              <span className="font-mono tabular-nums">{fmtMoney(d.value, client.currency)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ============== Bar chart: Funil Impressões / Alcance / Cliques / Conversões ==============
function DeliveryFunnel({ client }: { client: NonNullable<ReturnType<typeof useDashboard>["clients"][number]> }) {
  const totals = client.campaigns.reduce(
    (acc, c) => ({
      impressions: acc.impressions + (c.impressions || 0),
      reach: acc.reach + (c.reach || 0),
      link_clicks: acc.link_clicks + (c.link_clicks || 0),
      results: acc.results + (c.results || 0),
    }),
    { impressions: 0, reach: 0, link_clicks: 0, results: 0 },
  );
  const data = [
    { label: "Impressões", value: totals.impressions, color: "#6C02ED" },
    { label: "Alcance", value: totals.reach, color: "#a78bfa" },
    { label: "Cliques no link", value: totals.link_clicks, color: "#56d4dd" },
    { label: "Conversões", value: totals.results, color: "#4ade80" },
  ];
  const base = totals.impressions || 1;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border p-5">
        <h3 className="font-semibold">Impressões × Alcance × Conversões</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Funil de entrega: cada etapa relativa ao total de impressões.
        </p>
      </div>
      <div className="p-5">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
              <CartesianGrid stroke="oklch(0.27 0.01 285)" strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="label" stroke="oklch(0.62 0.01 285)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="oklch(0.62 0.01 285)" fontSize={10} tickLine={false} axisLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v: number) => {
                  const pct = ((v / base) * 100).toFixed(1).replace(".", ",");
                  return [`${fmtNum(v)} · ${pct}% de impressões`, "Valor"];
                }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          {data.map((d, i) => (
            <div key={i} className="rounded-md border border-border bg-background/50 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.label}</div>
              <div className="font-mono text-sm font-semibold tabular-nums" style={{ color: d.color }}>
                {fmtNum(d.value)}
              </div>
              {i > 0 && (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {((d.value / base) * 100).toFixed(1).replace(".", ",")}% das impr.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { CostChart } from "@/components/dashboard/CostChart";
import { CampaignBreakdownModal } from "@/components/dashboard/CampaignBreakdownModal";
import {
  DollarSign, MousePointerClick, TrendingUp, Wallet, Target, BarChart3,
  Eye, Users, MessageCircle, LogOut, RefreshCw, Trophy, Flame, Sparkles, Search, FileText,
} from "lucide-react";
import { useDashboard, type Period } from "@/hooks/useDashboard";
import { fmtMoney, fmtNum, saveMetaToken, getManualSaldo, type Client, type Campaign } from "@/lib/api/client";
import { roasClass, cpaClass, cpaMedian } from "@/lib/saldo";
// @ts-expect-error report.js — gerador de relatório PDF Brandcast
import { generateReport } from "@/lib/report.js";

// Paleta refinada: roxo Brandcast como dominante + acentos pastéis pra contraste.
const PALETTE = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#4ade80", "#5eead4", "#fbbf24", "#fb7185", "#f472b6"];
const PERIODS: { id: Period; label: string }[] = [
  { id: "last_7d", label: "7d" }, { id: "last_30d", label: "30d" }, { id: "last_90d", label: "90d" },
];
// Tooltip estilo Lovable: card escuro com border-radius generoso, sombra suave.
const tooltipStyle: React.CSSProperties = {
  background: "rgba(20, 17, 38, 0.96)",
  border: "1px solid rgba(139, 92, 246, 0.25)",
  borderRadius: 12,
  fontSize: 12,
  fontFamily: "IBM Plex Mono, monospace",
  padding: "8px 12px",
  boxShadow: "0 8px 24px -4px rgba(0,0,0,0.4)",
  backdropFilter: "blur(8px)",
};
const tooltipItemStyle: React.CSSProperties = { color: "#f4f4f5" };
const tooltipLabelStyle: React.CSSProperties = { color: "#a78bfa", fontWeight: 600, marginBottom: 4 };
// Eixos / grid sutis (estilo Lovable: aparecem mas não dominam).
const AXIS_COLOR = "rgba(167, 139, 250, 0.55)";
const GRID_COLOR = "rgba(167, 139, 250, 0.10)";
const axisProps = {
  stroke: AXIS_COLOR, fontSize: 10, tickLine: false, axisLine: false,
  tick: { fill: AXIS_COLOR },
};

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard de Clientes — Brandcast" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const nav = useNavigate();
  const [period, setPeriod] = useState<Period>("last_30d");
  const d = useDashboard(period);
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [tokenError, setTokenError] = useState("");

  // Seleciona o primeiro cliente automaticamente quando a lista chega
  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? d.clients.filter((c) => c.name.toLowerCase().includes(q)) : d.clients;
  }, [d.clients, search]);

  // Auto-select primeiro cliente
  if (!selectedId && filteredClients.length > 0) {
    setTimeout(() => setSelectedId(filteredClients[0].account_id), 0);
  }

  const client = useMemo(
    () => d.clients.find((c) => c.account_id === selectedId) || null,
    [d.clients, selectedId],
  );

  async function onSubmitToken(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setSavingToken(true); setTokenError("");
    try {
      await saveMetaToken(tokenInput.trim());
      setTokenInput("");
      // força reload da página pra refazer auth + token check
      window.location.reload();
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSavingToken(false);
    }
  }

  // ===== Loading / Token state =====
  if (!d.authChecked) {
    return <FullScreenMsg>Verificando sessão...</FullScreenMsg>;
  }

  if (d.tokenConfigured === false) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar onLogout={d.logout} userName={d.user?.name || ""} />
        <main className="p-8 lg:ml-64">
          <h1 className="mb-1 text-3xl font-bold">Dashboard de Clientes</h1>
          <p className="mb-6 text-sm text-muted-foreground">Primeiro: conecte o token do Meta.</p>

          <form onSubmit={onSubmitToken} className="max-w-2xl rounded-2xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold">Cole o System User Token do Meta</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Vai ser salvo no banco, vinculado ao seu usuário. Você não precisa cadastrar de novo.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                type="password" required autoFocus placeholder="EAA..."
                value={tokenInput} onChange={(e) => setTokenInput(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button type="submit" disabled={savingToken}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {savingToken ? "Salvando..." : "Conectar"}
              </button>
            </div>
            {tokenError && <p className="mt-3 text-sm text-destructive">{tokenError}</p>}
          </form>
        </main>
      </div>
    );
  }

  // ===== Tela principal: lista esquerda + detalhe direita =====
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <Sidebar onLogout={d.logout} userName={d.user?.name || ""} />

      <main className="lg:ml-64">
        <header className="border-b border-border px-6 py-5 lg:px-8">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Dashboard de Clientes</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Selecione um cliente à esquerda pra ver os detalhes.
                {d.fromCache && <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">cache 30min</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Relatório PDF — sempre visível. Gera do cliente selecionado, ou
                  consolidado de todos se nenhum estiver selecionado. */}
              <button
                onClick={() => generateReport({
                  clients: client ? [client] : d.clients,
                  accountId: client ? client.account_id : null,
                  datePreset: period,
                  manualSaldo: getManualSaldo(),
                  onError: (m: string) => alert(m),
                })}
                disabled={!d.clients.length}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_4px_16px_-4px_rgba(139,92,246,0.5)] transition-all hover:brightness-110 disabled:opacity-40">
                <FileText className="size-4" />
                {client ? "Relatório do Cliente" : "Relatório Geral"}
              </button>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                {PERIODS.map((p) => (
                  <button key={p.id} onClick={() => setPeriod(p.id)}
                    className={`rounded-md px-3 py-1 text-xs font-medium ${
                      period === p.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5"
                    }`}>{p.label}</button>
                ))}
              </div>
              <button onClick={d.refresh} disabled={d.loading} title="Atualizar"
                className="rounded-md border border-border bg-card p-2 text-muted-foreground hover:bg-white/5 disabled:opacity-50">
                <RefreshCw className={`size-4 ${d.loading ? "animate-spin" : ""}`} />
              </button>
              <button onClick={d.logout} title="Sair"
                className="rounded-md border border-border bg-card p-2 text-muted-foreground hover:bg-white/5">
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]">
          {/* Lista de clientes (esquerda) */}
          <aside className="border-r border-border lg:h-[calc(100vh-89px)] lg:overflow-y-auto">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input type="search" placeholder="Buscar cliente..." value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <p className="mt-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {filteredClients.length} cliente(s)
              </p>
            </div>
            <ul className="px-3 pb-6">
              {d.loading && !d.clients.length && (
                <li className="px-2 py-3 text-sm text-muted-foreground">Carregando...</li>
              )}
              {!d.loading && !d.clients.length && (
                <li className="px-2 py-3 text-sm text-muted-foreground">
                  {d.error || "Nenhum cliente carregado. Verifique o token."}
                </li>
              )}
              {filteredClients.map((c) => {
                const sel = c.account_id === selectedId;
                return (
                  <li key={c.account_id}>
                    <button onClick={() => setSelectedId(c.account_id)}
                      className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                        sel ? "bg-primary/15 ring-1 ring-primary/30" : "hover:bg-white/5"
                      }`}>
                      <div className={`truncate text-sm font-medium ${sel ? "text-primary" : ""}`}>{c.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className={c.account_status === 1 ? "text-success" : ""}>
                          {c.account_status === 1 ? "●" : "○"}
                        </span>
                        <span>{c.campaigns.length} campanha(s)</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">{fmtMoney(c.summary.total_spend, c.currency)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Detalhe (direita) */}
          <section className="p-6 lg:p-8">
            {!client ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {d.clients.length
                    ? "Selecione um cliente à esquerda."
                    : "Aguardando dados..."}
                </p>
              </div>
            ) : (
              <ClientDashboard client={client} period={period} />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function FullScreenMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

// =============== Dashboard completo de UM cliente ===============
function ClientDashboard({ client, period }: { client: Client; period: Period }) {
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // KPIs
  const k = useMemo(() => {
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

  const cpaRef = useMemo(() => cpaMedian(client.campaigns || []), [client]);
  const prev = client.summary_previous;
  function delta(curr: number | undefined, previous: number | undefined) {
    if (curr == null || !previous) return undefined;
    const v = ((curr - previous) / previous) * 100;
    return { value: `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`, positive: v > 0 };
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Cliente · Meta Ads</div>
          <h2 className="mt-0.5 text-3xl font-bold tracking-tight">{client.name}</h2>
          <div className="mt-1 text-xs text-muted-foreground">
            act_{client.account_id} · {client.currency} · {client.campaigns.length} campanha(s)
          </div>
        </div>
        <button
          onClick={() => generateReport({
            clients: [client], accountId: client.account_id, datePreset: period,
            manualSaldo: getManualSaldo(), onError: (m: string) => alert(m),
          })}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_4px_16px_-4px_rgba(139,92,246,0.5)] transition-all hover:brightness-110">
          <FileText className="size-4" /> Relatório PDF
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Investido" value={fmtMoney(k.spend, client.currency)} icon={DollarSign}
          delta={delta(k.spend, prev?.total_spend)} />
        <KpiCard label="Resultados" value={fmtNum(k.results)} icon={Target}
          delta={delta(k.results, prev?.total_results)} />
        <KpiCard label="Custo/Result." value={k.cpa ? fmtMoney(k.cpa, client.currency) : "—"} icon={Wallet}
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
        <KpiCard label="CTR" value={k.ctr.toFixed(2).replace(".", ",") + "%"} icon={BarChart3} />
        <KpiCard label="CPC" value={k.cpc ? fmtMoney(k.cpc, client.currency) : "—"} icon={Wallet} />
        <KpiCard label="Custo/Conv." value={k.cpcv ? fmtMoney(k.cpcv, client.currency) : "—"} icon={MessageCircle} />
      </div>

      {/* Destaques */}
      {client.campaigns.length > 0 && <Highlights client={client} />}

      {/* Status counters */}
      {client.campaigns.length > 0 && <StatusCounters client={client} />}

      {/* Donut + Funil */}
      {client.campaigns.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BudgetDonut client={client} />
          <DeliveryFunnel client={client} />
        </div>
      )}

      {/* Spend×Revenue + Conversões */}
      {client.campaigns.filter((c) => c.spend > 0).length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SpendVsRevenue client={client} />
          <ConvDistribution client={client} />
        </div>
      )}

      {/* Matriz + Comparativo */}
      {client.campaigns.filter((c) => c.spend > 0).length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PerformanceMatrix client={client} />
          <MetricsComparison client={client} />
        </div>
      )}

      {/* Tendência diária */}
      <CostChart clients={[client]} period={period} />

      {/* Tabela de campanhas */}
      <CampaignsTable client={client} cpaRef={cpaRef} onSelect={setSelectedCampaign} />

      {selectedCampaign && (
        <CampaignBreakdownModal
          campaign={selectedCampaign}
          currency={client.currency}
          period={period}
          onClose={() => setSelectedCampaign(null)}
        />
      )}
    </div>
  );
}

// ============== Componentes auxiliares ==============

// Card de gráfico estilo Lovable: header com title+caption, body com chart, bordas suaves, hover sutil.
function ChartCard({ title, caption, children }: {
  title: string; caption?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="group rounded-2xl border border-border/60 bg-card/80 p-5 shadow-[0_1px_2px_0_rgba(0,0,0,0.2)] transition-all hover:border-primary/30 hover:shadow-[0_8px_24px_-12px_rgba(139,92,246,0.25)]">
      <header className="mb-4">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
      </header>
      {children}
    </section>
  );
}

// Escolhe os 3 destaques mais relevantes pro cliente. Adapta quando não há
// receita (campanhas de lead/conversa): troca "Melhor ROAS" por "Melhor CTR".
function Highlights({ client }: { client: Client }) {
  const withSpend = client.campaigns.filter((c) => c.spend > 0);
  const withResults = client.campaigns.filter((c) => c.cost_per_result > 0);
  const temRoas = withSpend.some((c) => c.roas > 0);

  // Card 1: ROAS se houver receita; senão melhor CTR.
  const roasTop = temRoas
    ? [...withSpend].sort((a, b) => b.roas - a.roas)[0]
    : undefined;
  const ctrTop = !temRoas
    ? [...withSpend].filter((c) => c.impressions > 100).sort((a, b) => b.ctr - a.ctr)[0]
    : undefined;

  // Card 2: menor custo por resultado (já inclui conversas após fix do backend).
  const cheapest = [...withResults].sort((a, b) => a.cost_per_result - b.cost_per_result)[0];

  // Card 3: mais resultados.
  const mostResults = [...client.campaigns].filter((c) => c.results > 0).sort((a, b) => b.results - a.results)[0];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {temRoas ? (
        <HighlightCard icon={Trophy} cls="border-l-success text-success bg-success/5" title="Melhor ROAS"
          campaign={roasTop} valueFmt={(c) => `${c.roas.toFixed(2)}x`} />
      ) : (
        <HighlightCard icon={Trophy} cls="border-l-success text-success bg-success/5" title="Melhor CTR"
          campaign={ctrTop} valueFmt={(c) => `${c.ctr.toFixed(2).replace(".", ",")}%`} />
      )}
      <HighlightCard icon={Sparkles} cls="border-l-primary text-primary bg-primary/5" title="Menor Custo/Resultado"
        campaign={cheapest}
        valueFmt={(c) => `${fmtMoney(c.cost_per_result, client.currency)} · ${c.results_label}`} />
      <HighlightCard icon={Flame} cls="border-l-orange-400 text-orange-400 bg-orange-400/5" title="Mais Resultados"
        campaign={mostResults}
        valueFmt={(c) => `${fmtNum(c.results)} · ${c.results_label}`} />
    </div>
  );
}

function HighlightCard({ icon: Icon, cls, title, campaign, valueFmt }: {
  icon: typeof Trophy; cls: string; title: string;
  campaign?: Campaign; valueFmt: (c: Campaign) => string;
}) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-5 transition-all hover:scale-[1.01] hover:border-primary/30 ${cls}`}>
      {/* Acento gradiente no topo */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-60" />
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-current/15 p-1.5">
          <Icon className="size-4" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest">{title}</span>
      </div>
      {campaign ? (
        <>
          <div className="mt-3 truncate text-sm font-medium text-foreground" title={campaign.name}>{campaign.name}</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums tracking-tight">{valueFmt(campaign)}</div>
        </>
      ) : <div className="mt-4 text-sm text-muted-foreground">— sem dados —</div>}
    </div>
  );
}

function StatusCounters({ client }: { client: Client }) {
  const ativas = client.campaigns.filter((c) => c.status === "ACTIVE").length;
  const pausadas = client.campaigns.filter((c) => (c.status || "").includes("PAUSED")).length;
  const semEntrega = client.campaigns.filter((c) => c.status === "ACTIVE" && c.impressions === 0).length;
  const queimando = client.campaigns.filter((c) => c.status === "ACTIVE" && c.spend > 0 && c.roas < 1).length;
  const items = [
    { label: "ATIVAS", value: ativas, color: "text-success", bg: "bg-success/10", ring: "ring-success/20" },
    { label: "PAUSADAS", value: pausadas, color: "text-yellow-400", bg: "bg-yellow-400/10", ring: "ring-yellow-400/20" },
    { label: "SEM ENTREGA", value: semEntrega, color: "text-orange-400", bg: "bg-orange-400/10", ring: "ring-orange-400/20" },
    { label: "EM RISCO", value: queimando, color: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/20" },
    { label: "TOTAL", value: client.campaigns.length, color: "text-primary", bg: "bg-primary/10", ring: "ring-primary/20" },
  ];
  return (
    <ChartCard title="Status das Campanhas" caption="Distribuição rápida do que está rolando neste cliente.">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {items.map((it) => (
          <div key={it.label} className={`group relative overflow-hidden rounded-xl ${it.bg} p-4 text-center ring-1 ${it.ring} transition-transform hover:scale-[1.03]`}>
            <div className={`font-mono text-3xl font-bold tabular-nums ${it.color}`}>{it.value}</div>
            <div className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{it.label}</div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

function BudgetDonut({ client }: { client: Client }) {
  const camps = [...client.campaigns].filter((c) => c.spend > 0).sort((a, b) => b.spend - a.spend);
  const top = camps.slice(0, 7);
  const restSum = camps.slice(7).reduce((s, c) => s + c.spend, 0);
  const data = top.map((c) => ({ name: c.name.length > 30 ? c.name.slice(0, 28) + "…" : c.name, value: c.spend }));
  if (restSum > 0) data.push({ name: "Outros", value: restSum });
  const total = data.reduce((s, d) => s + d.value, 0);
  const topPct = total ? (data[0].value / total) * 100 : 0;
  const gradId = `donutGrad-${client.account_id}`;
  return (
    <ChartCard title="Distribuição do Orçamento"
      caption={<>Maior concentração: <strong className="text-foreground">{topPct.toFixed(1).replace(".", ",")}%</strong> em <strong className="text-foreground">{data[0]?.name}</strong></>}>
      <div className="relative h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {PALETTE.map((color, i) => (
                <linearGradient key={i} id={`${gradId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                </linearGradient>
              ))}
            </defs>
            <Pie data={data} dataKey="value" innerRadius={62} outerRadius={96}
              paddingAngle={3} strokeWidth={3} stroke="#16131e" cornerRadius={4}
              animationDuration={600}>
              {data.map((_, i) => <Cell key={i} fill={`url(#${gradId}-${i % PALETTE.length})`} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
              formatter={(v: number) => {
                const pct = total ? ((v / total) * 100).toFixed(1).replace(".", ",") : "0";
                return [`${fmtMoney(v, client.currency)} · ${pct}%`, "Investido"];
              }} />
          </PieChart>
        </ResponsiveContainer>
        {data[0] && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-2">
            <div className="font-mono text-2xl font-bold tabular-nums tracking-tight">{topPct.toFixed(0)}%</div>
            <div className="mt-0.5 max-w-[130px] truncate text-[10px] uppercase tracking-widest text-muted-foreground">{data[0].name}</div>
          </div>
        )}
      </div>
    </ChartCard>
  );
}

function DeliveryFunnel({ client }: { client: Client }) {
  const totals = client.campaigns.reduce((acc, c) => ({
    impressions: acc.impressions + (c.impressions || 0),
    reach: acc.reach + (c.reach || 0),
    link_clicks: acc.link_clicks + (c.link_clicks || 0),
    results: acc.results + (c.results || 0),
  }), { impressions: 0, reach: 0, link_clicks: 0, results: 0 });
  const data = [
    { label: "Impressões", value: totals.impressions, colorTop: "#8b5cf6", colorBot: "#6d28d9" },
    { label: "Alcance", value: totals.reach, colorTop: "#a78bfa", colorBot: "#7c3aed" },
    { label: "Cliques", value: totals.link_clicks, colorTop: "#5eead4", colorBot: "#14b8a6" },
    { label: "Conversões", value: totals.results, colorTop: "#86efac", colorBot: "#22c55e" },
  ];
  const base = totals.impressions || 1;
  return (
    <ChartCard title="Funil de Entrega" caption="Impressões → Alcance → Cliques → Conversões">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 5 }}>
            <defs>
              {data.map((d, i) => (
                <linearGradient key={i} id={`funnelG-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={d.colorTop} stopOpacity={1} />
                  <stop offset="100%" stopColor={d.colorBot} stopOpacity={0.85} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" {...axisProps} fontSize={11} />
            <YAxis {...axisProps} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
              cursor={{ fill: "rgba(139, 92, 246, 0.06)" }}
              formatter={(v: number) => [`${fmtNum(v)} · ${((v / base) * 100).toFixed(1).replace(".", ",")}% de impr.`, "Valor"]} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={700}>
              {data.map((_, i) => <Cell key={i} fill={`url(#funnelG-${i})`} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* mini cards com % */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {data.map((d, i) => (
          <div key={i} className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
            <div className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">{d.label}</div>
            <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums" style={{ color: d.colorTop }}>{fmtNum(d.value)}</div>
            <div className="text-[10px] text-muted-foreground/80">{((d.value / base) * 100).toFixed(1).replace(".", ",")}%</div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

function SpendVsRevenue({ client }: { client: Client }) {
  const data = [...client.campaigns]
    .filter((c) => c.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 8)
    .map((c) => ({ name: c.name.length > 18 ? c.name.slice(0, 16) + "…" : c.name, investido: c.spend, receita: c.revenue }));
  return (
    <ChartCard title="Investido × Receita" caption="Top 8 campanhas — compare quem gerou retorno.">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 55 }}>
            <defs>
              <linearGradient id="spendG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={1} />
                <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.8} />
              </linearGradient>
              <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#86efac" stopOpacity={1} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="name" {...axisProps} fontSize={9} angle={-30} textAnchor="end" height={60} interval={0} />
            <YAxis {...axisProps} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
              cursor={{ fill: "rgba(139, 92, 246, 0.06)" }}
              formatter={(v: number, n) => [fmtMoney(v, client.currency), n === "investido" ? "Investido" : "Receita"]} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
            <Bar dataKey="investido" name="Investido" fill="url(#spendG)" radius={[6, 6, 0, 0]} animationDuration={700} />
            <Bar dataKey="receita" name="Receita" fill="url(#revG)" radius={[6, 6, 0, 0]} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function ConvDistribution({ client }: { client: Client }) {
  const camps = [...client.campaigns].filter((c) => c.results > 0).sort((a, b) => b.results - a.results);
  if (!camps.length) {
    return (
      <ChartCard title="Conversões por Campanha" caption="Sem conversões registradas no período.">
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          🎯 Aguardando primeiras conversões.
        </div>
      </ChartCard>
    );
  }
  const top = camps.slice(0, 7);
  const data = top.map((c) => ({ name: c.name.length > 30 ? c.name.slice(0, 28) + "…" : c.name, value: c.results }));
  const restSum = camps.slice(7).reduce((s, c) => s + c.results, 0);
  if (restSum > 0) data.push({ name: "Outros", value: restSum });
  const total = data.reduce((s, d) => s + d.value, 0);
  const gradId = `convGrad-${client.account_id}`;
  return (
    <ChartCard title="Conversões por Campanha" caption={<>Total: <strong className="text-foreground">{fmtNum(total)}</strong> · {camps.length} campanha(s)</>}>
      <div className="relative h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {PALETTE.map((color, i) => (
                <linearGradient key={i} id={`${gradId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                </linearGradient>
              ))}
            </defs>
            <Pie data={data} dataKey="value" innerRadius={62} outerRadius={96}
              paddingAngle={3} strokeWidth={3} stroke="#16131e" cornerRadius={4}
              animationDuration={600}>
              {data.map((_, i) => <Cell key={i} fill={`url(#${gradId}-${i % PALETTE.length})`} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
              formatter={(v: number) => {
                const pct = total ? ((v / total) * 100).toFixed(1).replace(".", ",") : "0";
                return [`${fmtNum(v)} · ${pct}%`, "Conversões"];
              }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-2">
          <div className="font-mono text-2xl font-bold tabular-nums tracking-tight">{fmtNum(total)}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">total</div>
        </div>
      </div>
    </ChartCard>
  );
}

function PerformanceMatrix({ client }: { client: Client }) {
  const camps = client.campaigns.filter((c) => c.spend > 0);
  const good = camps.filter((c) => c.roas >= 1).map((c) => ({ name: c.name, x: c.spend, y: c.roas, z: Math.max(c.results || 0, 1) * 30 }));
  const bad = camps.filter((c) => c.roas < 1).map((c) => ({ name: c.name, x: c.spend, y: c.roas, z: Math.max(c.results || 0, 1) * 30 }));
  return (
    <ChartCard title="Matriz de Performance" caption="ROAS × Investido · bolha = nº de conversões.">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 5 }}>
            <defs>
              <radialGradient id="goodG" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#86efac" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.55} />
              </radialGradient>
              <radialGradient id="badG" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fda4af" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#e11d48" stopOpacity={0.55} />
              </radialGradient>
            </defs>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" />
            <XAxis type="number" dataKey="x" name="Investido" {...axisProps}
              tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
            <YAxis type="number" dataKey="y" name="ROAS" {...axisProps}
              tickFormatter={(v) => `${v.toFixed(1)}x`} />
            <ZAxis type="number" dataKey="z" range={[60, 500]} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
              cursor={{ strokeDasharray: "3 3", stroke: "rgba(139, 92, 246, 0.3)" }}
              formatter={(v: number, n) => n === "x" ? [fmtMoney(v, client.currency), "Investido"]
                : n === "y" ? [`${v.toFixed(2)}x`, "ROAS"] : [String(Math.round(v / 30)), "Conversões"]} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" />
            <Scatter name="ROAS ≥ 1 (saudável)" data={good} fill="url(#goodG)" stroke="#22c55e" strokeWidth={1.5} />
            <Scatter name="ROAS < 1 (em risco)" data={bad} fill="url(#badG)" stroke="#e11d48" strokeWidth={1.5} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function MetricsComparison({ client }: { client: Client }) {
  const data = [...client.campaigns].filter((c) => c.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 5)
    .map((c) => ({
      name: c.name.length > 16 ? c.name.slice(0, 14) + "…" : c.name,
      ctr: Number(c.ctr.toFixed(2)),
      cpc: Number((c.cpc || 0).toFixed(2)),
      freq: Number((c.frequency || 0).toFixed(2)),
    }));
  return (
    <ChartCard title="Engajamento Comparativo" caption="CTR · CPC · Frequência das top 5 campanhas.">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 45 }}>
            <defs>
              <linearGradient id="ctrG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7dd3fc" stopOpacity={1} />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.7} />
              </linearGradient>
              <linearGradient id="cpcG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fdba74" stopOpacity={1} />
                <stop offset="100%" stopColor="#ea580c" stopOpacity={0.7} />
              </linearGradient>
              <linearGradient id="freqG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c4b5fd" stopOpacity={1} />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.7} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="name" {...axisProps} fontSize={9} angle={-25} textAnchor="end" height={50} interval={0} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
              cursor={{ fill: "rgba(139, 92, 246, 0.06)" }} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
            <Bar dataKey="ctr" name="CTR (%)" fill="url(#ctrG)" radius={[4, 4, 0, 0]} animationDuration={700} />
            <Bar dataKey="cpc" name="CPC (R$)" fill="url(#cpcG)" radius={[4, 4, 0, 0]} animationDuration={700} />
            <Bar dataKey="freq" name="Frequência" fill="url(#freqG)" radius={[4, 4, 0, 0]} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function CampaignsTable({ client, cpaRef, onSelect }: {
  client: Client; cpaRef: number; onSelect: (c: Campaign) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-[0_1px_2px_0_rgba(0,0,0,0.2)]">
      <div className="border-b border-border/60 p-5">
        <h3 className="text-sm font-semibold tracking-tight">Campanhas do Cliente</h3>
        <p className="mt-1 text-xs text-muted-foreground">{client.campaigns.length} no período · clique pra ver conjuntos e anúncios.</p>
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
                <tr key={c.id} onClick={() => onSelect(c)}
                    className="cursor-pointer transition-colors hover:bg-primary/5">
                  <td className="px-4 py-3">
                    <div className="font-medium text-primary">{c.name}</div>
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
              <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">Nenhuma campanha no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

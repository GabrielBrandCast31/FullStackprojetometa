import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChevronLeft, DollarSign, MousePointerClick, TrendingUp, Wallet, Target, BarChart3, Eye, Users, MessageCircle, ShoppingCart, Repeat, Link as LinkIcon, LogOut, FileText, Award } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboard } from "@/hooks/useDashboard";
import { fmtMoney, fmtNum, type Campaign, type Client } from "@/lib/api/client";
// @ts-expect-error report.js gerador PDF
import { generateCampaignsReport } from "@/lib/report.js";

const tooltipStyle: React.CSSProperties = {
  background: "oklch(0.185 0.005 285)", border: "1px solid oklch(0.27 0.01 285)",
  borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Mono, monospace",
};

export const Route = createFileRoute("/campaigns/$id")({
  head: () => ({ meta: [{ title: "Campanha — Brandcast" }] }),
  component: CampaignDetailPage,
});

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR"); }
  catch { return iso; }
}

function CampaignDetailPage() {
  const nav = useNavigate();
  const { id } = useParams({ from: "/campaigns/$id" });
  const d = useDashboard("last_30d");

  const found = useMemo(() => {
    for (const cl of d.clients) {
      const cp = cl.campaigns.find((c) => c.id === id);
      if (cp) return { campaign: cp as Campaign, client: cl as Client };
    }
    return null;
  }, [d.clients, id]);

  useEffect(() => {
    if (!d.loading && d.clients.length && !found) {
      nav({ to: "/campaigns" });
    }
  }, [found, d.loading, d.clients.length, nav]);

  if (!d.authChecked || d.tokenConfigured === null || d.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{d.loading ? "Carregando..." : "Verificando sessão..."}</p>
      </div>
    );
  }
  if (!found) return null;
  const { campaign: c, client } = found;
  const currency = client.currency;

  const meta = [
    ["Cliente", client.name],
    ["Plataforma", "Meta Ads"],
    ["Objetivo", c.objective || "—"],
    ["Status", c.status === "ACTIVE" ? "Ativa" : (c.status || "").includes("PAUSED") ? "Pausada" : c.status],
    ["Orçamento", c.budget ? `${fmtMoney(c.budget, currency)} (${c.budget_type})` : "—"],
    ["Início", fmtDate(c.start_time)],
    ["Término", fmtDate(c.stop_time)],
    ["Atribuição", c.attribution_setting || "—"],
  ];

  return (
    <div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary/30">
      <Sidebar onLogout={d.logout} userName={d.user?.name || d.user?.email || ""} />

      <main className="p-6 lg:ml-64 lg:p-8">
        <header className="mb-6 flex items-start gap-4">
          <button onClick={() => nav({ to: "/campaigns" })}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground">
            <ChevronLeft className="size-4" /> Campanhas
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              <button onClick={() => nav({ to: "/clients/$id", params: { id: client.account_id } })}
                className="hover:underline">{client.name}</button>
              <span className="mx-1.5">/</span>Campanhas
            </div>
            <h1 className="mt-0.5 truncate text-3xl font-bold tracking-tight">{c.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                c.status === "ACTIVE" ? "bg-success/10 text-success" : "bg-white/5"
              }`}>
                <span className={`size-1.5 rounded-full ${c.status === "ACTIVE" ? "bg-success" : "bg-muted-foreground"}`} />
                {c.status === "ACTIVE" ? "Ativa" : "Pausada"}
              </span>
              {c.objective && <span>{c.objective}</span>}
            </div>
          </div>
          <button onClick={() => generateCampaignsReport({
            campaigns: [c], clients: [client], datePreset: "last_30d",
            filters: { statusFilter: "ALL", clientFilter: client.name, search: "" },
            onError: () => {},
          })} title="PDF desta campanha"
            className="rounded-md border border-border bg-card p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground">
            <FileText className="size-4" />
          </button>
          <button onClick={d.logout} title="Sair"
            className="rounded-md border border-border bg-card p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground">
            <LogOut className="size-4" />
          </button>
        </header>

        {/* Metadados */}
        <section className="mb-6 rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-6">
            <h3 className="font-semibold">Informações da Campanha</h3>
          </div>
          <div className="grid grid-cols-2 gap-6 p-6 md:grid-cols-4">
            {meta.map(([k, v]) => (
              <div key={String(k)}>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{k}</div>
                <div className="mt-1 text-sm font-medium">{v}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Destaques de performance da campanha */}
        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <PerfBadge
            icon={Award}
            title="ROAS"
            value={`${(c.roas || 0).toFixed(2)}x`}
            level={c.roas >= 2 ? "great" : c.roas >= 1 ? "ok" : "bad"}
            hint={c.roas >= 2 ? "Excelente — escale" : c.roas >= 1 ? "Retorno positivo" : "Investimento queimando"}
          />
          <PerfBadge
            icon={Target}
            title="Conversões"
            value={fmtNum(c.results)}
            level={c.results >= 50 ? "great" : c.results >= 5 ? "ok" : "bad"}
            hint={c.results > 0 ? `${c.results_label || "objetivo"}` : "Sem conversões"}
          />
          <PerfBadge
            icon={BarChart3}
            title="CTR"
            value={`${(c.ctr || 0).toFixed(2).replace(".", ",")}%`}
            level={c.ctr >= 1.5 ? "great" : c.ctr >= 0.8 ? "ok" : "bad"}
            hint={c.ctr >= 1.5 ? "Engajamento alto" : c.ctr >= 0.8 ? "Engajamento OK" : "Engajamento baixo"}
          />
        </section>

        {/* Funil: Impressões × Alcance × Cliques × Conversões */}
        <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-5">
            <h3 className="font-semibold">Impressões × Alcance × Conversões</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Funil de entrega da campanha · cada etapa em % das impressões.
            </p>
          </div>
          <div className="p-5">
            <CampaignFunnel c={c} />
          </div>
        </section>

        {/* KPIs — destacados (4) + restantes (8) */}
        <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="Resultados" value={fmtNum(c.results)} icon={Target} />
          <KpiCard label="Custo por Resultado"
            value={c.cost_per_result ? fmtMoney(c.cost_per_result, currency) : "—"} icon={Wallet} />
          <KpiCard label="Conversas Iniciadas" value={fmtNum(c.conversations)} icon={MessageCircle} />
          <KpiCard label="Custo por Conversa"
            value={c.cost_per_conversation ? fmtMoney(c.cost_per_conversation, currency) : "—"} icon={MessageCircle} />
        </section>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <KpiCard label="Investido" value={fmtMoney(c.spend, currency)} icon={DollarSign} />
          <KpiCard label="Receita" value={fmtMoney(c.revenue, currency)} icon={DollarSign} />
          <KpiCard label="ROAS" value={`${(c.roas || 0).toFixed(2)}x`} icon={TrendingUp} />
          <KpiCard label="Compras" value={fmtNum(c.purchases)} icon={ShoppingCart} />
          <KpiCard label="Impressões" value={fmtNum(c.impressions)} icon={Eye} />
          <KpiCard label="Alcance" value={fmtNum(c.reach)} icon={Users} />
          <KpiCard label="Frequência" value={`${(c.frequency || 0).toFixed(2)}x`} icon={Repeat} />
          <KpiCard label="Cliques" value={fmtNum(c.clicks)} icon={MousePointerClick} />
          <KpiCard label="Cliques no Link" value={fmtNum(c.link_clicks)} icon={LinkIcon} />
          <KpiCard label="CTR" value={`${(c.ctr || 0).toFixed(2).replace(".", ",")}%`} icon={BarChart3} />
          <KpiCard label="CPC" value={c.cpc ? fmtMoney(c.cpc, currency) : "—"} icon={Wallet} />
          <KpiCard label="CPM" value={c.cpm ? fmtMoney(c.cpm, currency) : "—"} icon={Eye} />
        </section>
      </main>
    </div>
  );
}

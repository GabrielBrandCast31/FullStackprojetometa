import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { CostChart } from "@/components/dashboard/CostChart";
import { RefreshCw, LogOut, AlertCircle } from "lucide-react";
import { useDashboard, type Period } from "@/hooks/useDashboard";
import { fmtMoney, fmtNum } from "@/lib/api/client";

const PERIODS: { id: Period; label: string }[] = [
  { id: "last_7d", label: "7 dias" }, { id: "last_30d", label: "30 dias" }, { id: "last_90d", label: "90 dias" },
];

const PALETTE = ["#6C02ED", "#a78bfa", "#3D0DD0", "#4ade80", "#f87171", "#facc15", "#56d4dd", "#fb923c"];

export const Route = createFileRoute("/charts")({
  head: () => ({ meta: [{ title: "Gráficos — Brandcast" }] }),
  component: ChartsPage,
});

function ChartsPage() {
  const [period, setPeriod] = useState<Period>("last_30d");
  const d = useDashboard(period);
  const [metric, setMetric] = useState<"spend" | "revenue" | "results" | "roas" | "clicks">("spend");

  const campaigns = useMemo(
    () => d.clients.flatMap((c) => c.campaigns.map((cp) => ({ ...cp, currency: c.currency, _clientName: c.name }))),
    [d.clients],
  );

  // ===== Status Counters =====
  const status = useMemo(() => {
    const ativas = campaigns.filter((c) => c.status === "ACTIVE").length;
    const pausadas = campaigns.filter((c) => (c.status || "").includes("PAUSED")).length;
    const semEntrega = campaigns.filter((c) => c.status === "ACTIVE" && c.impressions === 0).length;
    return { ativas, pausadas, semEntrega, total: campaigns.length };
  }, [campaigns]);

  // ===== Risco (% ativas com ROAS < 1) =====
  const risco = useMemo(() => {
    const ativas = campaigns.filter((c) => c.status === "ACTIVE" && c.spend > 0);
    if (!ativas.length) return { pct: 0, count: 0, total: 0 };
    const queimando = ativas.filter((c) => c.roas < 1).length;
    return { pct: (queimando / ativas.length) * 100, count: queimando, total: ativas.length };
  }, [campaigns]);

  // ===== Top clientes por investimento (donut + barras) =====
  const byClient = useMemo(() => d.clients
    .map((cl) => ({
      name: cl.name,
      spend: cl.summary.total_spend,
      revenue: cl.summary.total_revenue,
      roas: cl.summary.roas,
    }))
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend),
    [d.clients]);

  // Donut top 8 + "Outros"
  const donutData = useMemo(() => {
    const top = byClient.slice(0, 8);
    const restSum = byClient.slice(8).reduce((s, c) => s + c.spend, 0);
    const data = top.map((c) => ({ name: c.name, value: c.spend }));
    if (restSum > 0) data.push({ name: "Outros", value: restSum });
    return data;
  }, [byClient]);
  const totalSpend = useMemo(() => byClient.reduce((s, c) => s + c.spend, 0), [byClient]);
  const topClient = byClient[0];
  const topPct = topClient && totalSpend ? (topClient.spend / totalSpend) * 100 : 0;

  // ===== Top campanhas por métrica =====
  const topCamps = useMemo(() =>
    [...campaigns].filter((c) => c.spend > 0).sort((a, b) => (b[metric] || 0) - (a[metric] || 0)).slice(0, 10),
    [campaigns, metric]);

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
            <h1 className="text-3xl font-bold tracking-tight">Gráficos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Visualizações dos dados carregados
              {d.fromCache && <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">cache 30min</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {PERIODS.map((p) => (
                <button key={p.id} onClick={() => setPeriod(p.id)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                    period === p.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5"
                  }`}>{p.label}</button>
              ))}
            </div>
            <button onClick={d.refresh} disabled={d.loading}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-50">
              <RefreshCw className={`size-4 ${d.loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
            <button onClick={d.logout}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground">
              <LogOut className="size-4" /> Sair
            </button>
          </div>
        </header>

        {d.error && (
          <div className="mb-6 flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" /> {d.error}
          </div>
        )}

        {/* Linha 1: Status / Risco / Donut */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Widget title="Status das Campanhas" hint={`${status.total} campanhas no período`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Counter value={status.ativas} label="ATIVAS" cls="text-success" bg="bg-success/10" />
              <Counter value={status.pausadas} label="PAUSADAS" cls="text-yellow-400" bg="bg-yellow-400/10" />
              <Counter value={status.semEntrega} label="SEM ENTREGA" cls="text-orange-400" bg="bg-orange-400/10" />
              <Counter value={status.total} label="TOTAL" cls="text-primary" bg="bg-primary/10" />
            </div>
          </Widget>

          <Widget title="Campanhas em Risco" hint={`${risco.total} ativas com gasto · ROAS < 1 = queimando`}>
            <Gauge pct={risco.pct} />
            <div className="mt-3 text-center text-xs">
              <span className={`rounded-full px-3 py-1 font-bold uppercase ${
                risco.pct >= 30 ? "bg-destructive/15 text-destructive"
                : risco.pct >= 15 ? "bg-yellow-400/15 text-yellow-400"
                : "bg-success/15 text-success"
              }`}>{risco.count} em risco</span>
            </div>
          </Widget>

          <Widget title="Participação no Investimento" hint={`${byClient.length} cliente(s) com gasto`}>
            <div className="relative h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2} strokeWidth={2}
                    stroke="oklch(0.18 0.04 295)">
                    {donutData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: number) => [fmtMoney(v), "Investido"]} />
                </PieChart>
              </ResponsiveContainer>
              {topClient && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="font-mono text-2xl font-bold tabular-nums">{topPct.toFixed(0)}%</div>
                  <div className="max-w-[110px] truncate px-2 text-[10px] uppercase tracking-wider text-muted-foreground">{topClient.name}</div>
                </div>
              )}
            </div>
          </Widget>
        </div>

        {/* Linha 2: Performance por cliente (wide) */}
        <Widget title="Performance por Cliente" hint="Investido + Receita (barras) e ROAS (linha)" className="mb-6">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={byClient.slice(0, 10)} margin={{ top: 10, right: 16, left: 0, bottom: 30 }}>
                <CartesianGrid stroke="oklch(0.27 0.01 285)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="name" stroke="oklch(0.62 0.01 285)" fontSize={10} tickLine={false} axisLine={false}
                  angle={-30} textAnchor="end" height={60} />
                <YAxis yAxisId="left" stroke="oklch(0.62 0.01 285)" fontSize={10} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" stroke="oklch(0.78 0.16 70)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v: number, name) => name === "roas" ? [`${v.toFixed(2)}x`, "ROAS"] : [fmtMoney(v), name === "spend" ? "Investido" : "Receita"]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="spend" name="Investido" fill="#6C02ED" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="revenue" name="Receita" fill="#4ade80" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke="#fb923c" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Widget>

        {/* Linha 3: Top campanhas por métrica */}
        <Widget title={`Top Campanhas — ${{spend: "Investido", revenue: "Receita", results: "Resultados", roas: "ROAS", clicks: "Cliques"}[metric]}`}
          hint="Selecione a métrica abaixo" className="mb-6"
          actions={
            <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              <option value="spend">Investido</option>
              <option value="revenue">Receita</option>
              <option value="results">Resultados</option>
              <option value="roas">ROAS</option>
              <option value="clicks">Cliques</option>
            </select>
          }>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCamps.map((c) => ({ name: c.name.length > 30 ? c.name.slice(0, 28) + "…" : c.name, value: c[metric] || 0, roas: c.roas }))}
                margin={{ top: 10, right: 16, left: 0, bottom: 60 }}>
                <CartesianGrid stroke="oklch(0.27 0.01 285)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="name" stroke="oklch(0.62 0.01 285)" fontSize={9} tickLine={false} axisLine={false}
                  angle={-40} textAnchor="end" height={80} interval={0} />
                <YAxis stroke="oklch(0.62 0.01 285)" fontSize={10} tickLine={false} axisLine={false}
                  tickFormatter={(v) => {
                    if (metric === "spend" || metric === "revenue") return `R$${(v / 1000).toFixed(0)}k`;
                    if (metric === "roas") return `${v.toFixed(1)}x`;
                    return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);
                  }} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v: number) => {
                    if (metric === "spend" || metric === "revenue") return [fmtMoney(v), "Valor"];
                    if (metric === "roas") return [`${v.toFixed(2)}x`, "ROAS"];
                    return [fmtNum(v), "Valor"];
                  }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {topCamps.map((c, i) => (
                    <Cell key={i} fill={
                      metric === "roas"
                        ? (c.roas >= 2 ? "#4ade80" : c.roas >= 1 ? "#facc15" : "#f87171")
                        : "#6C02ED"
                    } />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Widget>

        {/* Linha 4: Tendência diária (reusa CostChart) */}
        {d.clients.length > 0 && <CostChart clients={d.clients} period={period} />}
      </main>
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: "oklch(0.185 0.005 285)",
  border: "1px solid oklch(0.27 0.01 285)",
  borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Mono, monospace",
};

function Widget({ title, hint, children, actions, className }: {
  title: string; hint?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-border bg-card ${className || ""}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Counter({ value, label, cls, bg }: { value: number; label: string; cls: string; bg: string }) {
  return (
    <div className="text-center">
      <div className={`font-mono text-3xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className={`mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${bg} ${cls}`}>{label}</div>
    </div>
  );
}

function Gauge({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const radius = 80, cx = 100, cy = 100;
  const arcLen = Math.PI * radius;
  const offset = arcLen - (arcLen * clamped / 100);
  const color = clamped >= 30 ? "#f87171" : clamped >= 15 ? "#facc15" : "#4ade80";
  return (
    <div className="relative mx-auto h-[130px] w-full max-w-[220px]">
      <svg viewBox="0 0 200 130" className="block h-full w-full">
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none" strokeWidth="18" stroke="oklch(0.27 0.01 285)" />
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none" strokeWidth="18" strokeLinecap="round" stroke={color}
          strokeDasharray={arcLen} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.4s" }} />
      </svg>
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-3xl font-bold tabular-nums"
        style={{ color }}>{clamped.toFixed(0)}%</div>
    </div>
  );
}

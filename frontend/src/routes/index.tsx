import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { CostChart } from "@/components/dashboard/CostChart";
import { ChannelsChart } from "@/components/dashboard/ChannelsChart";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { DollarSign, MousePointerClick, TrendingUp, Wallet, Target, BarChart3, LogOut, RefreshCw, FileText } from "lucide-react";
import {
  authMe, getAuthToken, clearAuthToken,
  getMetaTokenStatus, saveMetaToken, fetchOverview, fmtMoney, fmtNum,
  type Client,
} from "@/lib/api/client";
import { getManualSaldo } from "@/lib/api/client";
// @ts-expect-error report.js — gerador de relatorio PDF Brandcast
import { generateReport } from "@/lib/report.js";

const PERIODS = [
  { id: "last_7d", label: "7 dias" },
  { id: "last_30d", label: "30 dias" },
  { id: "last_90d", label: "90 dias" },
] as const;
type Period = typeof PERIODS[number]["id"];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Brandcast — Performance de Campanhas" },
      { name: "description", content: "Painel de performance Meta Ads." },
    ],
  }),
  component: Index,
});

function Index() {
  const nav = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);
  const [period, setPeriod] = useState<Period>("last_30d");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [savingToken, setSavingToken] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!getAuthToken()) { nav({ to: "/login" }); return; }
    authMe()
      .then((u) => { setUser(u); setAuthChecked(true); })
      .catch(() => nav({ to: "/login" }));
  }, [nav]);

  // Verifica se ja tem Meta token cadastrado no backend
  useEffect(() => {
    if (!authChecked) return;
    getMetaTokenStatus()
      .then((s) => setTokenConfigured(s.configured))
      .catch(() => setTokenConfigured(false));
  }, [authChecked]);

  function loadData(force = false) {
    if (!authChecked || !tokenConfigured) return;
    setLoading(true); setError("");
    fetchOverview(period, true, force)
      .then((r) => { setClients(r.clients); setFromCache(!!r.from_cache); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (authChecked && tokenConfigured) loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, tokenConfigured, period]);

  const campaigns = useMemo(
    () => clients.flatMap((c) => c.campaigns.map((cp) => ({ ...cp, currency: c.currency }))),
    [clients],
  );

  const k = useMemo(() => {
    const spend = campaigns.reduce((s, c) => s + c.spend, 0);
    const clicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const impressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const revenue = campaigns.reduce((s, c) => s + c.revenue, 0);
    const results = campaigns.reduce((s, c) => s + (c.results || 0), 0);
    return {
      spend, clicks, impressions, revenue, results,
      ctr: impressions ? (clicks / impressions) * 100 : 0,
      cpc: clicks ? spend / clicks : 0,
      roas: spend ? revenue / spend : 0,
    };
  }, [campaigns]);

  const prev = useMemo(() => {
    const acc = { spend: 0, clicks: 0, impressions: 0, revenue: 0, results: 0, hasData: false };
    for (const cl of clients) {
      const p = cl.summary_previous; if (!p) continue;
      acc.hasData = true;
      acc.spend += p.total_spend || 0;
      acc.clicks += p.total_clicks || 0;
      acc.impressions += p.total_impressions || 0;
      acc.revenue += p.total_revenue || 0;
      acc.results += p.total_results || 0;
    }
    return acc;
  }, [clients]);

  function delta(curr: number, previous: number): { value: string; positive: boolean } | undefined {
    if (!prev.hasData || !previous) return undefined;
    const d = ((curr - previous) / previous) * 100;
    return { value: `${d > 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")}%`, positive: d > 0 };
  }
  const prevCtr = prev.impressions ? (prev.clicks / prev.impressions) * 100 : 0;
  const prevCpc = prev.clicks ? prev.spend / prev.clicks : 0;
  const prevRoas = prev.spend ? prev.revenue / prev.spend : 0;

  function logout() { clearAuthToken(); nav({ to: "/login" }); }

  async function onConnectMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const t = String(form.get("token") || "").trim();
    if (!t) return;
    setSavingToken(true); setError("");
    try {
      await saveMetaToken(t);
      setTokenConfigured(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar token");
    } finally {
      setSavingToken(false);
    }
  }

  if (!authChecked || tokenConfigured === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Verificando sessão...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary/30">
      <Sidebar onLogout={logout} userName={user?.name || user?.email || ""} />

      <main className="p-6 lg:ml-64 lg:p-8">
        <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Central de Performance</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading
                ? "Carregando dados do Meta..."
                : clients.length
                  ? <>Acompanhando {campaigns.length} campanhas em {clients.length} cliente(s) {fromCache && <span className="ml-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">cache 30min</span>}</>
                  : "Conecte seu token do Meta pra começar"}
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
            {tokenConfigured && clients.length > 0 && (
              <button onClick={() => generateReport({
                clients, accountId: null, datePreset: period, manualSaldo: getManualSaldo(),
                onError: (msg: string) => setError(msg),
              })}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground">
                <FileText className="size-4" /> PDF
              </button>
            )}
            {tokenConfigured && (
              <button onClick={() => loadData(true)} disabled={loading} title="Ignorar cache e buscar no Meta"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-50">
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
              </button>
            )}
            <button onClick={logout}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
              <LogOut className="size-4" /> Sair
            </button>
          </div>
        </header>

        {!tokenConfigured && (
          <form onSubmit={onConnectMeta} className="mb-8 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold">Conecte sua conta do Meta</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cole o access token (System User Token) do Meta. Ele será salvo de forma segura no backend, vinculado ao seu usuário.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                name="token" type="password" required placeholder="EAA..." autoFocus
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button type="submit" disabled={savingToken}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {savingToken ? "Salvando..." : "Conectar"}
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        )}

        {tokenConfigured && (
          <>
            <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Investimento Total" value={fmtMoney(k.spend)} icon={DollarSign}
                delta={delta(k.spend, prev.spend)} />
              <KpiCard label="Cliques" value={fmtNum(k.clicks)} icon={MousePointerClick}
                delta={delta(k.clicks, prev.clicks)} />
              <KpiCard label="CTR Médio" value={k.ctr.toFixed(2).replace(".", ",") + "%"} icon={BarChart3}
                delta={delta(k.ctr, prevCtr)} />
              <KpiCard label="CPC Médio" value={k.cpc ? fmtMoney(k.cpc) : "—"} icon={Wallet}
                delta={delta(k.cpc, prevCpc)} />
              <KpiCard label="Conversões" value={fmtNum(k.results)} icon={Target}
                delta={delta(k.results, prev.results)} />
              <KpiCard label="ROAS" value={k.roas.toFixed(2) + "x"} icon={TrendingUp}
                delta={delta(k.roas, prevRoas)} />
            </div>

            <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2"><CostChart clients={clients} period={period} /></div>
              <ChannelsChart clients={clients} />
            </div>

            <CampaignTable campaigns={campaigns} />
          </>
        )}
      </main>
    </div>
  );
}

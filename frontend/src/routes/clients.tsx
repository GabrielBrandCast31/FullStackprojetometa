import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Search, RefreshCw, LogOut, AlertCircle } from "lucide-react";
import {
  authMe, getAuthToken, clearAuthToken,
  getMetaTokenStatus, fetchOverview, fmtMoney, fmtNum,
  type Client,
} from "@/lib/api/client";

const PERIODS = [
  { id: "last_7d", label: "7 dias" },
  { id: "last_30d", label: "30 dias" },
  { id: "last_90d", label: "90 dias" },
] as const;
type Period = typeof PERIODS[number]["id"];

const STATUS_LABELS: Record<number, string> = {
  1: "Ativa", 2: "Desativada", 3: "Não quitada",
  7: "Em análise", 8: "Pendente", 9: "Carência",
  100: "Pendente", 101: "Fechada",
};

export const Route = createFileRoute("/clients")({
  head: () => ({ meta: [{ title: "Clientes — Brandcast" }] }),
  component: ClientsPage,
});

function ClientsPage() {
  const nav = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);
  const [period, setPeriod] = useState<Period>("last_30d");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"spend" | "roas" | "results" | "name">("spend");

  useEffect(() => {
    if (!getAuthToken()) { nav({ to: "/login" }); return; }
    authMe().then((u) => { setUser(u); setAuthChecked(true); })
      .catch(() => nav({ to: "/login" }));
  }, [nav]);

  useEffect(() => {
    if (!authChecked) return;
    getMetaTokenStatus().then((s) => setTokenConfigured(s.configured))
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

  // Filtrado + ordenado
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? clients.filter((c) => c.name.toLowerCase().includes(q) || c.account_id.includes(q))
      : clients;
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "spend") return b.summary.total_spend - a.summary.total_spend;
      if (sortBy === "roas") return b.summary.roas - a.summary.roas;
      if (sortBy === "results") return b.summary.total_results - a.summary.total_results;
      return 0;
    });
    return sorted;
  }, [clients, search, sortBy]);

  // Totais (linha agregada)
  const totals = useMemo(() => {
    const t = clients.reduce(
      (acc, c) => {
        acc.spend += c.summary.total_spend;
        acc.revenue += c.summary.total_revenue;
        acc.results += c.summary.total_results;
        acc.campaigns += c.summary.total_campaigns;
        acc.active_campaigns += c.summary.active_campaigns;
        return acc;
      },
      { spend: 0, revenue: 0, results: 0, campaigns: 0, active_campaigns: 0 },
    );
    return { ...t, roas: t.spend ? t.revenue / t.spend : 0 };
  }, [clients]);

  function logout() { clearAuthToken(); nav({ to: "/login" }); }

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
            <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading
                ? "Carregando..."
                : <>
                    {clients.length} conta(s) de anúncios · {totals.active_campaigns}/{totals.campaigns} campanhas ativas
                    {fromCache && <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">cache 30min</span>}
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
            {tokenConfigured && (
              <button onClick={() => loadData(true)} disabled={loading} title="Ignorar cache"
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
          <div className="mb-6 rounded-lg border border-border bg-card p-6 text-sm">
            <p className="font-semibold">Token do Meta não configurado.</p>
            <p className="mt-1 text-muted-foreground">
              <Link to="/" className="text-primary hover:underline">Volte pra Visão Geral</Link> pra conectar sua conta.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {tokenConfigured && clients.length > 0 && (
          <>
            {/* Filtros */}
            <div className="mb-4 flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search" placeholder="Buscar cliente por nome ou ID..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary">
                <option value="spend">Maior gasto</option>
                <option value="roas">Maior ROAS</option>
                <option value="results">Mais conversões</option>
                <option value="name">Nome (A-Z)</option>
              </select>
            </div>

            {/* Tabela */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-6 py-4 font-medium">Cliente</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 text-right font-medium">Campanhas</th>
                      <th className="px-6 py-4 text-right font-medium">Investido</th>
                      <th className="px-6 py-4 text-right font-medium">Receita</th>
                      <th className="px-6 py-4 text-right font-medium">ROAS</th>
                      <th className="px-6 py-4 text-right font-medium">Conversões</th>
                      <th className="px-6 py-4 text-right font-medium">Saldo (Meta)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((c) => {
                      const isActive = c.account_status === 1;
                      const statusLabel = STATUS_LABELS[c.account_status] || "Desconhecido";
                      const saldo = c.spend_cap - c.amount_spent;
                      return (
                        <tr key={c.account_id}
                            className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                            onClick={() => nav({ to: "/", search: { client: c.account_id } as never })}>
                          <td className="px-6 py-4">
                            <div className="font-medium">{c.name}</div>
                            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">act_{c.account_id}</div>
                            {c.error && (
                              <div className="mt-1 text-[11px] text-destructive">⚠ {c.error}</div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isActive ? "bg-success/10 text-success" : "bg-white/5 text-muted-foreground"
                            }`}>
                              <span className={`size-1.5 rounded-full ${isActive ? "bg-success" : "bg-muted-foreground"}`} />
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono tabular-nums">
                            {fmtNum(c.summary.total_campaigns)}
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              ({fmtNum(c.summary.active_campaigns)} ativas)
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono tabular-nums">
                            {fmtMoney(c.summary.total_spend, c.currency)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono tabular-nums">
                            {fmtMoney(c.summary.total_revenue, c.currency)}
                          </td>
                          <td className={`px-6 py-4 text-right font-mono tabular-nums ${
                            c.summary.roas >= 2 ? "text-success" : c.summary.roas >= 1 ? "" : "text-destructive"
                          }`}>
                            {c.summary.roas.toFixed(2)}x
                          </td>
                          <td className="px-6 py-4 text-right font-mono tabular-nums">
                            {fmtNum(c.summary.total_results)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono tabular-nums">
                            {c.spend_cap > 0
                              ? <span className={saldo < c.spend_cap * 0.15 ? "text-destructive" : ""}>
                                  {fmtMoney(saldo, c.currency)}
                                </span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {!rows.length && (
                      <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                        {search ? "Nenhum cliente encontrado." : "Sem clientes carregados."}
                      </td></tr>
                    )}
                  </tbody>
                  {/* Linha de totais */}
                  {rows.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-border bg-white/[0.02] text-xs uppercase tracking-wider text-muted-foreground">
                        <td className="px-6 py-4 font-medium" colSpan={2}>Total</td>
                        <td className="px-6 py-4 text-right font-mono tabular-nums font-medium">
                          {fmtNum(totals.campaigns)}
                          <span className="ml-1 text-[10px]">({fmtNum(totals.active_campaigns)})</span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono tabular-nums font-medium text-foreground">
                          {fmtMoney(totals.spend)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono tabular-nums font-medium text-foreground">
                          {fmtMoney(totals.revenue)}
                        </td>
                        <td className={`px-6 py-4 text-right font-mono tabular-nums font-medium ${
                          totals.roas >= 2 ? "text-success" : totals.roas >= 1 ? "text-foreground" : "text-destructive"
                        }`}>
                          {totals.roas.toFixed(2)}x
                        </td>
                        <td className="px-6 py-4 text-right font-mono tabular-nums font-medium text-foreground">
                          {fmtNum(totals.results)}
                        </td>
                        <td className="px-6 py-4" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

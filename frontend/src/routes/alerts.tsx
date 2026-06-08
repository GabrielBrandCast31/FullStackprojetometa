import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { SaldoModal } from "@/components/dashboard/SaldoModal";
import { RefreshCw, LogOut, AlertCircle, AlertTriangle, ShieldAlert, HelpCircle, CheckCircle2 } from "lucide-react";
import { useDashboard, type Period } from "@/hooks/useDashboard";
import { fmtMoney } from "@/lib/api/client";
import { computeSaldo, type SaldoResult } from "@/lib/saldo";

const PERIODS: { id: Period; label: string }[] = [
  { id: "last_7d", label: "7 dias" },
  { id: "last_30d", label: "30 dias" },
  { id: "last_90d", label: "90 dias" },
];

const FILTERS = [
  { id: "alertas", label: "Só alertas" },
  { id: "todos", label: "Todos" },
  { id: "semdado", label: "Sem saldo cadastrado" },
] as const;

export const Route = createFileRoute("/alerts")({
  head: () => ({ meta: [{ title: "Alertas de Saldo — Brandcast" }] }),
  component: AlertsPage,
});

function diasLabel(saldo: SaldoResult): string {
  if (!saldo.known) return "—";
  if (saldo.daysLeft == null) return "—";
  if (saldo.daysLeft < 1) return "menos de 1 dia";
  return `~${Math.floor(saldo.daysLeft)} dia(s)`;
}

function AlertsPage() {
  const [period, setPeriod] = useState<Period>("last_30d");
  const d = useDashboard(period);
  const [filter, setFilter] = useState<typeof FILTERS[number]["id"]>("alertas");
  const [editing, setEditing] = useState<{ accountId: string; name: string } | null>(null);

  const groups = useMemo(() => {
    const rows = d.clients.map((cl) => ({ cl, saldo: computeSaldo(cl, d.manualSaldo, period) }));
    const byDays = (a: typeof rows[0], b: typeof rows[0]) => {
      const al = a.saldo.known ? (a.saldo.daysLeft ?? 1e9) : 1e9;
      const bl = b.saldo.known ? (b.saldo.daysLeft ?? 1e9) : 1e9;
      return al - bl;
    };
    return {
      criticos: rows.filter((r) => r.saldo.known && r.saldo.level === "critical").sort(byDays),
      atencao: rows.filter((r) => r.saldo.known && r.saldo.level === "warn").sort(byDays),
      saudavel: rows.filter((r) => r.saldo.known && r.saldo.level === "ok").sort(byDays),
      semDado: rows.filter((r) => !r.saldo.known && r.saldo.spend > 0)
        .sort((a, b) => b.saldo.spend - a.saldo.spend),
    };
  }, [d.clients, d.manualSaldo, period]);

  const counts = {
    criticos: groups.criticos.length,
    atencao: groups.atencao.length,
    saudavel: groups.saudavel.length,
    semDado: groups.semDado.length,
  };

  const show = {
    criticos: filter === "todos" || filter === "alertas",
    atencao: filter === "todos" || filter === "alertas",
    saudavel: filter === "todos",
    semDado: filter === "todos" || filter === "semdado",
  };
  const empty =
    (!show.criticos || !counts.criticos) &&
    (!show.atencao || !counts.atencao) &&
    (!show.saudavel || !counts.saudavel) &&
    (!show.semDado || !counts.semDado);

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
            <h1 className="text-3xl font-bold tracking-tight">Alertas de Saldo</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Saldo estimado por cliente. Avise antes de zerar.
              {d.fromCache && <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">cache 30min</span>}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {PERIODS.map((p) => (
                <button key={p.id} onClick={() => setPeriod(p.id)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
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

        {/* Resumo + filtro */}
        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard label="Críticos" value={counts.criticos} cls="border-l-destructive text-destructive" />
          <SummaryCard label="Em atenção" value={counts.atencao} cls="border-l-yellow-400 text-yellow-400" />
          <SummaryCard label="Saudáveis" value={counts.saudavel} cls="border-l-success text-success" />
          <SummaryCard label="Sem saldo" value={counts.semDado} cls="border-l-muted-foreground text-muted-foreground" />
        </section>

        <div className="mb-4 inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5"
              }`}>{f.label}</button>
          ))}
        </div>

        {empty && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="mx-auto mb-2 size-8 text-success" />
            {filter === "semdado"
              ? "Todos os clientes com gasto têm saldo cadastrado."
              : "Nenhum cliente em alerta no momento."}
          </div>
        )}

        {show.criticos && counts.criticos > 0 && (
          <Section title="Críticos — acabando agora" icon={ShieldAlert} cls="text-destructive">
            <p className="mb-3 text-xs text-muted-foreground">Saldo zerado ou esgotando em até 3 dias. Recarregue com urgência.</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {groups.criticos.map(({ cl, saldo }) => (
                <SaldoCard key={cl.account_id} clientName={cl.name} accountId={cl.account_id}
                  currency={cl.currency} saldo={saldo} level="critical"
                  onEdit={() => setEditing({ accountId: cl.account_id, name: cl.name })} />
              ))}
            </div>
          </Section>
        )}

        {show.atencao && counts.atencao > 0 && (
          <Section title="Em atenção" icon={AlertTriangle} cls="text-yellow-400">
            <p className="mb-3 text-xs text-muted-foreground">Mais de 80% consumido ou esgotando em até 7 dias.</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {groups.atencao.map(({ cl, saldo }) => (
                <SaldoCard key={cl.account_id} clientName={cl.name} accountId={cl.account_id}
                  currency={cl.currency} saldo={saldo} level="warn"
                  onEdit={() => setEditing({ accountId: cl.account_id, name: cl.name })} />
              ))}
            </div>
          </Section>
        )}

        {show.semDado && counts.semDado > 0 && (
          <Section title="Sem saldo cadastrado" icon={HelpCircle} cls="text-muted-foreground">
            <p className="mb-3 text-xs text-muted-foreground">Têm gasto mas nenhum saldo informado. Cadastre pra acompanhar.</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {groups.semDado.map(({ cl, saldo }) => (
                <div key={cl.account_id} className="rounded-xl border border-border border-l-2 border-l-muted-foreground bg-card p-4">
                  <div className="font-medium">{cl.name}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Gasto no período: <span className="font-mono text-foreground">{fmtMoney(saldo.spend, cl.currency)}</span>
                  </p>
                  <button onClick={() => setEditing({ accountId: cl.account_id, name: cl.name })}
                    className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                    Cadastrar saldo
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}

        {show.saudavel && counts.saudavel > 0 && (
          <Section title="Saudáveis" icon={CheckCircle2} cls="text-success">
            <p className="mb-3 text-xs text-muted-foreground">Saldo confortável pro ritmo atual.</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {groups.saudavel.map(({ cl, saldo }) => (
                <SaldoCard key={cl.account_id} clientName={cl.name} accountId={cl.account_id}
                  currency={cl.currency} saldo={saldo} level="ok"
                  onEdit={() => setEditing({ accountId: cl.account_id, name: cl.name })} />
              ))}
            </div>
          </Section>
        )}

        {editing && (
          <SaldoModal
            clientName={editing.name}
            current={d.manualSaldo[editing.accountId]}
            onClose={() => setEditing(null)}
            onSave={(valor, data) => { d.updateSaldo(editing.accountId, valor, data); setEditing(null); }}
            onRemove={() => { d.removeSaldo(editing.accountId); setEditing(null); }}
          />
        )}
      </main>
    </div>
  );
}

function SummaryCard({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-xl border border-border border-l-2 bg-card p-4 ${cls}`}>
      <div className="font-mono text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({ title, icon: Icon, cls, children }: {
  title: string;
  icon: typeof AlertTriangle;
  cls: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className={`mb-2 flex items-center gap-2 text-sm font-semibold ${cls}`}>
        <Icon className="size-4" /> {title}
      </h2>
      {children}
    </section>
  );
}

function SaldoCard({ clientName, accountId: _aid, currency, saldo, level, onEdit }: {
  clientName: string;
  accountId: string;
  currency: string;
  saldo: SaldoResult;
  level: "ok" | "warn" | "critical";
  onEdit: () => void;
}) {
  if (!saldo.known) return null;
  const levelCls = level === "critical" ? "border-l-destructive"
    : level === "warn" ? "border-l-yellow-400"
    : "border-l-success";
  const badgeCls = level === "critical" ? "bg-destructive/10 text-destructive"
    : level === "warn" ? "bg-yellow-400/10 text-yellow-400"
    : "bg-success/10 text-success";
  const badgeLabel = level === "critical" ? "CRÍTICO" : level === "warn" ? "ATENÇÃO" : "SAUDÁVEL";
  const barCls = level === "critical" ? "bg-destructive" : level === "warn" ? "bg-yellow-400" : "bg-success";

  return (
    <div className={`rounded-xl border border-border border-l-2 ${levelCls} bg-card p-4`}>
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm">{clientName}</strong>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badgeCls}`}>{badgeLabel}</span>
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold tabular-nums">
        {fmtMoney(saldo.remaining, currency)}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className={`h-full ${barCls}`} style={{ width: `${Math.min(saldo.consumedPct, 100)}%` }} />
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {saldo.consumedPct.toFixed(1).replace(".", ",")}% consumido · ~{fmtMoney(saldo.dailyRate, currency)}/dia · acaba em <strong className="text-foreground">{diasLabel(saldo)}</strong>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground/70">Fonte: {saldo.source}</div>
      <button onClick={onEdit}
        className="mt-3 w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
        Cadastrar / ajustar saldo
      </button>
    </div>
  );
}

import { useMemo, useState } from "react";
import { money, pct } from "../lib/format.js";
import { computeSaldo } from "../lib/saldo.js";

const FILTERS = [
  ["alertas", "Só alertas"],
  ["todos", "Todos"],
  ["semdado", "Sem saldo cadastrado"],
];

function diasLabel(saldo) {
  if (saldo.daysLeft == null) return "—";
  if (saldo.daysLeft < 1) return "menos de 1 dia";
  return `~${Math.floor(saldo.daysLeft)} dia(s)`;
}

// Card de um cliente com saldo conhecido (crítico / atenção / saudável).
function SaldoCard({ cl, saldo, onEditSaldo, onOpenClient }) {
  const labelMap = { critical: "CRÍTICO", warn: "ATENÇÃO", ok: "SAUDÁVEL" };
  return (
    <div
      className={"critical-card " + saldo.level}
      onClick={(e) => {
        if (e.target.closest(".btn-saldo")) return;
        onOpenClient(cl.name);
      }}
    >
      <div className="critical-head">
        <strong>{cl.name}</strong>
        <span className={"saldo-badge " + saldo.level}>{labelMap[saldo.level]}</span>
      </div>
      <div className="critical-saldo">{money(saldo.remaining, cl.currency)}</div>
      <div className="saldo-bar">
        <span style={{ width: Math.min(saldo.consumedPct, 100) + "%" }} />
      </div>
      <div className="critical-meta">
        {pct(saldo.consumedPct)} consumido · gasto ~{money(saldo.dailyRate, cl.currency)}/dia
        · acaba em <strong>{diasLabel(saldo)}</strong>
      </div>
      <div className="critical-meta muted">Fonte: {saldo.source}</div>
      <button
        className="btn-ghost btn-saldo"
        onClick={(e) => { e.stopPropagation(); onEditSaldo(cl.account_id); }}
      >
        Cadastrar / ajustar saldo
      </button>
    </div>
  );
}

export default function SaldoAlerts({
  clients, manualSaldo, datePreset, onEditSaldo, onOpenClient,
}) {
  const [filter, setFilter] = useState("alertas");

  const groups = useMemo(() => {
    const rows = clients.map((cl) => ({ cl, saldo: computeSaldo(cl, manualSaldo, datePreset) }));
    const byDays = (a, b) => (a.saldo.daysLeft ?? 1e9) - (b.saldo.daysLeft ?? 1e9);
    return {
      criticos: rows.filter((r) => r.saldo.known && r.saldo.level === "critical").sort(byDays),
      atencao: rows.filter((r) => r.saldo.known && r.saldo.level === "warn").sort(byDays),
      saudavel: rows.filter((r) => r.saldo.known && r.saldo.level === "ok").sort(byDays),
      semDado: rows.filter((r) => !r.saldo.known && r.saldo.spend > 0)
        .sort((a, b) => b.saldo.spend - a.saldo.spend),
    };
  }, [clients, manualSaldo, datePreset]);

  const counts = {
    criticos: groups.criticos.length,
    atencao: groups.atencao.length,
    saudavel: groups.saudavel.length,
    semDado: groups.semDado.length,
  };

  const summaryCards = [
    { key: "criticos", label: "Críticos", value: counts.criticos, cls: "red" },
    { key: "atencao", label: "Em atenção", value: counts.atencao, cls: "yellow" },
    { key: "saudavel", label: "Saudáveis", value: counts.saudavel, cls: "green" },
    { key: "semDado", label: "Sem saldo cadastrado", value: counts.semDado, cls: "" },
  ];

  // Define o que mostrar conforme o filtro.
  const showCriticos = filter === "todos" || filter === "alertas";
  const showAtencao = filter === "todos" || filter === "alertas";
  const showSaudavel = filter === "todos";
  const showSemDado = filter === "todos" || filter === "semdado";

  const nadaPraMostrar =
    (!showCriticos || !counts.criticos) &&
    (!showAtencao || !counts.atencao) &&
    (!showSaudavel || !counts.saudavel) &&
    (!showSemDado || !counts.semDado);

  return (
    <section id="view-saldo" className="view">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>🔔 Alertas de saldo</h2>
            <p className="panel-hint">
              Saldo estimado por cliente com base no que foi cadastrado, no limite da conta
              ou no orçamento das campanhas. Avise antes de zerar — mande o boleto de recarga.
            </p>
          </div>
          <div className="field field-sm" style={{ minWidth: 200 }}>
            <label htmlFor="saldo-filter">Mostrar</label>
            <select id="saldo-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
              {FILTERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
        </div>

        <div className="saldo-summary">
          {summaryCards.map((c) => (
            <div className={"saldo-summary-card " + c.cls} key={c.key}>
              <div className="saldo-summary-value">{c.value}</div>
              <div className="saldo-summary-label">{c.label}</div>
            </div>
          ))}
        </div>
      </section>

      {nadaPraMostrar && (
        <section className="panel">
          <p className="mini-empty">
            {filter === "semdado"
              ? "Todos os clientes com gasto têm saldo cadastrado. ✅"
              : "Nenhum cliente em alerta de saldo no momento. ✅"}
          </p>
        </section>
      )}

      {showCriticos && counts.criticos > 0 && (
        <section className="panel critical-panel">
          <h2>🚨 Críticos — acabando agora</h2>
          <p className="panel-hint">Saldo zerado ou esgotando em até 3 dias. Recarregue com urgência.</p>
          <div className="critical-list">
            {groups.criticos.map(({ cl, saldo }) => (
              <SaldoCard key={cl.account_id} cl={cl} saldo={saldo}
                onEditSaldo={onEditSaldo} onOpenClient={onOpenClient} />
            ))}
          </div>
        </section>
      )}

      {showAtencao && counts.atencao > 0 && (
        <section className="panel">
          <h2>⚠️ Em atenção</h2>
          <p className="panel-hint">Mais de 80% consumido ou esgotando em até 7 dias.</p>
          <div className="critical-list">
            {groups.atencao.map(({ cl, saldo }) => (
              <SaldoCard key={cl.account_id} cl={cl} saldo={saldo}
                onEditSaldo={onEditSaldo} onOpenClient={onOpenClient} />
            ))}
          </div>
        </section>
      )}

      {showSemDado && counts.semDado > 0 && (
        <section className="panel">
          <h2>❓ Sem saldo cadastrado</h2>
          <p className="panel-hint">
            Têm gasto no período mas nenhum saldo informado, limite de conta ou orçamento total.
            Cadastre o saldo recarregado pra acompanhar o esgotamento.
          </p>
          <div className="critical-list">
            {groups.semDado.map(({ cl, saldo }) => (
              <div key={cl.account_id} className="critical-card unknown"
                onClick={(e) => { if (e.target.closest(".btn-saldo")) return; onOpenClient(cl.name); }}>
                <div className="critical-head">
                  <strong>{cl.name}</strong>
                  <span className="saldo-badge">SEM DADO</span>
                </div>
                <div className="critical-meta">
                  Gasto no período: <strong>{money(saldo.spend, cl.currency)}</strong>
                </div>
                <button className="btn-ghost btn-saldo"
                  onClick={(e) => { e.stopPropagation(); onEditSaldo(cl.account_id); }}>
                  Cadastrar saldo
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {showSaudavel && counts.saudavel > 0 && (
        <section className="panel">
          <h2>✅ Saudáveis</h2>
          <p className="panel-hint">Saldo confortável pro ritmo de gasto atual.</p>
          <div className="critical-list">
            {groups.saudavel.map(({ cl, saldo }) => (
              <SaldoCard key={cl.account_id} cl={cl} saldo={saldo}
                onEditSaldo={onEditSaldo} onOpenClient={onOpenClient} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

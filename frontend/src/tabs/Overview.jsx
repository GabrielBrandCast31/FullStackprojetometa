import { useMemo, useState } from "react";
import { money, num, pct, roasClass } from "../lib/format.js";
import { computeSaldo } from "../lib/saldo.js";
import { renderMarkdown } from "../lib/markdown.js";
import { fetchAuth } from "../lib/api.js";

const SUGGESTIONS = [
  ["Quais clientes estão com problemas de desempenho?", "Clientes com problema"],
  ["Quais campanhas devo escalar e por quê?", "Campanhas para escalar"],
  ["Onde estou desperdiçando verba?", "Desperdício de verba"],
  ["Faça um resumo geral da performance", "Resumo geral"],
];

export default function Overview({
  clients, campaigns, manualSaldo, datePreset,
  onEditSaldo, onOpenClient, aiEnabled,
}) {
  // KPIs gerais.
  const k = useMemo(() => {
    const spend = campaigns.reduce((s, c) => s + c.spend, 0);
    const revenue = campaigns.reduce((s, c) => s + c.revenue, 0);
    const purchases = campaigns.reduce((s, c) => s + c.purchases, 0);
    const impressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const clicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    return {
      spend, revenue, purchases, impressions, clicks,
      roas: spend ? revenue / spend : 0,
      ctr: impressions ? (clicks / impressions) * 100 : 0,
      activeClients: clients.filter((c) => c.account_status === 1).length,
      activeCampaigns: campaigns.filter((c) => c.status === "ACTIVE").length,
    };
  }, [clients, campaigns]);

  const kpiCards = [
    { label: "Investido", value: money(k.spend) },
    { label: "Receita", value: money(k.revenue) },
    {
      label: "ROAS geral", value: k.roas.toFixed(2),
      cls: k.roas >= 2 ? "green" : k.roas >= 1 ? "yellow" : "red",
    },
    { label: "Compras", value: num(k.purchases) },
    { label: "Clientes ativos", value: `${k.activeClients}/${clients.length}` },
    { label: "Campanhas ativas", value: num(k.activeCampaigns) },
    { label: "CTR médio", value: k.ctr.toFixed(2) + "%" },
  ];

  // Pre-calculos para listas.
  const withSpend = campaigns.filter((c) => c.spend > 0);
  const convBase = withSpend.filter((c) => c.clicks >= 20);

  const bestCampaigns = [...withSpend].sort((a, b) => b.roas - a.roas).slice(0, 6);
  const worstCampaigns = [...withSpend].sort((a, b) => a.roas - b.roas).slice(0, 6);
  const bestConv = [...convBase].sort((a, b) => b.conv_rate - a.conv_rate).slice(0, 6);
  const worstConv = [...convBase].sort((a, b) => a.conv_rate - b.conv_rate).slice(0, 6);

  // Campanhas paradas: pausadas com gasto OU ativas sem entrega.
  const stopped = useMemo(() => {
    const paused = campaigns
      .filter((c) => (c.status || "").includes("PAUSED") && c.spend > 0)
      .map((c) => ({ ...c, _flag: "Pausada com gasto" }));
    const noDelivery = campaigns
      .filter((c) => c.status === "ACTIVE" && c.impressions === 0)
      .map((c) => ({ ...c, _flag: "Ativa sem entrega" }));
    return [...paused, ...noDelivery].sort((a, b) => b.spend - a.spend).slice(0, 12);
  }, [campaigns]);

  return (
    <section id="view-overview" className="view">
      <section id="kpis" className="kpi-grid">
        {kpiCards.map((c) => (
          <div className="kpi" key={c.label}>
            <div className="label">{c.label}</div>
            <div className={"value " + (c.cls || "")}>{c.value}</div>
          </div>
        ))}
      </section>

      <Critical
        clients={clients} manualSaldo={manualSaldo} datePreset={datePreset}
        onEditSaldo={onEditSaldo} onOpenClient={onOpenClient}
      />

      <div className="panel-grid">
        <MiniPanel title="🏆 Melhores campanhas" hint="(ROAS)">
          <MiniList items={bestCampaigns} onClickClient={onOpenClient}
            metric={(c) => <span className={roasClass(c.roas)}>{c.roas.toFixed(2)}</span>}
            emptyMsg="Sem campanhas com investimento." />
        </MiniPanel>
        <MiniPanel title="⚠️ Piores campanhas" hint="(ROAS)">
          <MiniList items={worstCampaigns} onClickClient={onOpenClient}
            metric={(c) => <span className={roasClass(c.roas)}>{c.roas.toFixed(2)}</span>}
            emptyMsg="Sem campanhas com investimento." />
        </MiniPanel>
        <MiniPanel title="🎯 Maiores taxas de conversão">
          <MiniList items={bestConv} onClickClient={onOpenClient}
            metric={(c) => <span className="roas-good">{c.conv_rate.toFixed(1)}%</span>}
            emptyMsg="Sem campanhas com cliques suficientes." />
        </MiniPanel>
        <MiniPanel title="🐌 Menores taxas de conversão">
          <MiniList items={worstConv} onClickClient={onOpenClient}
            metric={(c) => (
              <span className={c.conv_rate > 0 ? "roas-mid" : "roas-bad"}>
                {c.conv_rate.toFixed(1)}%
              </span>
            )}
            emptyMsg="Sem campanhas com cliques suficientes." />
        </MiniPanel>
        <MiniPanel title="⏸️ Campanhas paradas / sem entrega" wide>
          <MiniList items={stopped} onClickClient={onOpenClient}
            metric={(c) => (
              <span className={"tag " + (c._flag.startsWith("Pausada") ? "tag-paused" : "tag-other")}>
                {c._flag}
              </span>
            )}
            emptyMsg="Nenhuma campanha parada — tudo entregando. ✅" />
        </MiniPanel>
        <MiniPanel title="💡 Insights automáticos">
          <Insights campaigns={campaigns} />
        </MiniPanel>
      </div>

      <AnalysisPanel campaigns={campaigns} aiEnabled={aiEnabled} />
    </section>
  );
}

function MiniPanel({ title, hint, wide, children }) {
  return (
    <section className={"panel mini-panel" + (wide ? " wide" : "")}>
      <h2>{title} {hint && <small>{hint}</small>}</h2>
      <ul className="mini-list">{children}</ul>
    </section>
  );
}

function MiniList({ items, metric, emptyMsg, onClickClient }) {
  if (!items.length) return <li className="mini-empty">{emptyMsg}</li>;
  return items.map((c, i) => (
    <li
      key={c.id || c.name + i}
      className="mini-item"
      data-client={c.client}
      onClick={() => c.client && onClickClient && onClickClient(c.client)}
    >
      <div className="mini-info">
        <div className="mini-name">{c.name}</div>
        <div className="mini-sub">{c.client} · {money(c.spend, c.currency)}</div>
      </div>
      <div className="mini-metric">{metric(c)}</div>
    </li>
  ));
}

function Insights({ campaigns }) {
  const withSpend = campaigns.filter((c) => c.spend > 0);
  if (!withSpend.length) {
    return <li className="mini-empty">Nenhuma campanha com entrega no período.</li>;
  }
  const spend = withSpend.reduce((s, c) => s + c.spend, 0);
  const revenue = withSpend.reduce((s, c) => s + c.revenue, 0);
  const noConv = withSpend.filter((c) => c.purchases === 0);
  const low = withSpend.filter((c) => c.roas > 0 && c.roas < 1);
  const scalable = withSpend.filter((c) => c.roas >= 3 && c.purchases > 0);

  const lines = [];
  lines.push(`💰 ${money(spend)} investidos · ROAS geral ${(revenue / spend || 0).toFixed(2)}.`);
  if (noConv.length) {
    const w = noConv.reduce((s, c) => s + c.spend, 0);
    lines.push(`🚫 ${noConv.length} campanha(s) gastaram ${money(w)} sem registrar compras.`);
  }
  if (low.length) {
    lines.push(`⚠️ ${low.length} campanha(s) com ROAS abaixo de 1 — revisar criativo/público.`);
  }
  if (scalable.length) {
    lines.push(`🚀 ${scalable.length} campanha(s) com ROAS ≥ 3 — candidatas a escalar.`);
  }
  return lines.map((t, i) => (
    <li className="mini-item" key={i}><div className="mini-info">{t}</div></li>
  ));
}

function Critical({ clients, manualSaldo, datePreset, onEditSaldo, onOpenClient }) {
  const rows = clients.map((cl) => ({ cl, saldo: computeSaldo(cl, manualSaldo, datePreset) }));
  const criticos = rows
    .filter((r) => r.saldo.known && (r.saldo.level === "critical" || r.saldo.level === "warn"))
    .sort((a, b) => (a.saldo.daysLeft ?? 1e9) - (b.saldo.daysLeft ?? 1e9));
  const semDado = rows.filter((r) => !r.saldo.known && r.saldo.spend > 0);

  return (
    <section className="panel critical-panel">
      <h2>🚨 Clientes críticos — saldo acabando</h2>
      <p className="panel-hint">
        Saldo estimado por cliente. Avise antes de zerar: mande o boleto de recarga.
      </p>
      <div className="critical-list">
        {!criticos.length && !semDado.length && (
          <p className="mini-empty">Nenhum cliente em situação crítica de saldo. ✅</p>
        )}

        {criticos.map(({ cl, saldo }) => {
          const dias = saldo.daysLeft == null ? "—"
            : saldo.daysLeft < 1 ? "menos de 1 dia"
            : `~${Math.floor(saldo.daysLeft)} dia(s)`;
          return (
            <div
              key={cl.account_id}
              className={"critical-card " + saldo.level}
              onClick={(e) => {
                // Botao "Cadastrar saldo" abre o modal; clique no card vai pra campanhas.
                if (e.target.closest(".btn-saldo")) return;
                onOpenClient(cl.name);
              }}
            >
              <div className="critical-head">
                <strong>{cl.name}</strong>
                <span className={"saldo-badge " + saldo.level}>
                  {saldo.level === "critical" ? "CRÍTICO" : "ATENÇÃO"}
                </span>
              </div>
              <div className="critical-saldo">{money(saldo.remaining, cl.currency)}</div>
              <div className="saldo-bar">
                <span style={{ width: Math.min(saldo.consumedPct, 100) + "%" }} />
              </div>
              <div className="critical-meta">
                {pct(saldo.consumedPct)} consumido · gasto ~{money(saldo.dailyRate, cl.currency)}/dia
                · acaba em <strong>{dias}</strong>
              </div>
              <div className="critical-meta muted">Fonte: {saldo.source}</div>
              <button className="btn-ghost btn-saldo" onClick={(e) => { e.stopPropagation(); onEditSaldo(cl.account_id); }}>
                Cadastrar / ajustar saldo
              </button>
            </div>
          );
        })}

        {semDado.length > 0 && (
          <div className="critical-card unknown">
            <div className="critical-head">
              <strong>{semDado.length} cliente(s) sem dado de saldo</strong>
            </div>
            <div className="critical-meta">
              Têm gasto no período mas nenhum saldo informado, limite de conta ou orçamento total.
              Cadastre o saldo para acompanhar: {semDado.map((r) => r.cl.name).slice(0, 6).join(", ")}.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function AnalysisPanel({ campaigns, aiEnabled }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [warning, setWarning] = useState("");
  const [source, setSource] = useState(aiEnabled ? "ai" : "local");
  const [loading, setLoading] = useState(false);

  async function ask(q) {
    const text = (q ?? question).trim();
    if (!text) return;
    if (!campaigns.length) return;
    setLoading(true);
    setAnswer("__loading__");
    setWarning("");
    try {
      const { resp, data } = await fetchAuth("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, campaigns, currency: "BRL" }),
      });
      if (!resp.ok) throw new Error(data.detail || "Erro na análise.");
      setAnswer(data.answer || "");
      setWarning(data.warning || "");
      setSource(data.source);
    } catch (err) {
      setAnswer("__error__");
      setWarning(err.message);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) ask();
  }

  return (
    <section className="panel qa-panel">
      <h2>
        Análise inteligente{" "}
        <span className={"badge " + (source === "ai" ? "ai" : "local")}>
          {source === "ai" ? "IA (Claude)" : "Análise local"}
        </span>
      </h2>
      <p className="panel-hint">Pergunte sobre todas as campanhas de todos os clientes.</p>
      <div className="qa-input">
        <textarea
          rows={2} placeholder="Digite sua pergunta..."
          value={question} onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKey}
        />
        <button className="btn-primary" onClick={() => ask()} disabled={loading}>
          Analisar
        </button>
      </div>
      <div className="qa-suggestions">
        {SUGGESTIONS.map(([q, label]) => (
          <button key={label} className="chip" onClick={() => { setQuestion(q); ask(q); }}>
            {label}
          </button>
        ))}
      </div>
      {answer !== null && (
        <div className="answer">
          {answer === "__loading__" && <p className="loading">Analisando...</p>}
          {answer === "__error__" && <p className="warn">{warning}</p>}
          {answer && answer !== "__loading__" && answer !== "__error__" && (
            <>
              {warning && <p className="warn">⚠️ {warning}</p>}
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(answer) }} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

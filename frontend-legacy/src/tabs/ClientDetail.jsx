import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import { money, num, accountStatusLabel, roasClass, cpaClass, cpaMedian } from "../lib/format.js";
import { computeSaldo } from "../lib/saldo.js";
import { PERIOD_LABELS } from "../lib/constants.js";
import { fetchAuth } from "../lib/api.js";
import { generateReport } from "../lib/report.js";

function StatusTag({ status }) {
  if (status === "ACTIVE") return <span className="tag tag-active">Ativa</span>;
  if ((status || "").includes("PAUSED")) return <span className="tag tag-paused">Pausada</span>;
  return <span className="tag tag-other">{status || "—"}</span>;
}

export default function ClientDetail({
  client, manualSaldo, datePreset, onBack, onOpenCampaign, onEditSaldo, setStatus,
}) {
  // Defensivo: client pode estar undefined entre re-renders.
  const camps = client?.campaigns || [];
  const saldo = client ? computeSaldo(client, manualSaldo, datePreset) : null;
  const periodLabel = PERIOD_LABELS[datePreset] || datePreset;

  // ============== KPIs agregados do cliente ==============
  const k = useMemo(() => {
    const spend = camps.reduce((s, c) => s + c.spend, 0);
    const revenue = camps.reduce((s, c) => s + c.revenue, 0);
    const results = camps.reduce((s, c) => s + (c.results || 0), 0);
    const conversations = camps.reduce((s, c) => s + (c.conversations || 0), 0);
    const impressions = camps.reduce((s, c) => s + c.impressions, 0);
    const reach = camps.reduce((s, c) => s + (c.reach || 0), 0);
    const clicks = camps.reduce((s, c) => s + c.clicks, 0);
    const linkClicks = camps.reduce((s, c) => s + (c.link_clicks || 0), 0);
    return {
      spend, revenue, results, conversations, impressions, reach, clicks, linkClicks,
      ctr: impressions ? (clicks / impressions) * 100 : 0,
      cpc: clicks ? spend / clicks : 0,
      cpm: impressions ? (spend / impressions) * 1000 : 0,
      cpa: results ? spend / results : 0,
      cpcv: conversations ? spend / conversations : 0,
      roas: spend ? revenue / spend : 0,
    };
  }, [camps]);

  // Trend (compara com summary_previous se disponível).
  const prev = client.summary_previous;
  function trend(curr, previous, betterWhen = "up") {
    if (!previous || !prev) return null;
    const delta = ((curr - previous) / previous) * 100;
    const abs = Math.abs(delta).toFixed(1).replace(".", ",");
    const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "·";
    let cls = "neutral";
    if (betterWhen === "up") cls = delta > 0 ? "good" : delta < 0 ? "bad" : "neutral";
    else if (betterWhen === "down") cls = delta > 0 ? "bad" : delta < 0 ? "good" : "neutral";
    return { text: `${arrow} ${abs}%`, cls };
  }

  const kpis = [
    { label: "Investido", value: money(k.spend, client.currency), icon: "💰",
      trend: trend(k.spend, prev?.total_spend, "any") },
    { label: "Resultados", value: num(k.results), icon: "🎯",
      trend: trend(k.results, prev?.total_results, "up"), highlight: true },
    { label: "Custo por Resultado", value: k.cpa ? money(k.cpa, client.currency) : "—", icon: "💸",
      trend: trend(k.cpa, prev?.cpa, "down"), highlight: true },
    { label: "Conversas Iniciadas", value: num(k.conversations), icon: "💬",
      trend: trend(k.conversations, prev?.total_conversations, "up"), highlight: true },
    { label: "Custo por Conversa", value: k.cpcv ? money(k.cpcv, client.currency) : "—", icon: "💰",
      trend: trend(k.cpcv, prev?.cost_per_conversation, "down"), highlight: true },
    { label: "ROAS", value: k.roas.toFixed(2) + "x", icon: "📈",
      cls: k.roas >= 2 ? "green" : k.roas >= 1 ? "yellow" : "red",
      trend: trend(k.roas, prev?.roas, "up") },
    { label: "Receita", value: money(k.revenue, client.currency), icon: "💵",
      trend: trend(k.revenue, prev?.total_revenue, "up") },
    { label: "Impressões", value: num(k.impressions), icon: "👁",
      trend: trend(k.impressions, prev?.total_impressions, "up") },
    { label: "Alcance", value: num(k.reach), icon: "👥" },
    { label: "Cliques", value: num(k.clicks), icon: "👆",
      trend: trend(k.clicks, prev?.total_clicks, "up") },
    { label: "CTR", value: k.ctr.toFixed(2) + "%", icon: "📊",
      trend: trend(k.ctr, prev?.avg_ctr, "up") },
    { label: "CPC", value: k.cpc ? money(k.cpc, client.currency) : "—", icon: "💵",
      trend: trend(k.cpc, prev?.cpc, "down") },
  ];

  // ============== Timeseries do cliente ==============
  const [trendData, setTrendData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const metaToken = (typeof localStorage !== "undefined" && localStorage.getItem("meta_token")) || "";

  useEffect(() => {
    if (!client || !metaToken || trendData || trendLoading) return;
    let cancelled = false;
    (async () => {
      setTrendLoading(true);
      try {
        const { resp, data } = await fetchAuth("/api/timeseries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: metaToken,
            account_ids: [client.account_id],
            date_preset: datePreset || "last_30d",
          }),
        });
        if (cancelled || !resp.ok) return;
        const byDay = new Map();
        for (const acc of data.accounts) {
          for (const row of acc.rows) {
            const d = byDay.get(row.date_start) || { spend: 0, revenue: 0 };
            d.spend += parseFloat(row.spend || 0);
            for (const av of (row.action_values || [])) {
              if (av.action_type === "purchase" || av.action_type === "omni_purchase") {
                d.revenue += parseFloat(av.value || 0);
              }
            }
            byDay.set(row.date_start, d);
          }
        }
        const dates = [...byDay.keys()].sort();
        setTrendData({
          labels: dates.map((d) => d.slice(5)),
          spend: dates.map((d) => byDay.get(d).spend),
          revenue: dates.map((d) => byDay.get(d).revenue),
        });
      } catch { /* silencioso */ }
      finally { if (!cancelled) setTrendLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [client?.account_id, metaToken, datePreset]); // eslint-disable-line

  const chartData = trendData && {
    labels: trendData.labels,
    datasets: [
      { label: "Investido", data: trendData.spend,
        borderColor: "#6C02ED", backgroundColor: "rgba(108,2,237,0.10)",
        tension: 0.35, fill: true, pointRadius: 0, borderWidth: 2.5 },
      { label: "Receita", data: trendData.revenue,
        borderColor: "#4ade80", backgroundColor: "rgba(74,222,128,0.08)",
        tension: 0.35, fill: false, pointRadius: 0, borderWidth: 2.5, borderDash: [6, 4] },
    ],
  };
  const chartOpts = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: "index", intersect: false,
        callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${money(ctx.parsed.y, client.currency)}` } },
    },
    interaction: { mode: "index", intersect: false },
    scales: {
      x: { ticks: { color: "#71717a" }, grid: { display: false } },
      y: { ticks: { color: "#71717a", callback: (v) => "R$ " + Math.round(v / 1000) + "k" },
           grid: { color: "#25252e" }, beginAtZero: true },
    },
  };

  // Tabela de campanhas ordenada por gasto.
  const sortedCamps = useMemo(() => [...camps].sort((a, b) => b.spend - a.spend), [camps]);
  const cpaRef = useMemo(() => cpaMedian(camps, "cost_per_result"), [camps]);

  if (!client) {
    return (
      <section className="view detail-view">
        <div className="detail-empty">Cliente não encontrado.</div>
      </section>
    );
  }

  return (
    <section className="view detail-view">
      <header className="detail-header">
        <button className="back-btn" onClick={onBack}>← Voltar</button>
        <div className="detail-title-block">
          <h1>{client.name}</h1>
          <div className="detail-meta">
            <span className="status-pill">
              <span className="status-dot"></span>
              {accountStatusLabel(client.account_status)}
            </span>
            <span className="period-badge">📅 {periodLabel}</span>
            <span className="detail-sub">{camps.length} campanha(s) · {client.currency || "BRL"}</span>
          </div>
        </div>
        <div className="detail-header-actions">
          <button className="btn-ghost" onClick={() => onEditSaldo && onEditSaldo(client.account_id)}>
            Saldo
          </button>
          <button className="btn-primary" onClick={() => generateReport({
            clients: [client], accountId: client.account_id, datePreset, manualSaldo,
            onError: (msg) => setStatus && setStatus({ msg, type: "error" }),
          })}>
            📄 Relatório
          </button>
        </div>
      </header>

      {saldo && saldo.known && (
        <section className={"panel saldo-strip saldo-" + saldo.level}>
          <div>
            <span className="saldo-strip-label">SALDO RESTANTE</span>
            <span className="saldo-strip-value">{money(saldo.remaining, client.currency)}</span>
          </div>
          <div className="saldo-strip-info">
            {saldo.consumedPct.toFixed(1).replace(".", ",")}% consumido · gasto ~{money(saldo.dailyRate, client.currency)}/dia
            {saldo.daysLeft != null && ` · ${Math.max(0, Math.floor(saldo.daysLeft))} dia(s) restantes`}
            <div className="saldo-strip-bar">
              <span style={{ width: Math.min(saldo.consumedPct, 100) + "%" }} />
            </div>
          </div>
        </section>
      )}

      {/* KPIs grid (4 destacados + restantes) */}
      <section className="detail-kpis">
        {kpis.map((c) => (
          <div className={"kpi-cell" + (c.highlight ? " kpi-cell-highlight" : "")} key={c.label}>
            <div className="kpi-cell-head">
              <span className="kpi-cell-label">{c.label}</span>
              <span className="kpi-cell-icon">{c.icon}</span>
            </div>
            <div className={"kpi-cell-value " + (c.cls || "")}>{c.value}</div>
            {c.trend && <div className={"kpi-cell-trend " + c.trend.cls}>{c.trend.text}</div>}
          </div>
        ))}
      </section>

      {/* Timeseries do cliente */}
      <section className="chart-panel">
        <div className="widget-header"><h2>Performance Diária</h2></div>
        <div className="widget-body">
          <div className="performance-legend" style={{ marginBottom: 8 }}>
            <span className="legend-item"><span className="dot dot-spend"></span>Investido</span>
            <span className="legend-item"><span className="dot dot-revenue"></span>Receita</span>
          </div>
          <div className="chart-wrap chart-wrap-tall">
            {trendData
              ? <Line data={chartData} options={chartOpts} />
              : <div className="performance-loading">
                  {trendLoading ? "Carregando série diária..." : "Sem dados de tendência."}
                </div>}
          </div>
        </div>
      </section>

      {/* Tabela de campanhas */}
      <section className="chart-panel">
        <div className="widget-header">
          <h2>Campanhas do Cliente</h2>
          <span className="widget-header-actions">{sortedCamps.length} no período</span>
        </div>
        <div className="widget-body" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="detail-campaigns-table">
              <thead>
                <tr>
                  <th>CAMPANHA</th>
                  <th>STATUS</th>
                  <th>INVESTIDO</th>
                  <th>RESULTADOS</th>
                  <th>CUSTO/RESULT.</th>
                  <th>CONVERSAS</th>
                  <th>IMPR.</th>
                  <th>CLIQUES</th>
                  <th>CTR</th>
                  <th>ROAS</th>
                </tr>
              </thead>
              <tbody>
                {!sortedCamps.length && (
                  <tr><td colSpan={10} className="empty-row">Nenhuma campanha no período.</td></tr>
                )}
                {sortedCamps.map((c) => (
                  <tr key={c.id} className="detail-camp-row"
                      onClick={() => onOpenCampaign && onOpenCampaign(c.id)}>
                    <td className="detail-camp-name">
                      {c.name}
                      {c.objective && <div className="detail-camp-obj">{c.objective}</div>}
                    </td>
                    <td><StatusTag status={c.status} /></td>
                    <td>{money(c.spend, client.currency)}</td>
                    <td>{num(c.results)} <small>{c.results_label}</small></td>
                    <td className={cpaClass(c.cost_per_result, cpaRef)}>
                      {c.cost_per_result ? money(c.cost_per_result, client.currency) : "—"}
                    </td>
                    <td>{num(c.conversations)}</td>
                    <td>{num(c.impressions)}</td>
                    <td>{num(c.clicks)}</td>
                    <td>{c.ctr.toFixed(2)}%</td>
                    <td className={roasClass(c.roas)}>{c.roas.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}

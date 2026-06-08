import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, Filler, Legend, LinearScale,
  LineElement, PointElement, Title, Tooltip,
} from "chart.js";
import { money, num, cpaClass, cpaMedian } from "../lib/format.js";
import { computeSaldo } from "../lib/saldo.js";
import { PERIOD_LABELS } from "../lib/constants.js";
import { fetchAuth } from "../lib/api.js";
import { generateReport } from "../lib/report.js";

ChartJS.register(CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Title, Tooltip);

export default function Overview({
  clients, campaigns, manualSaldo, datePreset,
  onOpenClient, onEditSaldo, setStatus,
}) {
  // ============== KPIs do periodo atual ==============
  const k = useMemo(() => {
    const spend = campaigns.reduce((s, c) => s + c.spend, 0);
    const revenue = campaigns.reduce((s, c) => s + c.revenue, 0);
    const results = campaigns.reduce((s, c) => s + (c.results || 0), 0);
    const impressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const clicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    return {
      spend, revenue, results, impressions, clicks,
      ctr: impressions ? (clicks / impressions) * 100 : 0,
      cpc: clicks ? spend / clicks : 0,
      cpa: results ? spend / results : 0,
      roas: spend ? revenue / spend : 0,
    };
  }, [campaigns]);

  // ============== Agregados do periodo anterior (trend) ==============
  const prev = useMemo(() => {
    const acc = { spend: 0, revenue: 0, results: 0,
                  impressions: 0, clicks: 0, hasData: false };
    for (const cl of clients) {
      const p = cl.summary_previous;
      if (!p) continue;
      acc.hasData = true;
      acc.spend += p.total_spend || 0;
      acc.revenue += p.total_revenue || 0;
      acc.results += p.total_results || 0;
      acc.impressions += p.total_impressions || 0;
      acc.clicks += p.total_clicks || 0;
    }
    acc.ctr = acc.impressions ? (acc.clicks / acc.impressions) * 100 : 0;
    acc.cpc = acc.clicks ? acc.spend / acc.clicks : 0;
    acc.cpa = acc.results ? acc.spend / acc.results : 0;
    acc.roas = acc.spend ? acc.revenue / acc.spend : 0;
    return acc;
  }, [clients]);

  // Trend percentual com seta + classe semantica.
  function trend(curr, previous, betterWhen = "up") {
    if (!prev.hasData || !previous) return null;
    const delta = ((curr - previous) / previous) * 100;
    const abs = Math.abs(delta).toFixed(1).replace(".", ",");
    const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "·";
    let cls = "neutral";
    if (betterWhen === "up") cls = delta > 0 ? "good" : delta < 0 ? "bad" : "neutral";
    else if (betterWhen === "down") cls = delta > 0 ? "bad" : delta < 0 ? "good" : "neutral";
    return { text: `${arrow} ${abs}%`, cls };
  }

  // 6 KPIs do mockup.
  const kpis = [
    { label: "Investimento Total", value: money(k.spend), icon: "💰",
      trend: trend(k.spend, prev.spend, "any") },
    { label: "Cliques", value: num(k.clicks), icon: "👆",
      trend: trend(k.clicks, prev.clicks, "up") },
    { label: "CTR Médio", value: k.ctr.toFixed(2) + "%", icon: "📊",
      trend: trend(k.ctr, prev.ctr, "up") },
    { label: "CPC Médio", value: k.cpc ? money(k.cpc) : "—", icon: "💵",
      trend: trend(k.cpc, prev.cpc, "down") },
    { label: "Conversões", value: num(k.results), icon: "🛒",
      trend: trend(k.results, prev.results, "up") },
    { label: "ROAS", value: k.roas.toFixed(2) + "x", icon: "📈",
      trend: trend(k.roas, prev.roas, "up") },
  ];

  // ============== Performance chart (timeseries) ==============
  const [trendData, setTrendData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const metaToken = (typeof localStorage !== "undefined" && localStorage.getItem("meta_token")) || "";

  useEffect(() => {
    if (!clients.length || !metaToken || trendData || trendLoading) return;
    let cancelled = false;
    (async () => {
      setTrendLoading(true);
      try {
        const { resp, data } = await fetchAuth("/api/timeseries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: metaToken,
            account_ids: clients.map((c) => c.account_id),
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
      } catch { /* silencioso, mantém placeholder */ }
      finally { if (!cancelled) setTrendLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [clients, metaToken, datePreset]); // eslint-disable-line

  const chartData = trendData && {
    labels: trendData.labels,
    datasets: [
      {
        label: "Investido", data: trendData.spend,
        borderColor: "#6C02ED", backgroundColor: "rgba(108,2,237,0.10)",
        tension: 0.35, fill: true, pointRadius: 0, borderWidth: 2.5,
      },
      {
        label: "Receita", data: trendData.revenue,
        borderColor: "#4ade80", backgroundColor: "rgba(74,222,128,0.08)",
        tension: 0.35, fill: false, pointRadius: 0, borderWidth: 2.5,
        borderDash: [6, 4],
      },
    ],
  };
  const chartOpts = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: "index", intersect: false,
        callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${money(ctx.parsed.y)}` },
      },
    },
    interaction: { mode: "index", intersect: false },
    scales: {
      x: { ticks: { color: "#71717a" }, grid: { display: false } },
      y: {
        ticks: { color: "#71717a", callback: (v) => "R$ " + Math.round(v / 1000) + "k" },
        grid: { color: "#25252e" }, beginAtZero: true,
      },
    },
  };

  // ============== Top Campanhas (top 5 por gasto) ==============
  const topCampaigns = useMemo(() =>
    [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 5)
  , [campaigns]);
  const topCpaRef = useMemo(() => cpaMedian(campaigns, "cost_per_result"), [campaigns]);

  // ============== Alertas (saldo crítico/atenção, top 3) ==============
  const alerts = useMemo(() => {
    const rows = clients.map((cl) => ({ cl, saldo: computeSaldo(cl, manualSaldo, datePreset) }));
    return rows
      .filter((r) => r.saldo.known && (r.saldo.level === "critical" || r.saldo.level === "warn"))
      .sort((a, b) => (a.saldo.daysLeft ?? 1e9) - (b.saldo.daysLeft ?? 1e9));
  }, [clients, manualSaldo, datePreset]);
  const criticalCount = alerts.filter((a) => a.saldo.level === "critical").length;

  // ============== PDF ==============
  function exportPdf() {
    generateReport({
      clients, accountId: null, datePreset, manualSaldo,
      onError: (msg) => setStatus && setStatus({ msg, type: "error" }),
    });
  }

  const periodLabel = PERIOD_LABELS[datePreset] || datePreset;

  return (
    <section id="view-overview" className="view overview-view">
      <header className="overview-header">
        <div>
          <h1>Performance Geral</h1>
          <p className="overview-sub">Visão consolidada de todas as plataformas.</p>
        </div>
        <div className="overview-header-right">
          <span className="period-badge">📅  {periodLabel}</span>
          <button className="btn-ghost" onClick={exportPdf} disabled={!clients.length}>
            📄 PDF
          </button>
        </div>
      </header>

      <section className="overview-kpis">
        {kpis.map((c) => (
          <div className="kpi-cell" key={c.label}>
            <div className="kpi-cell-head">
              <span className="kpi-cell-label">{c.label}</span>
              <span className="kpi-cell-icon">{c.icon}</span>
            </div>
            <div className="kpi-cell-value">{c.value}</div>
            {c.trend && <div className={"kpi-cell-trend " + c.trend.cls}>{c.trend.text}</div>}
          </div>
        ))}
      </section>

      <section className="panel performance-panel">
        <header className="performance-head">
          <h2>Performance por Plataforma</h2>
          <div className="performance-legend">
            <span className="legend-item"><span className="dot dot-spend"></span>Investido</span>
            <span className="legend-item"><span className="dot dot-revenue"></span>Receita</span>
          </div>
        </header>
        <div className="performance-chart">
          {trendData
            ? <Line data={chartData} options={chartOpts} />
            : <div className="performance-loading">
                {trendLoading ? "Carregando série diária..." : "Sem dados de tendência."}
              </div>}
        </div>
      </section>

      <div className="overview-bottom">
        <section className="panel top-campaigns-panel">
          <h2>Top Campanhas</h2>
          <div className="table-wrap">
            <table className="top-campaigns-table">
              <thead>
                <tr>
                  <th>CAMPANHA</th>
                  <th>PLATAFORMA</th>
                  <th>GASTO</th>
                  <th>CONV.</th>
                  <th>CPA</th>
                </tr>
              </thead>
              <tbody>
                {!topCampaigns.length && (
                  <tr><td colSpan={5} className="empty-row">Nenhuma campanha no período.</td></tr>
                )}
                {topCampaigns.map((c) => (
                  <tr key={c.id} onClick={() => onOpenClient && onOpenClient(c.client)}
                      className="top-campaign-row">
                    <td className="top-campaign-name">{c.name}</td>
                    <td><span className="platform-tag">Meta</span></td>
                    <td>{money(c.spend, c.currency)}</td>
                    <td>{num(c.results)}</td>
                    <td className={"top-campaign-cpa " + cpaClass(c.cost_per_result, topCpaRef)}>
                      {c.cost_per_result ? money(c.cost_per_result, c.currency) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel overview-alerts-panel">
          <header className="alerts-head">
            <h2>Alertas</h2>
            {criticalCount > 0 && (
              <span className="alerts-count-badge">{criticalCount} Críticos</span>
            )}
          </header>
          <div className="alerts-list">
            {!alerts.length && (
              <p className="alerts-empty">Nenhum alerta no momento. ✅</p>
            )}
            {alerts.slice(0, 3).map(({ cl, saldo }) => {
              const dias = saldo.daysLeft == null ? "—"
                : saldo.daysLeft < 1 ? "menos de 1 dia"
                : `${Math.floor(saldo.daysLeft)} dia(s)`;
              const title = saldo.level === "critical"
                ? "Saldo Esgotando"
                : "Atenção ao Saldo";
              const icon = saldo.level === "critical" ? "⊘" : "⚠";
              return (
                <div className={"alert-card alert-" + saldo.level} key={cl.account_id}>
                  <div className="alert-icon">{icon}</div>
                  <div className="alert-body">
                    <div className="alert-title">{title}</div>
                    <p className="alert-desc">
                      <strong>{cl.name}</strong> · acaba em {dias} ({money(saldo.remaining, cl.currency)} restantes).
                    </p>
                    <button className="alert-link" onClick={() => onEditSaldo && onEditSaldo(cl.account_id)}>
                      Ajustar saldo →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

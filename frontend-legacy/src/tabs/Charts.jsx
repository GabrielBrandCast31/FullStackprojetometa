import { useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { money, num } from "../lib/format.js";
import { chartColor } from "../lib/constants.js";
import { fetchAuth } from "../lib/api.js";
import { generateChartsReport } from "../lib/report.js";

ChartJS.register(
  ArcElement, BarElement, CategoryScale, Filler, Legend,
  LinearScale, LineElement, PointElement, Title, Tooltip,
);

function fmtBRLAxis(v) { return "R$ " + Math.round(v).toLocaleString("pt-BR"); }

const METRIC_LABELS = {
  spend: "Investido", revenue: "Receita", roas: "ROAS",
  purchases: "Compras", clicks: "Cliques",
  reach: "Alcance", cpm: "CPM",
  link_clicks: "Cliques no link", cost_per_result: "Custo por resultado",
  results: "Resultados", frequency: "Frequência",
};

export default function Charts({ clients, campaigns, datePreset, metaToken, setStatus }) {
  // Captura cada <canvas> dentro de .chart-panel como PNG e dispara o PDF.
  function exportChartsPdf() {
    const panels = document.querySelectorAll("#view-charts .chart-panel");
    const collected = [];
    panels.forEach((panel) => {
      const canvas = panel.querySelector("canvas");
      if (!canvas || !canvas.width || !canvas.height) return;
      const title = panel.querySelector("h2")?.textContent?.trim() || "";
      const hint = panel.querySelector(".panel-hint")?.textContent?.trim() || "";
      try {
        collected.push({ title, hint, dataUrl: canvas.toDataURL("image/png") });
      } catch { /* tainted canvas, ignora */ }
    });
    generateChartsReport({
      charts: collected, clients, campaigns, datePreset,
      onError: (msg) => setStatus && setStatus({ msg, type: "error" }),
    });
  }

  const [metric, setMetric] = useState("spend");
  const [topN, setTopN] = useState(10);
  const [clientFilter, setClientFilter] = useState("ALL");
  const [trend, setTrend] = useState(null); // { labels, spend, revenue, roas } | null
  const [trendStatus, setTrendStatus] = useState(
    "Carrega gasto, receita e ROAS dia a dia (1 chamada extra ao Meta).",
  );
  const [trendLoading, setTrendLoading] = useState(false);

  const clientNames = useMemo(() => clients.map((c) => c.name).sort(), [clients]);

  const byClient = useMemo(() => {
    return clients
      .map((cl) => {
        const camps = cl.campaigns || [];
        const reach = camps.reduce((s, c) => s + (c.reach || 0), 0);
        const impressions = cl.summary.total_impressions;
        // Frequência média ponderada por impressões.
        const freqWeighted = camps.reduce((s, c) => s + (c.frequency || 0) * (c.impressions || 0), 0);
        const frequency = impressions ? freqWeighted / impressions : 0;
        return {
          name: cl.name,
          spend: cl.summary.total_spend,
          revenue: cl.summary.total_revenue,
          roas: cl.summary.roas,
          reach,
          frequency,
        };
      })
      .filter((c) => c.spend > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 12);
  }, [clients]);

  // ---- Barras: gasto + receita + ROAS (linha) por cliente
  const clientBarData = {
    labels: byClient.map((c) => c.name),
    datasets: [
      { label: "Investido", data: byClient.map((c) => c.spend), backgroundColor: "#6C02ED", yAxisID: "y" },
      { label: "Receita",   data: byClient.map((c) => c.revenue), backgroundColor: "#3fb950", yAxisID: "y" },
      {
        label: "ROAS", data: byClient.map((c) => c.roas),
        backgroundColor: "#d29922", borderColor: "#d29922",
        yAxisID: "y2", type: "line", tension: 0.3, pointRadius: 4,
      },
    ],
  };
  const clientBarOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#e6e9ef" } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.y;
            if (ctx.dataset.label === "ROAS") return ` ROAS ${v.toFixed(2)}`;
            return ` ${ctx.dataset.label}: ` + money(v);
          },
        },
      },
    },
    scales: {
      x: { ticks: { color: "#8b94a7", autoSkip: false, maxRotation: 45, minRotation: 30 },
           grid: { color: "#2a3242" } },
      y: { ticks: { color: "#8b94a7", callback: fmtBRLAxis }, grid: { color: "#2a3242" } },
      y2: { position: "right", ticks: { color: "#d29922" }, grid: { display: false } },
    },
  };

  // ---- Donut de participacao no gasto
  const top = byClient.slice(0, 8);
  const restoSum = byClient.slice(8).reduce((s, c) => s + c.spend, 0);
  const shareLabels = top.map((c) => c.name);
  const shareValues = top.map((c) => c.spend);
  if (restoSum > 0) { shareLabels.push("Outros"); shareValues.push(restoSum); }
  const shareData = {
    labels: shareLabels,
    datasets: [{
      data: shareValues,
      backgroundColor: shareLabels.map((_, i) => chartColor(i)),
      borderColor: "#161b22",
      borderWidth: 2,
    }],
  };
  const shareOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: "right", labels: { color: "#e6e9ef", font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
            const p = total ? (ctx.parsed / total * 100).toFixed(1) : 0;
            return ` ${ctx.label}: ${money(ctx.parsed)} (${p}%)`;
          },
        },
      },
    },
  };

  // ---- Top N campanhas pela metrica selecionada
  const camps = useMemo(() => {
    let arr = campaigns.filter((c) => c.spend > 0);
    if (clientFilter !== "ALL") arr = arr.filter((c) => c.client === clientFilter);
    return [...arr].sort((a, b) => (b[metric] || 0) - (a[metric] || 0)).slice(0, topN);
  }, [campaigns, metric, topN, clientFilter]);

  const isMoney = ["spend", "revenue", "cpm", "cost_per_result"].includes(metric);
  const isDecimal = metric === "roas" || metric === "frequency";
  function fmtMetric(v) {
    if (isMoney) return money(v);
    if (isDecimal) return (v || 0).toFixed(2);
    return num(v);
  }
  const campBarData = {
    labels: camps.map((c) => c.name.length > 38 ? c.name.slice(0, 36) + "…" : c.name),
    datasets: [{
      label: METRIC_LABELS[metric],
      data: camps.map((c) => c[metric] || 0),
      backgroundColor: camps.map((c) => {
        if (metric === "roas") {
          if (c.roas >= 2) return "#3fb950";
          if (c.roas >= 1) return "#d29922";
          return "#f85149";
        }
        return "#6C02ED";
      }),
    }],
  };
  const campBarOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const c = camps[ctx.dataIndex];
            return ` ${fmtMetric(ctx.parsed.y)} · ${c.client}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#e6e9ef", font: { size: 10 }, autoSkip: false,
                 maxRotation: 50, minRotation: 35 },
        grid: { display: false },
      },
      y: {
        ticks: { color: "#8b94a7", callback: (v) => isMoney ? fmtBRLAxis(v) : v },
        grid: { color: "#2a3242" }, beginAtZero: true,
      },
    },
  };

  // ---- Alcance + Frequencia por cliente (barra + linha)
  const reachData = {
    labels: byClient.map((c) => c.name),
    datasets: [
      {
        label: "Alcance", data: byClient.map((c) => c.reach),
        backgroundColor: "#a371f7", yAxisID: "y",
      },
      {
        label: "Frequência", data: byClient.map((c) => c.frequency),
        type: "line", borderColor: "#d29922", backgroundColor: "#d29922",
        tension: 0.3, pointRadius: 4, yAxisID: "y2",
      },
    ],
  };
  const reachOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#e6e9ef" } },
      tooltip: {
        callbacks: {
          label: (ctx) => ctx.dataset.label === "Frequência"
            ? ` ${ctx.parsed.y.toFixed(2)}× por pessoa`
            : ` ${num(ctx.parsed.y)} pessoas`,
        },
      },
    },
    scales: {
      x: { ticks: { color: "#8b94a7", maxRotation: 45, minRotation: 30 }, grid: { color: "#2a3242" } },
      y: { ticks: { color: "#8b94a7", callback: (v) => num(v) }, grid: { color: "#2a3242" } },
      y2: { position: "right", ticks: { color: "#d29922" }, grid: { display: false }, beginAtZero: true },
    },
  };

  // ---- Funil de eficiencia (impressoes -> alcance -> cliques link -> resultados)
  const funnel = useMemo(() => {
    const pool = clientFilter === "ALL"
      ? campaigns
      : campaigns.filter((c) => c.client === clientFilter);
    return {
      impressions: pool.reduce((s, c) => s + (c.impressions || 0), 0),
      reach: pool.reduce((s, c) => s + (c.reach || 0), 0),
      link_clicks: pool.reduce((s, c) => s + (c.link_clicks || 0), 0),
      results: pool.reduce((s, c) => s + (c.results || 0), 0),
    };
  }, [campaigns, clientFilter]);

  const funnelData = {
    labels: ["Impressões", "Alcance", "Cliques no link", "Resultados"],
    datasets: [{
      label: "Volume",
      data: [funnel.impressions, funnel.reach, funnel.link_clicks, funnel.results],
      backgroundColor: ["#6C02ED", "#a371f7", "#56d4dd", "#3fb950"],
    }],
  };
  const funnelOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const base = funnel.impressions || 1;
            const p = (ctx.parsed.y / base * 100).toFixed(1);
            return ` ${num(ctx.parsed.y)} · ${p}% de impressões`;
          },
        },
      },
    },
    scales: {
      x: { ticks: { color: "#e6e9ef", font: { size: 12 } }, grid: { display: false } },
      y: { ticks: { color: "#8b94a7", callback: (v) => num(v) },
           grid: { color: "#2a3242" }, beginAtZero: true },
    },
  };

  // ---- Status Counters (ATIVAS / PAUSADAS / SEM ENTREGA / TOTAL)
  const statusCounters = useMemo(() => {
    const ativas = campaigns.filter((c) => c.status === "ACTIVE").length;
    const pausadas = campaigns.filter((c) => (c.status || "").includes("PAUSED")).length;
    const semEntrega = campaigns.filter((c) => c.status === "ACTIVE" && c.impressions === 0).length;
    return { ativas, pausadas, semEntrega, total: campaigns.length };
  }, [campaigns]);

  // ---- Risco: % de campanhas ativas COM gasto e ROAS < 1 (queimando)
  const risco = useMemo(() => {
    const ativas = campaigns.filter((c) => c.status === "ACTIVE" && c.spend > 0);
    if (!ativas.length) return { pct: 0, count: 0, total: 0 };
    const queimando = ativas.filter((c) => c.roas < 1).length;
    return { pct: (queimando / ativas.length) * 100, count: queimando, total: ativas.length };
  }, [campaigns]);

  // ---- Maior cliente: % do gasto total
  const maiorCliente = useMemo(() => {
    if (!byClient.length) return null;
    const total = byClient.reduce((s, c) => s + c.spend, 0) +
                  (clients.length > byClient.length ? 0 : 0);
    if (!total) return null;
    const top = byClient[0];
    return { name: top.name, pct: (top.spend / total) * 100, spend: top.spend };
  }, [byClient, clients.length]);

  // ---- Tendencia diaria (chamada explicita: 1 request extra ao Meta)
  async function loadTrend() {
    if (!clients.length) return;
    const t = metaToken?.trim();
    if (!t) {
      setTrendStatus("Cole o access token e carregue os clientes antes.");
      return;
    }
    setTrendLoading(true);
    setTrendStatus("Carregando tendência diária...");
    try {
      const { resp, data } = await fetchAuth("/api/timeseries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: t,
          account_ids: clients.map((c) => c.account_id),
          date_preset: datePreset || "last_30d",
        }),
      });
      if (!resp.ok) throw new Error(data.detail || "Falha ao carregar tendência.");

      const byDay = new Map();
      for (const acc of data.accounts) {
        for (const row of acc.rows) {
          const date = row.date_start;
          if (!byDay.has(date)) byDay.set(date, { spend: 0, revenue: 0 });
          const d = byDay.get(date);
          d.spend += parseFloat(row.spend || 0);
          for (const av of (row.action_values || [])) {
            if (av.action_type === "purchase" || av.action_type === "omni_purchase") {
              d.revenue += parseFloat(av.value || 0);
            }
          }
        }
      }
      const dates = [...byDay.keys()].sort();
      setTrend({
        labels: dates.map((d) => d.slice(5)), // mm-dd
        spend: dates.map((d) => byDay.get(d).spend),
        revenue: dates.map((d) => byDay.get(d).revenue),
        roas: dates.map((d) => {
          const r = byDay.get(d);
          return r.spend ? r.revenue / r.spend : 0;
        }),
      });
      setTrendStatus(`Tendência diária — ${dates.length} dia(s) com entrega.`);
    } catch (err) {
      setTrendStatus("Falha: " + err.message);
    } finally {
      setTrendLoading(false);
    }
  }

  const trendData = trend ? {
    labels: trend.labels,
    datasets: [
      { label: "Investido", data: trend.spend, borderColor: "#6C02ED",
        backgroundColor: "rgba(76,141,255,0.15)", tension: 0.3, yAxisID: "y", fill: true },
      { label: "Receita", data: trend.revenue, borderColor: "#3fb950",
        backgroundColor: "rgba(63,185,80,0.10)", tension: 0.3, yAxisID: "y", fill: true },
      { label: "ROAS", data: trend.roas, borderColor: "#d29922",
        backgroundColor: "transparent", tension: 0.3, yAxisID: "y2", pointRadius: 3 },
    ],
  } : null;
  const trendOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#e6e9ef" } },
      tooltip: { mode: "index", intersect: false },
    },
    interaction: { mode: "index", intersect: false },
    scales: {
      x: { ticks: { color: "#8b94a7" }, grid: { color: "#2a3242" } },
      y: { ticks: { color: "#8b94a7", callback: fmtBRLAxis }, grid: { color: "#2a3242" } },
      y2: { position: "right", ticks: { color: "#d29922" }, grid: { display: false } },
    },
  };

  return (
    <section id="view-charts" className="view">
      <section className="panel">
        <h2>📊 Performance por cliente e por campanha</h2>
        <p className="panel-hint">
          Visualizações geradas a partir dos dados já carregados. A tendência diária
          faz uma chamada extra ao Meta — clique em <strong>Carregar tendência</strong>.
        </p>
        <div className="charts-controls">
          <div className="field field-sm">
            <label htmlFor="chart-metric">Métrica das barras</label>
            <select id="chart-metric" value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="spend">Investido</option>
              <option value="revenue">Receita</option>
              <option value="roas">ROAS</option>
              <option value="purchases">Compras</option>
              <option value="clicks">Cliques</option>
              <option value="link_clicks">Cliques no link</option>
              <option value="reach">Alcance</option>
              <option value="results">Resultados</option>
              <option value="cost_per_result">Custo por resultado</option>
              <option value="cpm">CPM</option>
              <option value="frequency">Frequência</option>
            </select>
          </div>
          <div className="field field-sm">
            <label htmlFor="chart-topn">Top N (campanhas)</label>
            <select id="chart-topn" value={topN} onChange={(e) => setTopN(parseInt(e.target.value, 10))}>
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
            </select>
          </div>
          <div className="field field-sm">
            <label htmlFor="chart-client">Cliente (campanhas)</label>
            <select id="chart-client" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="ALL">Todos os clientes</option>
              {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button className="btn-ghost" onClick={loadTrend} disabled={trendLoading}>
            Carregar tendência diária
          </button>
          <button className="btn-primary" onClick={exportChartsPdf} disabled={!clients.length}>
            📄 Baixar PDF dos gráficos
          </button>
        </div>
      </section>

      <div className="charts-grid">
        {/* Widget 1: Status das Campanhas (4 contadores coloridos) */}
        <section className="chart-panel">
          <div className="widget-header"><h2>Status das Campanhas</h2></div>
          <div className="widget-body">
            <div className="status-counters">
              <div className="status-counter">
                <div className="status-counter-value green">{statusCounters.ativas}</div>
                <span className="status-counter-label green">ATIVAS</span>
              </div>
              <div className="status-counter">
                <div className="status-counter-value yellow">{statusCounters.pausadas}</div>
                <span className="status-counter-label yellow">PAUSADAS</span>
              </div>
              <div className="status-counter">
                <div className="status-counter-value orange">{statusCounters.semEntrega}</div>
                <span className="status-counter-label orange">SEM ENTREGA</span>
              </div>
              <div className="status-counter">
                <div className="status-counter-value accent">{statusCounters.total}</div>
                <span className="status-counter-label accent">TOTAL</span>
              </div>
            </div>
          </div>
          <div className="widget-footer">
            <span>{statusCounters.total} campanha(s) no período</span>
            <span>Distribuição por status</span>
          </div>
        </section>

        {/* Widget 2: Gauge - Campanhas em Risco */}
        <section className="chart-panel">
          <div className="widget-header"><h2>Campanhas em Risco</h2></div>
          <div className="widget-body gauge-widget">
            <Gauge pct={risco.pct} color={risco.pct >= 30 ? "#f87171" : risco.pct >= 15 ? "#facc15" : "#4ade80"} />
            <div className={"gauge-label " +
              (risco.pct >= 30 ? "status-counter-label red"
                : risco.pct >= 15 ? "status-counter-label yellow"
                : "status-counter-label green")}>
              {risco.count} EM RISCO
            </div>
          </div>
          <div className="widget-footer">
            <span>{risco.total} campanha(s) ativas com gasto</span>
            <span>ROAS &lt; 1 = queimando</span>
          </div>
        </section>

        {/* Widget 3: Donut Participação no Investimento (com % central do maior) */}
        <section className="chart-panel">
          <div className="widget-header"><h2>Participação no Investimento</h2></div>
          <div className="widget-body">
            <div className="chart-wrap donut-with-center">
              <Doughnut data={shareData} options={shareOpts} />
              {maiorCliente && (
                <div className="donut-center-text">
                  <div className="donut-center-value">{maiorCliente.pct.toFixed(0)}%</div>
                  <div className="donut-center-label">{maiorCliente.name}</div>
                </div>
              )}
            </div>
          </div>
          <div className="widget-footer">
            <span>{byClient.length} cliente(s) com gasto</span>
            <span>Top cliente em destaque</span>
          </div>
        </section>

        {/* Widget 4: Por Cliente — barras */}
        <section className="chart-panel wide">
          <div className="widget-header"><h2>Performance por Cliente</h2></div>
          <div className="widget-body">
            <p className="panel-hint">Gasto, receita e ROAS de cada cliente.</p>
            <div className="chart-wrap chart-wrap-tall"><Bar data={clientBarData} options={clientBarOpts} /></div>
          </div>
          <div className="widget-footer">
            <span>{byClient.length} cliente(s)</span>
            <span>Barras (R$) + linha (ROAS)</span>
          </div>
        </section>

        {/* Widget 5: Top campanhas */}
        <section className="chart-panel full">
          <div className="widget-header">
            <h2>Top Campanhas — {METRIC_LABELS[metric]}</h2>
          </div>
          <div className="widget-body">
            <p className="panel-hint">Maiores campanhas pela métrica selecionada acima.</p>
            <div className="chart-wrap chart-wrap-tall">
              <Bar data={campBarData} options={campBarOpts} />
            </div>
          </div>
          <div className="widget-footer">
            <span>Top {topN} {clientFilter !== "ALL" ? `de ${clientFilter}` : "no geral"}</span>
            <span>Métrica: {METRIC_LABELS[metric]}</span>
          </div>
        </section>

        {/* Widget 6: Alcance × Frequência */}
        <section className="chart-panel">
          <div className="widget-header"><h2>Alcance × Frequência</h2></div>
          <div className="widget-body">
            <p className="panel-hint">Pessoas únicas (barra) + média de vezes que cada uma viu (linha).</p>
            <div className="chart-wrap"><Bar data={reachData} options={reachOpts} /></div>
          </div>
          <div className="widget-footer">
            <span>{byClient.length} cliente(s)</span>
            <span>Pondera frequência por impressões</span>
          </div>
        </section>

        {/* Widget 7: Funil de eficiência */}
        <section className="chart-panel">
          <div className="widget-header"><h2>Funil de Eficiência</h2></div>
          <div className="widget-body">
            <p className="panel-hint">
              Impressões → Alcance → Cliques link → Resultados
              {clientFilter !== "ALL" ? ` · ${clientFilter}` : ""}.
            </p>
            <div className="chart-wrap"><Bar data={funnelData} options={funnelOpts} /></div>
          </div>
          <div className="widget-footer">
            <span>{clientFilter === "ALL" ? "Todos os clientes" : clientFilter}</span>
            <span>% relativo às impressões</span>
          </div>
        </section>

        {/* Widget 8: Tendência diária (largura tripla) */}
        <section className="chart-panel full">
          <div className="widget-header"><h2>Tendência Diária</h2></div>
          <div className="widget-body">
            <p className="panel-hint">{trendStatus}</p>
            <div className="chart-wrap chart-wrap-tall">
              {trendData
                ? <Line data={trendData} options={trendOpts} />
                : <div style={{ height: "100%" }} />}
            </div>
          </div>
          <div className="widget-footer">
            <span>Investido + Receita + ROAS dia a dia</span>
            <span>Requer 1 chamada extra ao Meta</span>
          </div>
        </section>
      </div>
    </section>
  );
}

// ============================================================
// Gauge (semicírculo) — SVG inline. pct: 0..100, color: hex string
// ============================================================
function Gauge({ pct, color }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const radius = 80;
  const cx = 100, cy = 100;
  const arcLen = Math.PI * radius; // half circumference
  const offset = arcLen - (arcLen * clamped / 100);
  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 200 130">
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none" strokeWidth="18" className="gauge-track"
        />
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none" strokeWidth="18"
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={offset}
          className="gauge-fill"
        />
      </svg>
      <div className="gauge-value" style={{ color }}>{clamped.toFixed(0)}%</div>
    </div>
  );
}

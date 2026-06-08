import { money, num } from "../lib/format.js";
import { PERIOD_LABELS } from "../lib/constants.js";

function StatusTag({ status }) {
  if (status === "ACTIVE") return <span className="tag tag-active">Ativa</span>;
  if ((status || "").includes("PAUSED")) return <span className="tag tag-paused">Pausada</span>;
  return <span className="tag tag-other">{status || "—"}</span>;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR"); }
  catch { return iso; }
}

export default function CampaignDetail({ campaign, client, datePreset, onBack }) {
  if (!campaign) {
    return (
      <section className="view detail-view">
        <div className="detail-empty">Campanha não encontrada.</div>
      </section>
    );
  }
  const currency = client?.currency || campaign.currency || "BRL";
  const periodLabel = PERIOD_LABELS[datePreset] || datePreset;

  // 12 KPIs principais da campanha.
  const kpis = [
    { label: "Investido", value: money(campaign.spend, currency), icon: "💰" },
    { label: "Resultados", value: num(campaign.results), icon: "🎯",
      highlight: true, sub: campaign.results_label },
    { label: "Custo por Resultado",
      value: campaign.cost_per_result ? money(campaign.cost_per_result, currency) : "—",
      icon: "💸", highlight: true },
    { label: "Conversas Iniciadas", value: num(campaign.conversations), icon: "💬",
      highlight: true },
    { label: "Custo por Conversa",
      value: campaign.cost_per_conversation ? money(campaign.cost_per_conversation, currency) : "—",
      icon: "💰", highlight: true },
    { label: "ROAS", value: (campaign.roas || 0).toFixed(2) + "x", icon: "📈",
      cls: campaign.roas >= 2 ? "green" : campaign.roas >= 1 ? "yellow" : "red" },
    { label: "Receita", value: money(campaign.revenue, currency), icon: "💵" },
    { label: "Compras", value: num(campaign.purchases), icon: "🛒" },
    { label: "Impressões", value: num(campaign.impressions), icon: "👁" },
    { label: "Alcance", value: num(campaign.reach), icon: "👥" },
    { label: "Frequência", value: (campaign.frequency || 0).toFixed(2) + "x", icon: "🔁" },
    { label: "Cliques", value: num(campaign.clicks), icon: "👆" },
    { label: "Cliques no Link", value: num(campaign.link_clicks), icon: "🔗" },
    { label: "CTR", value: (campaign.ctr || 0).toFixed(2) + "%", icon: "📊" },
    { label: "CPC", value: campaign.cpc ? money(campaign.cpc, currency) : "—", icon: "💵" },
    { label: "CPM", value: campaign.cpm ? money(campaign.cpm, currency) : "—", icon: "📺" },
  ];

  // Metadados da campanha.
  const meta = [
    ["Cliente", client?.name || campaign.client || "—"],
    ["Plataforma", "Meta Ads"],
    ["Objetivo", campaign.objective || "—"],
    ["Status", <StatusTag key="s" status={campaign.status} />],
    ["Orçamento", campaign.budget
      ? `${money(campaign.budget, currency)} (${campaign.budget_type})`
      : "—"],
    ["Início", fmtDate(campaign.start_time)],
    ["Término", fmtDate(campaign.stop_time)],
    ["Atribuição", campaign.attribution_setting || "—"],
  ];

  return (
    <section className="view detail-view">
      <header className="detail-header">
        <button className="back-btn" onClick={onBack}>← Voltar</button>
        <div className="detail-title-block">
          <div className="detail-breadcrumb">
            {client?.name || campaign.client} / Campanhas
          </div>
          <h1>{campaign.name}</h1>
          <div className="detail-meta">
            <StatusTag status={campaign.status} />
            <span className="period-badge">📅 {periodLabel}</span>
            {campaign.objective && <span className="detail-sub">{campaign.objective}</span>}
          </div>
        </div>
      </header>

      {/* Metadados da campanha (grid 4 colunas) */}
      <section className="chart-panel">
        <div className="widget-header"><h2>Informações da Campanha</h2></div>
        <div className="widget-body">
          <div className="meta-grid">
            {meta.map(([k, v]) => (
              <div className="meta-item" key={k}>
                <span className="meta-key">{k}</span>
                <span className="meta-val">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KPIs principais (destacados) + restantes */}
      <section className="detail-kpis">
        {kpis.map((c) => (
          <div className={"kpi-cell" + (c.highlight ? " kpi-cell-highlight" : "")} key={c.label}>
            <div className="kpi-cell-head">
              <span className="kpi-cell-label">{c.label}</span>
              <span className="kpi-cell-icon">{c.icon}</span>
            </div>
            <div className={"kpi-cell-value " + (c.cls || "")}>{c.value}</div>
            {c.sub && <div className="kpi-cell-sub">{c.sub}</div>}
          </div>
        ))}
      </section>
    </section>
  );
}

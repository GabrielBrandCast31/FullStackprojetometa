import { money, num, pct, esc, roasClass, accountStatusLabel } from "./format.js";
import { PERIOD_LABELS } from "./constants.js";
import { computeSaldo } from "./saldo.js";

// Gera um relatorio imprimivel (HTML autocontido, abre em nova aba).
// Cmd+P -> salvar como PDF. Se accountId for passado, gera para 1 cliente.
export function generateReport({ clients, accountId, datePreset, manualSaldo, onError }) {
  if (!clients.length) {
    if (onError) onError("Carregue os clientes antes de gerar o relatório.");
    return;
  }
  const filtered = accountId
    ? clients.filter((c) => c.account_id === accountId)
    : clients.slice();
  if (!filtered.length) return;

  filtered.sort((a, b) => b.summary.total_spend - a.summary.total_spend);

  const periodLabel = PERIOD_LABELS[datePreset] || datePreset;
  const now = new Date();
  const generatedAt = now.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const title = accountId
    ? `Relatório · ${filtered[0].name}`
    : "Relatório consolidado de clientes";

  const allCamps = filtered.flatMap((c) => c.campaigns || []);
  const tSpend = allCamps.reduce((s, c) => s + c.spend, 0);
  const tRevenue = allCamps.reduce((s, c) => s + c.revenue, 0);
  const tPurchases = allCamps.reduce((s, c) => s + c.purchases, 0);
  const tImpressions = allCamps.reduce((s, c) => s + c.impressions, 0);
  const tClicks = allCamps.reduce((s, c) => s + c.clicks, 0);
  const tActive = allCamps.filter((c) => c.status === "ACTIVE").length;
  const overallRoas = tSpend ? tRevenue / tSpend : 0;
  const overallCtr = tImpressions ? (tClicks / tImpressions) * 100 : 0;
  const overallCpa = tPurchases ? tSpend / tPurchases : 0;

  const clientSections = filtered.map((cl) => {
    const s = cl.summary;
    const saldo = computeSaldo(cl, manualSaldo, datePreset);
    const camps = (cl.campaigns || [])
      .slice()
      .sort((a, b) => b.spend - a.spend);

    const saldoBlock = saldo.known
      ? `<div class="rpt-saldo rpt-saldo-${saldo.level}">
           <strong>Saldo restante:</strong> ${money(saldo.remaining, cl.currency)}
           · ${pct(saldo.consumedPct)} consumido
           ${saldo.daysLeft != null ? "· acaba em ~" + Math.max(0, Math.floor(saldo.daysLeft)) + " dia(s)" : ""}
           <br><span class="rpt-muted">Fonte: ${esc(saldo.source)}</span>
         </div>`
      : `<div class="rpt-saldo"><span class="rpt-muted">Saldo não cadastrado</span></div>`;

    const campRows = camps.length
      ? camps.map((c) => `
        <tr>
          <td>${esc(c.name)}</td>
          <td>${esc(c.status)}</td>
          <td>${c.budget ? money(c.budget, cl.currency) + " <small>(" + esc(c.budget_type) + ")</small>" : "—"}</td>
          <td>${money(c.spend, cl.currency)}</td>
          <td>${num(c.impressions)}</td>
          <td>${num(c.clicks)}</td>
          <td>${c.ctr.toFixed(2)}%</td>
          <td>${num(c.purchases)}</td>
          <td>${money(c.revenue, cl.currency)}</td>
          <td class="rpt-${roasClass(c.roas)}">${c.roas.toFixed(2)}</td>
          <td>${c.cpa ? money(c.cpa, cl.currency) : "—"}</td>
        </tr>`).join("")
      : '<tr><td colspan="11" class="rpt-empty">Nenhuma campanha no período.</td></tr>';

    const errBlock = cl.error ? `<div class="rpt-error">⚠ ${esc(cl.error)}</div>` : "";

    return `
      <section class="rpt-client">
        <div class="rpt-client-head">
          <h2>${esc(cl.name)}</h2>
          <div class="rpt-muted">
            ${accountStatusLabel(cl.account_status)}
            · ${num(s.total_campaigns)} campanha(s)
            (${num(s.active_campaigns)} ativa(s))
          </div>
        </div>
        ${errBlock}
        ${saldoBlock}
        <div class="rpt-kpis">
          <div class="rpt-kpi"><div>Investido</div><strong>${money(s.total_spend, cl.currency)}</strong></div>
          <div class="rpt-kpi"><div>Receita</div><strong>${money(s.total_revenue, cl.currency)}</strong></div>
          <div class="rpt-kpi"><div>ROAS</div><strong class="rpt-${roasClass(s.roas)}">${s.roas.toFixed(2)}</strong></div>
          <div class="rpt-kpi"><div>Compras</div><strong>${num(s.total_purchases)}</strong></div>
          <div class="rpt-kpi"><div>CPA</div><strong>${s.cpa ? money(s.cpa, cl.currency) : "—"}</strong></div>
          <div class="rpt-kpi"><div>CTR</div><strong>${s.avg_ctr.toFixed(2)}%</strong></div>
          <div class="rpt-kpi"><div>Impressões</div><strong>${num(s.total_impressions)}</strong></div>
          <div class="rpt-kpi"><div>Cliques</div><strong>${num(s.total_clicks)}</strong></div>
        </div>
        <table class="rpt-table">
          <thead>
            <tr>
              <th>Campanha</th><th>Status</th><th>Orçamento</th>
              <th>Investido</th><th>Impr.</th><th>Cliques</th>
              <th>CTR</th><th>Compras</th><th>Receita</th>
              <th>ROAS</th><th>CPA</th>
            </tr>
          </thead>
          <tbody>${campRows}</tbody>
        </table>
      </section>
    `;
  }).join("");

  const consolidatedBlock = !accountId ? `
    <section class="rpt-cover">
      <h2>Resumo consolidado</h2>
      <div class="rpt-kpis">
        <div class="rpt-kpi"><div>Clientes</div><strong>${num(filtered.length)}</strong></div>
        <div class="rpt-kpi"><div>Campanhas</div><strong>${num(allCamps.length)} <small>(${num(tActive)} ativas)</small></strong></div>
        <div class="rpt-kpi"><div>Investido</div><strong>${money(tSpend)}</strong></div>
        <div class="rpt-kpi"><div>Receita</div><strong>${money(tRevenue)}</strong></div>
        <div class="rpt-kpi"><div>ROAS geral</div><strong class="rpt-${roasClass(overallRoas)}">${overallRoas.toFixed(2)}</strong></div>
        <div class="rpt-kpi"><div>Compras</div><strong>${num(tPurchases)}</strong></div>
        <div class="rpt-kpi"><div>CPA médio</div><strong>${overallCpa ? money(overallCpa) : "—"}</strong></div>
        <div class="rpt-kpi"><div>CTR médio</div><strong>${overallCtr.toFixed(2)}%</strong></div>
      </div>
    </section>` : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)} · ${esc(periodLabel)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      background: #fff; color: #111; padding: 28px 36px; line-height: 1.45;
    }
    header.rpt-top {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 16px; border-bottom: 2px solid #1e88e5; margin-bottom: 22px;
    }
    .rpt-brand { font-size: 13px; color: #555; }
    .rpt-brand .logo { color: #1e88e5; font-weight: 700; font-size: 22px; }
    .rpt-top h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .rpt-top .rpt-meta { font-size: 12px; color: #555; text-align: right; }
    .rpt-cover { margin-bottom: 28px; }
    .rpt-cover h2 {
      font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;
      color: #1e88e5; margin-bottom: 10px;
    }
    .rpt-kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }
    .rpt-kpi {
      background: #f5f7fb; border: 1px solid #e4e8f0;
      border-radius: 8px; padding: 10px 12px;
    }
    .rpt-kpi div { font-size: 10.5px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .rpt-kpi strong { font-size: 17px; display: block; margin-top: 3px; font-weight: 700; }
    .rpt-client { margin-bottom: 32px; page-break-inside: avoid; }
    .rpt-client-head { margin-bottom: 10px; border-left: 4px solid #1e88e5; padding-left: 10px; }
    .rpt-client-head h2 { font-size: 18px; margin-bottom: 2px; }
    .rpt-muted { color: #777; font-size: 11.5px; }
    .rpt-saldo {
      background: #f5f7fb; border: 1px solid #e4e8f0;
      padding: 8px 12px; border-radius: 6px; margin-bottom: 10px; font-size: 12px;
    }
    .rpt-saldo-warn { background: #fff7e6; border-color: #f0c040; }
    .rpt-saldo-critical { background: #fdecec; border-color: #f5a4a4; color: #8a1f1f; }
    .rpt-error {
      background: #fdecec; border: 1px solid #f5a4a4;
      padding: 6px 10px; border-radius: 6px; color: #8a1f1f;
      font-size: 11.5px; margin-bottom: 8px;
    }
    .rpt-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
    .rpt-table th, .rpt-table td {
      padding: 6px 8px; border-bottom: 1px solid #e4e8f0; text-align: right;
    }
    .rpt-table th { background: #f5f7fb; font-weight: 700; font-size: 10px;
      text-transform: uppercase; letter-spacing: 0.3px; color: #555; }
    .rpt-table th:first-child, .rpt-table td:first-child { text-align: left; max-width: 280px; white-space: normal; }
    .rpt-table th:nth-child(2), .rpt-table td:nth-child(2) { text-align: left; }
    .rpt-empty { color: #777; text-align: center !important; padding: 14px !important; }
    .rpt-roas-good { color: #1d7a30; font-weight: 700; }
    .rpt-roas-mid  { color: #a37200; font-weight: 700; }
    .rpt-roas-bad  { color: #b3261e; font-weight: 700; }
    .rpt-actions {
      position: fixed; top: 12px; right: 16px;
      display: flex; gap: 8px;
    }
    .rpt-actions button {
      background: #1e88e5; color: #fff; border: none;
      padding: 8px 14px; border-radius: 6px; font-weight: 600;
      cursor: pointer; font-size: 12px;
    }
    .rpt-actions button:hover { background: #1565c0; }
    .rpt-footer {
      margin-top: 28px; padding-top: 12px; border-top: 1px solid #e4e8f0;
      text-align: center; font-size: 10.5px; color: #888;
    }
    @media print {
      body { padding: 14px 20px; }
      .rpt-actions { display: none; }
      .rpt-client { page-break-inside: avoid; }
      .rpt-cover, .rpt-client:not(:first-of-type) { page-break-before: auto; }
    }
    @page { margin: 14mm; size: A4; }
  </style>
</head>
<body>
  <div class="rpt-actions">
    <button onclick="window.print()">🖨️ Imprimir / PDF</button>
  </div>
  <header class="rpt-top">
    <div>
      <div class="rpt-brand"><span class="logo">◆</span> Brandcast · Meta Ads</div>
      <h1>${esc(title)}</h1>
    </div>
    <div class="rpt-meta">
      <strong>Período:</strong> ${esc(periodLabel)}<br>
      <strong>Gerado em:</strong> ${esc(generatedAt)}<br>
      ${accountId ? "" : `<strong>Clientes:</strong> ${num(filtered.length)}`}
    </div>
  </header>
  ${consolidatedBlock}
  ${clientSections}
  <div class="rpt-footer">
    Relatório gerado automaticamente · Dashboard Meta Ads · Brandcast
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    if (onError) onError("Permita pop-ups deste site para gerar o relatório.");
    URL.revokeObjectURL(url);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

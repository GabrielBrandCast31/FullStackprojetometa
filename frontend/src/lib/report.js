import { fmtMoney as money, fmtNum as num } from "./api/client";
import { PERIOD_LABELS } from "./saldo";
import brandcastLogoUrl from "../assets/brandcastlogo.png";

// ============================================================================
// Gerador de relatórios PDF — modelo Brandcast (tema claro).
// Estrutura: cabeçalho com logo → resumo executivo → KPIs → tabelas →
// comparativo → recomendações → rodapé. Abre HTML em nova aba pra imprimir/PDF.
// ============================================================================

function pct(v) { return ((v || 0).toFixed(1) + "%").replace(".", ","); }
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmtPeriodoExtenso(datePreset) {
  // Constrói "DD de mês de AAAA a DD de mês de AAAA (N dias)" a partir do preset.
  const days = { last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 }[datePreset] || 30;
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const fim = new Date(); fim.setDate(fim.getDate() - 1);
  const ini = new Date(fim); ini.setDate(ini.getDate() - (days - 1));
  const f = (d) => `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
  return `${f(ini)} a ${f(fim)} (${days} dias)`;
}

// --- Logo: PNG → dataURI base64 (canvas), cacheado. Necessário pq o relatório
// abre em janela blob: onde URL relativa não resolve. ---
let _logoDataUriCache = null;
async function getBrandLogoDataUri() {
  if (_logoDataUriCache) return _logoDataUriCache;
  try {
    _logoDataUriCache = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const targetH = 200;
        const scale = Math.min(1, targetH / img.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try { resolve(canvas.toDataURL("image/png")); } catch (e) { reject(e); }
      };
      img.onerror = (e) => reject(e || new Error("img load failed"));
      img.src = brandcastLogoUrl;
    });
  } catch {
    _logoDataUriCache = brandcastLogoUrl;
  }
  return _logoDataUriCache;
}

// ============================================================================
// CSS do template (tema claro Brandcast)
// ============================================================================
const REPORT_CSS = `
  :root {
    --roxo: #6C02ED;
    --roxo-escuro: #4a0a8f;
    --roxo-claro: #f3ecfe;
    --verde: #15803d;
    --verde-bg: #dcfce7;
    --texto: #1f2937;
    --muted: #6b7280;
    --borda: #e5e7eb;
    --zebra: #faf8ff;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #fff; color: var(--texto);
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px; line-height: 1.55;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { max-width: 820px; margin: 0 auto; padding: 40px 48px 60px; }

  /* Cabeçalho */
  .rpt-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px;
    border-bottom: 3px solid var(--roxo); padding-bottom: 18px; margin-bottom: 28px; }
  .rpt-head-logo { height: 46px; width: auto; }
  .rpt-kicker { font-size: 11px; font-weight: 700; letter-spacing: 1.5px;
    text-transform: uppercase; color: var(--muted); }
  .rpt-title { font-size: 32px; font-weight: 800; color: var(--roxo); line-height: 1.1; margin: 2px 0 4px; }
  .rpt-sub { font-size: 13px; color: var(--muted); }

  /* Seções */
  h2.sec { font-size: 18px; font-weight: 700; color: var(--roxo); margin: 28px 0 10px; }
  h3.sub { font-size: 14px; font-weight: 700; color: var(--roxo-escuro); margin: 16px 0 4px; }
  p { margin-bottom: 10px; }
  .muted-note { font-size: 11.5px; color: var(--muted); font-style: italic; margin-top: 8px; }

  /* Grid de KPIs */
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--borda);
    border-radius: 8px; overflow: hidden; margin: 6px 0 4px; }
  .kpi { padding: 14px 12px; text-align: center; border-right: 1px solid var(--borda);
    border-bottom: 1px solid var(--borda); }
  .kpi:nth-child(4n) { border-right: none; }
  .kpi:nth-last-child(-n+4) { border-bottom: none; }
  .kpi-label { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: var(--muted); }
  .kpi-value { font-size: 18px; font-weight: 800; color: var(--roxo); margin-top: 4px; }

  /* Tabelas */
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  thead th { background: var(--roxo); color: #fff; font-weight: 700; text-align: left;
    padding: 9px 10px; font-size: 11px; }
  thead th.num { text-align: right; }
  tbody td { padding: 9px 10px; border-bottom: 1px solid var(--borda); }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr:nth-child(even) { background: var(--zebra); }
  tbody tr.total td { font-weight: 800; background: #f3f4f6; border-top: 2px solid var(--roxo); }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 3px;
    vertical-align: middle; }
  .dot.roxo { background: var(--roxo); }
  .dot.roxo2 { background: #a78bfa; }
  .green { color: var(--verde); font-weight: 800; }
  .green-cell { background: var(--verde-bg) !important; color: var(--verde); font-weight: 800; }

  /* Comparativo (métrica × colunas) */
  .cmp th:first-child { width: 38%; }
  .cmp td:first-child, .cmp th:first-child { text-align: left; }
  .cmp td:not(:first-child), .cmp th:not(:first-child) { text-align: center; }

  /* Bullets */
  ul.recs { margin: 6px 0 10px 4px; }
  ul.recs li { margin: 0 0 8px 16px; padding-left: 4px; }

  /* Rodapé */
  .rpt-foot { margin-top: 36px; padding-top: 14px; border-top: 1px solid var(--borda);
    text-align: center; font-size: 11px; color: var(--muted); }
  .rpt-foot .gen { font-style: italic; margin-bottom: 4px; }

  .actions { position: fixed; top: 16px; right: 16px; }
  .actions button { background: var(--roxo); color: #fff; border: none; border-radius: 8px;
    padding: 10px 18px; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(108,2,237,.3); }
  @media print { .actions { display: none; } .page { padding: 0; } @page { margin: 16mm; size: A4; } }
`;

// Shell comum: cabeçalho com logo + corpo + rodapé.
function shell({ logoUri, kicker, title, sub, body, footName }) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" />
<title>${esc(title)} — Relatório Brandcast</title><style>${REPORT_CSS}</style></head>
<body>
  <div class="actions"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
  <div class="page">
    <header class="rpt-head">
      <div>
        <div class="rpt-kicker">${esc(kicker)}</div>
        <div class="rpt-title">${esc(title)}</div>
        <div class="rpt-sub">${esc(sub)}</div>
      </div>
      ${logoUri ? `<img class="rpt-head-logo" src="${logoUri}" alt="Agência Brandcast" />` : ""}
    </header>
    ${body}
    <footer class="rpt-foot">
      <div class="gen">Relatório gerado pela Agência Brandcast a partir dos dados do Gerenciador de Anúncios da Meta.</div>
      <div>${esc(footName)}</div>
    </footer>
  </div>
</body></html>`;
}

function openReport(html, onError) {
  const w = window.open("", "_blank");
  if (!w) { if (onError) onError("Permita pop-ups deste site para gerar o relatório."); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function kpi(label, value) {
  return `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div></div>`;
}

function statusLabel(s) {
  if (s === "ACTIVE") return "Ativo";
  if ((s || "").includes("PAUSED")) return "Pausado";
  if (!s || s === "—" || s === "UNKNOWN") return "Inativo";
  return "Não veiculando";
}

// ============================================================================
// 1) RELATÓRIO DE CAMPANHA — modelo principal (conjuntos de anúncios)
//    Chamado do modal de breakdown, recebe os adsets/ads já carregados.
// ============================================================================
export async function generateCampaignReport({ campaign, adsets = [], ads = [], datePreset, currency = "BRL", onError }) {
  try {
    const logoUri = await getBrandLogoDataUri();
    const periodo = fmtPeriodoExtenso(datePreset);
    const cur = currency || "BRL";

    // Totais a partir dos conjuntos.
    const tInvest = adsets.reduce((s, a) => s + (a.spend || 0), 0);
    const tImpr = adsets.reduce((s, a) => s + (a.impressions || 0), 0);
    const tReach = adsets.reduce((s, a) => s + (a.reach || 0), 0);
    const tConv = adsets.reduce((s, a) => s + (a.results || 0), 0);
    const comResultado = adsets.filter((a) => a.results > 0);
    const comGasto = adsets.filter((a) => a.spend > 0);
    const cpr = tConv ? tInvest / tConv : 0;
    const cpm = tImpr ? (tInvest / tImpr) * 1000 : 0;
    const freq = tReach ? tImpr / tReach : 0;
    const resultLabel = (comResultado[0]?.results_label) || "Conversas";

    // Melhor e pior conjunto (por custo por resultado, entre os com resultado).
    const rank = [...comResultado].sort((a, b) => a.cost_per_result - b.cost_per_result);
    const melhor = rank[0];
    const pior = rank.length > 1 ? rank[rank.length - 1] : null;
    const economiaPct = (melhor && pior && pior.cost_per_result)
      ? Math.round((1 - melhor.cost_per_result / pior.cost_per_result) * 100) : 0;

    // ---- Resumo executivo (texto heurístico) ----
    const resumo = [];
    resumo.push(
      `A campanha <strong>${esc(campaign.name)}</strong> foi veiculada no período de ${periodo}, ` +
      `com ${adsets.length} conjunto(s) de anúncios configurado(s). ` +
      `${comGasto.length} conjunto(s) registraram gasto e ${comResultado.length} efetivamente gerou(geraram) ` +
      `resultados (${resultLabel.toLowerCase()}).`
    );
    resumo.push(
      `No total, foram investidos <strong>${money(tInvest, cur)}</strong>, gerando ${num(tImpr)} impressões ` +
      `e alcançando ${num(tReach)} pessoas únicas. A campanha originou <strong>${num(tConv)} ${resultLabel.toLowerCase()}</strong>.`
    );
    if (melhor) {
      resumo.push(
        `O custo médio por resultado foi de <strong>${money(cpr, cur)}</strong>. ` +
        `O destaque positivo é o <strong>${esc(melhor.name)}</strong>, que entregou o menor custo por resultado ` +
        `da campanha (${money(melhor.cost_per_result, cur)})` +
        (pior && economiaPct > 0 ? `, ${economiaPct}% mais barato que o ${esc(pior.name)}.` : ".")
      );
    }

    // ---- KPIs ----
    const kpisHtml = `<div class="kpis">
      ${kpi("Valor Investido", money(tInvest, cur))}
      ${kpi("Impressões", num(tImpr))}
      ${kpi("Alcance", num(tReach))}
      ${kpi("Frequência", freq.toFixed(2).replace(".", ","))}
      ${kpi(resultLabel, num(tConv))}
      ${kpi("Custo por Resultado", melhor ? money(cpr, cur) : "—")}
      ${kpi("CPM", money(cpm, cur))}
      ${kpi("Conjuntos Ativos", num(adsets.filter((a) => a.status === "ACTIVE").length))}
    </div>`;

    // ---- Tabela de conjuntos ----
    const linhas = [...adsets].sort((a, b) => b.spend - a.spend).map((a) => `
      <tr>
        <td><span class="dot roxo"></span><span class="dot roxo2"></span> <strong>${esc(a.name)}</strong></td>
        <td>${esc(statusLabel(a.status))}</td>
        <td class="num">${a.results ? num(a.results) : "—"}</td>
        <td class="num">${money(a.spend, cur)}</td>
        <td class="num">${num(a.impressions)}</td>
        <td class="num">${num(a.reach)}</td>
        <td class="num">${a.cost_per_result ? money(a.cost_per_result, cur) : "—"}</td>
      </tr>`).join("");
    const tabelaConjuntos = `
      <table>
        <thead><tr>
          <th>Conjunto de anúncios</th><th>Status</th><th class="num">${esc(resultLabel)}</th>
          <th class="num">Investido</th><th class="num">Impressões</th><th class="num">Alcance</th><th class="num">Custo/result.</th>
        </tr></thead>
        <tbody>
          ${linhas}
          <tr class="total"><td>TOTAL</td><td>—</td><td class="num">${num(tConv)}</td>
            <td class="num">${money(tInvest, cur)}</td><td class="num">${num(tImpr)}</td>
            <td class="num">${num(tReach)}</td><td class="num">${melhor ? money(cpr, cur) : "—"}</td></tr>
        </tbody>
      </table>`;

    const semResultado = comGasto.filter((a) => a.results === 0);
    const obs = semResultado.length
      ? `<p class="muted-note">Observação: ${semResultado.map((a) => esc(a.name)).join(", ")} ` +
        `${semResultado.length === 1 ? "teve gasto" : "tiveram gasto"} mas não registr${semResultado.length === 1 ? "ou" : "aram"} ` +
        `resultados — possível objetivo de otimização diferente ou problema de configuração.</p>`
      : "";

    // ---- Comparativo top 2 ----
    let comparativo = "";
    if (rank.length >= 2) {
      const [a1, a2] = rank; // a1 = melhor (menor CPR)
      const row = (label, v1, v2, melhorEh) => {
        const c1 = melhorEh === 1 ? "green-cell" : "";
        const c2 = melhorEh === 2 ? "green-cell" : "";
        return `<tr><td>${label}</td><td class="${c1}">${v1}</td><td class="${c2}">${v2}</td></tr>`;
      };
      const cpm1 = a1.cpm || (a1.impressions ? (a1.spend / a1.impressions) * 1000 : 0);
      const cpm2 = a2.cpm || (a2.impressions ? (a2.spend / a2.impressions) * 1000 : 0);
      comparativo = `
        <h2 class="sec">Comparativo: ${esc(a2.name)} vs ${esc(a1.name)}</h2>
        <p>Os dois conjuntos com melhor performance são comparados abaixo. Valores em <span class="green">verde</span> indicam o melhor desempenho na métrica.</p>
        <table class="cmp">
          <thead><tr><th>Métrica</th><th>${esc(a2.name)}</th><th>${esc(a1.name)}</th></tr></thead>
          <tbody>
            ${row("Investimento", money(a2.spend, cur), money(a1.spend, cur), a2.spend < a1.spend ? 1 : 2)}
            ${row(resultLabel, num(a2.results), num(a1.results), a2.results > a1.results ? 1 : 2)}
            ${row("Custo por resultado", money(a2.cost_per_result, cur), money(a1.cost_per_result, cur), a2.cost_per_result < a1.cost_per_result ? 1 : 2)}
            ${row("Impressões", num(a2.impressions), num(a1.impressions), a2.impressions > a1.impressions ? 1 : 2)}
            ${row("Alcance", num(a2.reach), num(a1.reach), a2.reach > a1.reach ? 1 : 2)}
            ${row("CPM", money(cpm2, cur), money(cpm1, cur), cpm2 < cpm1 ? 1 : 2)}
            ${row("Frequência", (a2.frequency || 0).toFixed(2).replace(".", ","), (a1.frequency || 0).toFixed(2).replace(".", ","), 0)}
          </tbody>
        </table>`;
    }

    // ---- Recomendações (heurística) ----
    const recs = [];
    if (melhor) recs.push(`<strong>Escalar o ${esc(melhor.name)}:</strong> é o conjunto mais eficiente da campanha (menor custo por resultado, ${money(melhor.cost_per_result, cur)}). Aumente o orçamento de forma gradual (20–30%) pra preservar a aprendizagem do algoritmo.`);
    if (pior && economiaPct > 0) recs.push(`<strong>Revisar o ${esc(pior.name)}:</strong> custo por resultado ${economiaPct}% mais alto que o melhor conjunto. Antes de pausar, teste duplicar o vencedor com variação de público.`);
    if (semResultado.length) recs.push(`<strong>Investigar ${semResultado.map((a) => esc(a.name)).join(", ")}:</strong> gastaram sem gerar resultado. Verifique o objetivo de otimização e o indicador de resultado.`);
    const inativos = adsets.filter((a) => a.spend === 0);
    if (inativos.length) recs.push(`<strong>Ativar ou descartar ${inativos.map((a) => esc(a.name)).join(", ")}:</strong> não tiveram veiculação no período. Use como testes A/B contra o conjunto vencedor ou remova pra simplificar a campanha.`);
    if (melhor) recs.push(`<strong>Definir meta de custo por resultado:</strong> use o ${esc(melhor.name)} como benchmark (${money(melhor.cost_per_result, cur)}) e estabeleça um teto de tolerância pra pausar conjuntos acima disso.`);

    const body = `
      <h2 class="sec">Resumo executivo</h2>
      ${resumo.map((p) => `<p>${p}</p>`).join("")}
      <h2 class="sec">Visão geral dos indicadores</h2>
      ${kpisHtml}
      <p class="muted-note">Frequência indica em média quantas vezes cada pessoa alcançada viu o anúncio. CPM é o custo a cada mil impressões. Custo por resultado considera apenas conjuntos que geraram resultado.</p>
      <h2 class="sec">Desempenho por conjunto de anúncios</h2>
      <p>Tabela consolidada com todos os conjuntos da campanha no período analisado:</p>
      ${tabelaConjuntos}
      ${obs}
      ${comparativo}
      ${recs.length ? `<h2 class="sec">Recomendações</h2><ul class="recs">${recs.map((r) => `<li>${r}</li>`).join("")}</ul>` : ""}
    `;

    openReport(shell({
      logoUri, kicker: "Relatório de Campanha", title: campaign.name,
      sub: `Conjuntos de anúncios • ${periodo}`,
      body, footName: `Relatório ${campaign.name} • Agência Brandcast`,
    }), onError);
  } catch (e) {
    if (onError) onError(e instanceof Error ? e.message : "Falha ao gerar relatório.");
  }
}

// ============================================================================
// 2) RELATÓRIO DE CLIENTE — visão consolidada das campanhas do cliente.
//    Mantém a assinatura antiga { clients, accountId, datePreset, ... }.
// ============================================================================
export async function generateReport({ clients = [], accountId, datePreset, onError }) {
  try {
    const logoUri = await getBrandLogoDataUri();
    const periodo = fmtPeriodoExtenso(datePreset);
    const isSingle = !!accountId;
    const client = isSingle ? clients.find((c) => c.account_id === accountId) : null;
    const campaigns = isSingle
      ? (client?.campaigns || [])
      : clients.flatMap((c) => (c.campaigns || []).map((cp) => ({ ...cp, _cur: c.currency })));
    const cur = isSingle ? (client?.currency || "BRL") : "BRL";
    const title = isSingle ? (client?.name || "Cliente") : "Consolidado de Clientes";

    const tInvest = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
    const tRev = campaigns.reduce((s, c) => s + (c.revenue || 0), 0);
    const tRes = campaigns.reduce((s, c) => s + (c.results || 0), 0);
    const tImpr = campaigns.reduce((s, c) => s + (c.impressions || 0), 0);
    const tClicks = campaigns.reduce((s, c) => s + (c.clicks || 0), 0);
    const tReach = campaigns.reduce((s, c) => s + (c.reach || 0), 0);
    const ativas = campaigns.filter((c) => c.status === "ACTIVE").length;
    const roas = tInvest ? tRev / tInvest : 0;
    const ctr = tImpr ? (tClicks / tImpr) * 100 : 0;
    const cpr = tRes ? tInvest / tRes : 0;
    const comResultado = campaigns.filter((c) => c.cost_per_result > 0);
    const melhor = [...comResultado].sort((a, b) => a.cost_per_result - b.cost_per_result)[0];
    const temRoas = campaigns.some((c) => c.roas > 0);

    const resumo = [];
    resumo.push(
      `${isSingle ? `O cliente <strong>${esc(title)}</strong>` : `O portfólio consolidado`} teve ${campaigns.length} campanha(s) ` +
      `no período de ${periodo}, sendo ${ativas} ativa(s). ` +
      `Foram investidos <strong>${money(tInvest, cur)}</strong>, gerando ${num(tImpr)} impressões e ${num(tRes)} resultados.`
    );
    if (temRoas) resumo.push(`A receita atribuída foi de <strong>${money(tRev, cur)}</strong>, um ROAS de <strong>${roas.toFixed(2)}x</strong>.`);
    if (melhor) resumo.push(`A campanha de melhor eficiência foi <strong>${esc(melhor.name)}</strong>, com o menor custo por resultado (${money(melhor.cost_per_result, cur)}).`);

    const kpisHtml = `<div class="kpis">
      ${kpi("Valor Investido", money(tInvest, cur))}
      ${kpi("Resultados", num(tRes))}
      ${kpi("Custo por Resultado", cpr ? money(cpr, cur) : "—")}
      ${temRoas ? kpi("Receita", money(tRev, cur)) : kpi("Alcance", num(tReach))}
      ${kpi("Impressões", num(tImpr))}
      ${kpi("Cliques", num(tClicks))}
      ${kpi("CTR", pct(ctr))}
      ${temRoas ? kpi("ROAS", roas.toFixed(2) + "x") : kpi("Campanhas Ativas", num(ativas))}
    </div>`;

    const linhas = [...campaigns].sort((a, b) => b.spend - a.spend).map((c) => `
      <tr>
        <td><strong>${esc(c.name)}</strong>${!isSingle && c.client ? `<br><span style="color:var(--muted);font-size:10px">${esc(c.client)}</span>` : ""}</td>
        <td>${esc(statusLabel(c.status))}</td>
        <td class="num">${money(c.spend, c._cur || cur)}</td>
        <td class="num">${c.results ? num(c.results) : "—"}</td>
        <td class="num">${c.cost_per_result ? money(c.cost_per_result, c._cur || cur) : "—"}</td>
        <td class="num">${(c.roas || 0).toFixed(2)}x</td>
      </tr>`).join("");
    const tabela = `
      <table>
        <thead><tr><th>Campanha</th><th>Status</th><th class="num">Investido</th>
          <th class="num">Resultados</th><th class="num">Custo/result.</th><th class="num">ROAS</th></tr></thead>
        <tbody>${linhas}
          <tr class="total"><td>TOTAL</td><td>—</td><td class="num">${money(tInvest, cur)}</td>
            <td class="num">${num(tRes)}</td><td class="num">${cpr ? money(cpr, cur) : "—"}</td>
            <td class="num">${roas.toFixed(2)}x</td></tr>
        </tbody>
      </table>`;

    const recs = [];
    if (melhor) recs.push(`<strong>Priorizar ${esc(melhor.name)}:</strong> melhor custo por resultado do período (${money(melhor.cost_per_result, cur)}). Concentre verba aqui.`);
    const semConv = campaigns.filter((c) => c.spend > 0 && c.results === 0);
    if (semConv.length) recs.push(`<strong>Revisar ${semConv.length} campanha(s) sem resultado:</strong> ${semConv.slice(0, 3).map((c) => esc(c.name)).join(", ")}${semConv.length > 3 ? "…" : ""}. Verifique objetivo e pixel.`);
    const ruins = campaigns.filter((c) => c.roas > 0 && c.roas < 1);
    if (ruins.length) recs.push(`<strong>Atenção a ${ruins.length} campanha(s) com ROAS < 1:</strong> estão gastando mais do que retornam.`);

    const body = `
      <h2 class="sec">Resumo executivo</h2>
      ${resumo.map((p) => `<p>${p}</p>`).join("")}
      <h2 class="sec">Visão geral dos indicadores</h2>
      ${kpisHtml}
      <h2 class="sec">Desempenho por campanha</h2>
      ${tabela}
      ${recs.length ? `<h2 class="sec">Recomendações</h2><ul class="recs">${recs.map((r) => `<li>${r}</li>`).join("")}</ul>` : ""}
    `;

    openReport(shell({
      logoUri, kicker: isSingle ? "Relatório de Cliente" : "Relatório Consolidado",
      title, sub: `Performance de campanhas • ${periodo}`,
      body, footName: `Relatório ${title} • Agência Brandcast`,
    }), onError);
  } catch (e) {
    if (onError) onError(e instanceof Error ? e.message : "Falha ao gerar relatório.");
  }
}

// ============================================================================
// 3) RELATÓRIO DE CAMPANHAS FILTRADAS — lista simples no mesmo template.
//    Mantém assinatura { campaigns, clients, datePreset, filters, onError }.
// ============================================================================
export async function generateCampaignsReport({ campaigns = [], datePreset, onError }) {
  try {
    const logoUri = await getBrandLogoDataUri();
    const periodo = fmtPeriodoExtenso(datePreset);
    const cur = campaigns[0]?.currency || "BRL";

    const tInvest = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
    const tRes = campaigns.reduce((s, c) => s + (c.results || 0), 0);
    const tImpr = campaigns.reduce((s, c) => s + (c.impressions || 0), 0);
    const cpr = tRes ? tInvest / tRes : 0;
    const melhor = [...campaigns].filter((c) => c.cost_per_result > 0).sort((a, b) => a.cost_per_result - b.cost_per_result)[0];

    const kpisHtml = `<div class="kpis">
      ${kpi("Campanhas", num(campaigns.length))}
      ${kpi("Investido", money(tInvest, cur))}
      ${kpi("Resultados", num(tRes))}
      ${kpi("Custo/Resultado", cpr ? money(cpr, cur) : "—")}
    </div>`;

    const linhas = [...campaigns].sort((a, b) => b.spend - a.spend).map((c) => `
      <tr>
        <td><strong>${esc(c.name)}</strong></td>
        <td>${esc(statusLabel(c.status))}</td>
        <td class="num">${money(c.spend, c.currency || cur)}</td>
        <td class="num">${c.results ? num(c.results) : "—"}</td>
        <td class="num">${c.cost_per_result ? money(c.cost_per_result, c.currency || cur) : "—"}</td>
        <td class="num">${(c.roas || 0).toFixed(2)}x</td>
      </tr>`).join("");

    const body = `
      <h2 class="sec">Visão geral</h2>
      ${kpisHtml}
      ${melhor ? `<p style="margin-top:10px">Destaque: <strong>${esc(melhor.name)}</strong> com o menor custo por resultado (${money(melhor.cost_per_result, cur)}).</p>` : ""}
      <h2 class="sec">Campanhas no período</h2>
      <table>
        <thead><tr><th>Campanha</th><th>Status</th><th class="num">Investido</th>
          <th class="num">Resultados</th><th class="num">Custo/result.</th><th class="num">ROAS</th></tr></thead>
        <tbody>${linhas}
          <tr class="total"><td>TOTAL</td><td>—</td><td class="num">${money(tInvest, cur)}</td>
            <td class="num">${num(tRes)}</td><td class="num">${cpr ? money(cpr, cur) : "—"}</td><td class="num">—</td></tr>
        </tbody>
      </table>`;

    openReport(shell({
      logoUri, kicker: "Relatório de Campanhas", title: "Campanhas",
      sub: `Performance • ${periodo}`, body, footName: "Relatório de Campanhas • Agência Brandcast",
    }), onError);
  } catch (e) {
    if (onError) onError(e instanceof Error ? e.message : "Falha ao gerar relatório.");
  }
}

// Compat: relatório de gráficos cai no de campanhas.
export async function generateChartsReport(args) {
  return generateCampaignsReport(args);
}

// ============================================================================
// 4) RELATÓRIO VISUAL — espelha a tela de dashboards do cliente.
//    Recebe os gráficos já capturados da tela (como imagens PNG) + KPIs.
// ============================================================================
export async function generateVisualReport({ clientName, datePreset, kpis = [], charts = [], onError }) {
  try {
    const logoUri = await getBrandLogoDataUri();
    const periodo = fmtPeriodoExtenso(datePreset);

    const kpisHtml = kpis.length ? `<div class="kpis">
      ${kpis.map((k) => kpi(k.label, k.value)).join("")}
    </div>` : "";

    // Gráficos como cards escuros (espelham a tela), 1 ou 2 por linha.
    const chartsHtml = charts.length ? `
      <div class="viz-grid">
        ${charts.map((c) => `
          <figure class="viz-card${c.wide ? " wide" : ""}">
            ${c.title ? `<figcaption>${esc(c.title)}</figcaption>` : ""}
            <img src="${c.img}" alt="${esc(c.title || "Gráfico")}" />
          </figure>`).join("")}
      </div>` : `<p class="muted-note">Nenhum gráfico capturado.</p>`;

    const body = `
      <h2 class="sec">Visão geral dos indicadores</h2>
      ${kpisHtml}
      <h2 class="sec">Visualizações</h2>
      <p>Painéis exatamente como exibidos no dashboard do cliente.</p>
      ${chartsHtml}
    `;

    // CSS extra pros cards de gráfico (injetado via <style> adicional no shell).
    const extraCss = `
      .viz-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 6px; }
      .viz-card { background: #16131e; border: 1px solid #2a2440; border-radius: 12px;
        padding: 12px; break-inside: avoid; }
      .viz-card.wide { grid-column: 1 / -1; }
      .viz-card figcaption { color: #c4b5fd; font-size: 12px; font-weight: 700;
        margin-bottom: 8px; padding-left: 2px; }
      .viz-card img { width: 100%; height: auto; display: block; border-radius: 8px; }
    `;
    const html = shell({
      logoUri, kicker: "Relatório Visual", title: clientName || "Dashboard",
      sub: `Painéis de performance • ${periodo}`,
      body, footName: `Relatório Visual ${clientName || ""} • Agência Brandcast`,
    }).replace("</style>", extraCss + "</style>");

    openReport(html, onError);
  } catch (e) {
    if (onError) onError(e instanceof Error ? e.message : "Falha ao gerar relatório visual.");
  }
}

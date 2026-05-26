import { money, num, pct, esc, accountStatusLabel, cpaClass, cpaMedian } from "./format.js";
import { PERIOD_LABELS } from "./constants.js";
import { computeSaldo } from "./saldo.js";
import brandcastLogoUrl from "../assets/brandcastlogo.png";

// ============================================================================
// Template Brandcast — usado por TODOS os relatórios em PDF do projeto.
// Cada generateXReport monta os blocos (status, KPIs, insight, tabela/imagens)
// e injeta no shell compartilhado (cabeçalho, título, rodapé, CSS).
// ============================================================================

// Logo da Agência Brandcast — convertida pra data URI base64 (PNG) usando
// <img> + canvas. Cacheada em memória. Necessário porque o relatório é
// aberto em uma janela com URL `blob:`, onde caminhos relativos como
// `/assets/brandcastlogo.png` não resolvem.
// Carregar via Image (em vez de fetch) é mais robusto e também permite
// redimensionar antes de codificar, deixando o data URI pequeno (~50KB).
let _logoDataUriCache = null;
async function getBrandLogoDataUri() {
  if (_logoDataUriCache) return _logoDataUriCache;
  try {
    const dataUri = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        // Redimensiona pra altura máxima 160px mantendo proporção.
        const targetH = 160;
        const scale = Math.min(1, targetH / img.naturalHeight);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = (e) => reject(e || new Error("img load failed"));
      img.src = brandcastLogoUrl;
    });
    _logoDataUriCache = dataUri;
  } catch (e) {
    console.warn("[report] falha ao carregar logo:", e);
    _logoDataUriCache = brandcastLogoUrl; // fallback (pode não renderizar)
  }
  return _logoDataUriCache;
}
function brandLogoImg(dataUri) {
  return `<img class="rpt-brand-logo" src="${dataUri}" alt="Agência Brandcast" />`;
}

// Período no rodapé (ex.: "30d", "7d", "Hoje").
function shortPeriod(preset) {
  const map = {
    today: "Hoje", yesterday: "Ontem",
    last_7d: "7d", last_14d: "14d", last_30d: "30d",
    last_90d: "90d", this_month: "Mês atual", last_month: "Mês passado",
    maximum: "Máximo",
  };
  return map[preset] || preset;
}

// Subtítulo em itálico abaixo do nome do cliente.
function titleSubtitle(preset) {
  const map = {
    today: "hoje", yesterday: "ontem",
    last_7d: "últimos 7 dias", last_14d: "últimos 14 dias",
    last_30d: "últimos 30 dias", last_90d: "últimos 90 dias",
    this_month: "este mês", last_month: "mês passado",
    maximum: "período máximo",
  };
  return map[preset] || PERIOD_LABELS[preset] || preset;
}

// Pílula de status (ATIVA / PAUSADA / outros).
function statusBadge(status) {
  const s = (status || "").toUpperCase();
  if (s === "ACTIVE") return `<span class="rpt-pill rpt-pill-active">ATIVA</span>`;
  if (s.includes("PAUSED")) return `<span class="rpt-pill rpt-pill-paused">PAUSADA</span>`;
  if (s.includes("DELETED") || s.includes("ARCHIVED"))
    return `<span class="rpt-pill rpt-pill-muted">${esc(s)}</span>`;
  return `<span class="rpt-pill rpt-pill-muted">${esc(s || "—")}</span>`;
}

// Card de KPI: label / valor / subtítulo.
function kpiCard(label, value, sub) {
  return `
    <div class="rpt-kpi">
      <div class="rpt-kpi-label">${esc(label)}</div>
      <div class="rpt-kpi-value">${value}</div>
      <div class="rpt-kpi-sub">${esc(sub)}</div>
    </div>`;
}

// Insight automático estilo do PDF — descreve o cenário em 1–3 frases.
function buildInsight(campaigns) {
  const withSpend = campaigns.filter((c) => c.spend > 0);
  if (!withSpend.length) {
    return "Nenhuma campanha com investimento no período. Verifique se o pixel está disparando e se há orçamento alocado nas contas.";
  }

  const spend = withSpend.reduce((s, c) => s + c.spend, 0);
  const revenue = withSpend.reduce((s, c) => s + c.revenue, 0);
  const conversions = withSpend.reduce((s, c) => s + (c.results || 0), 0);
  const impressions = withSpend.reduce((s, c) => s + c.impressions, 0);
  const clicks = withSpend.reduce((s, c) => s + c.clicks, 0);
  const ctr = impressions ? (clicks / impressions) * 100 : 0;
  const roas = spend ? revenue / spend : 0;

  const novas = campaigns.filter((c) => c.status === "ACTIVE" && c.impressions === 0);
  const partes = [];

  if (conversions === 0) {
    partes.push(
      `Há tráfego e engajamento (${num(impressions)} impressões, ${num(clicks)} cliques, ` +
      `CTR ${ctr.toFixed(2).replace(".", ",")}%), porém <strong>nenhuma conversão foi registrada</strong> ` +
      `no período. Vale revisar pixel/eventos, jornada pós-clique e qualidade da audiência antes de aumentar verba.`
    );
  } else if (roas >= 2) {
    partes.push(
      `ROAS de <strong>${roas.toFixed(2).replace(".", ",")}×</strong> com ${num(conversions)} conversões ` +
      `e CTR de ${ctr.toFixed(2).replace(".", ",")}% — performance consistente. ` +
      `Momento de avaliar escala em criativos vencedores e ampliar públicos similares.`
    );
  } else if (roas >= 1) {
    partes.push(
      `ROAS de <strong>${roas.toFixed(2).replace(".", ",")}×</strong> com ${num(conversions)} conversões — ` +
      `retorno ainda apertado. Otimize criativos e segmentação antes de aumentar o orçamento.`
    );
  } else {
    partes.push(
      `ROAS de <strong>${roas.toFixed(2).replace(".", ",")}×</strong> — receita abaixo do investimento. ` +
      `Pause campanhas com pior desempenho e concentre verba nas que ainda geram retorno positivo.`
    );
  }

  if (novas.length) {
    const nome = novas[0].name;
    partes.push(
      `A campanha <strong>${esc(nome)}</strong>${novas.length > 1 ? ` (e mais ${novas.length - 1})` : ""} ` +
      `está ativa mas ainda não acumulou dados.`
    );
  }

  return partes.join(" ");
}

// Agregados de uma lista de campanhas (KPIs prontos pra renderizar).
function aggregate(campaigns) {
  const tSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const tRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const tConversions = campaigns.reduce((s, c) => s + (c.results || 0), 0);
  const tImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const tClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const tActive = campaigns.filter((c) => c.status === "ACTIVE").length;
  return {
    tSpend, tRevenue, tConversions, tImpressions, tClicks, tActive,
    roas: tSpend ? tRevenue / tSpend : 0,
    ctr: tImpressions ? (tClicks / tImpressions) * 100 : 0,
    cpa: tConversions ? tSpend / tConversions : 0,
  };
}

// Bloco "Resultado Consolidado" + "Engajamento" (8 KPIs, dois grids).
function buildKpisBlocks(agg, currency = "BRL") {
  const kpisResultado = [
    kpiCard("INVESTIDO", money(agg.tSpend, currency), "total no período"),
    kpiCard("RECEITA",
      `<span class="${agg.tRevenue === 0 ? "rpt-neg" : ""}">${money(agg.tRevenue, currency)}</span>`,
      agg.tRevenue === 0 ? "sem receita registrada" : "receita atribuída"),
    kpiCard("ROAS",
      `<span class="${agg.roas < 1 ? "rpt-neg" : ""}">${agg.roas.toFixed(2).replace(".", ",")}<span class="rpt-x">×</span></span>`,
      agg.roas === 0 ? "retorno não apurado" : "retorno sobre investimento"),
    kpiCard("CONVERSÕES", num(agg.tConversions), "no período"),
  ].join("");

  const kpisEngaj = [
    kpiCard("IMPRESSÕES", num(agg.tImpressions), "exibições totais"),
    kpiCard("CLIQUES", num(agg.tClicks), "interações em anúncios"),
    kpiCard("CTR",
      `${agg.ctr.toFixed(2).replace(".", ",")}<span class="rpt-pcent">%</span>`,
      agg.ctr >= 1 ? "taxa de cliques saudável" : "taxa de cliques baixa"),
    kpiCard("CUSTO POR CONVERSÃO",
      agg.cpa ? money(agg.cpa, currency) : `<span class="rpt-neg">—</span>`,
      agg.cpa ? "menor é melhor" : "sem conversões registradas"),
  ].join("");

  return `
    <div class="rpt-section-title">RESULTADO CONSOLIDADO</div>
    <div class="rpt-kpis">${kpisResultado}</div>

    <div class="rpt-section-title">ENGAJAMENTO</div>
    <div class="rpt-kpis">${kpisEngaj}</div>`;
}

// Sidebar de info no topo (CLIENTE / PLATAFORMA / PERÍODO / ...).
function buildInfoSidebar(rows) {
  return rows.map(([k, v]) => `
    <div class="rpt-info-row">
      <span class="rpt-info-key">${esc(k)}</span>
      <span class="rpt-info-val">${esc(v)}</span>
    </div>`).join("");
}

// Bloco de status agregado (sem dado de saldo individual).
function buildAggregateStatus({ activeCount, totalLabel, headlineNumber, headlineLabel }) {
  return `
    <section class="rpt-status">
      <div class="rpt-status-head">
        <div class="rpt-status-info">
          <span class="rpt-conta rpt-conta-on">
            <span class="rpt-dot"></span>${esc(String(activeCount))} ATIVA${activeCount === 1 ? "" : "S"}
          </span>
          <span class="rpt-status-text">${esc(totalLabel)}</span>
        </div>
        <div class="rpt-status-saldo">
          <div class="rpt-saldo-label">${esc(headlineLabel)}</div>
          <div class="rpt-saldo-value">${headlineNumber}</div>
        </div>
      </div>
    </section>`;
}

// Caixa de insight (com ícone "i").
function buildInsightBox(text) {
  return `
    <section class="rpt-insight">
      <div class="rpt-insight-icon">i</div>
      <div class="rpt-insight-text">${text}</div>
    </section>`;
}

// Monta o bloco de dashboards interativos (canvases) + o script Chart.js que
// inicializa cada um. Recebe a lista de campanhas ativas e a moeda.
function buildInteractiveDashboards(camps, currency) {
  // Top 8 campanhas por investimento; resto agrupado em "Outros".
  const sorted = [...camps].sort((a, b) => b.spend - a.spend);
  const top = sorted.slice(0, 8);
  const restSum = sorted.slice(8).reduce((s, c) => s + c.spend, 0);
  // Trunca pra não fazer a legenda ficar enorme e empurrar o donut pra fora.
  const donutLabels = top.map((c) => c.name.length > 26 ? c.name.slice(0, 24) + "…" : c.name);
  const donutData = top.map((c) => c.spend);
  if (restSum > 0) { donutLabels.push("Outros"); donutData.push(restSum); }

  // Funil.
  const tImp = camps.reduce((s, c) => s + (c.impressions || 0), 0);
  const tReach = camps.reduce((s, c) => s + (c.reach || 0), 0);
  const tLink = camps.reduce((s, c) => s + (c.link_clicks || 0), 0);
  const tRes = camps.reduce((s, c) => s + (c.results || 0), 0);

  // ROAS por campanha (top 10 por investimento, mostra o ROAS).
  const roasCamps = sorted.slice(0, 10);
  const roasLabels = roasCamps.map((c) => c.name.length > 30 ? c.name.slice(0, 28) + "…" : c.name);
  const roasValues = roasCamps.map((c) => c.roas || 0);
  const roasColors = roasCamps.map((c) => {
    if (c.roas >= 2) return "#6db278";
    if (c.roas >= 1) return "#c9985a";
    return "#c46a5e";
  });

  // CPA (custo por conversão) — top 10 menores. Menor = mais verde/forte.
  const cpaCamps = camps
    .filter((c) => c.cost_per_result > 0)
    .sort((a, b) => a.cost_per_result - b.cost_per_result)
    .slice(0, 10);
  const cpaLabels = cpaCamps.map((c) => c.name.length > 30 ? c.name.slice(0, 28) + "…" : c.name);
  const cpaValues = cpaCamps.map((c) => c.cost_per_result);
  const cpaMin = cpaValues[0] || 1;
  const cpaColors = cpaValues.map((v) => {
    const ratio = v / cpaMin;
    if (ratio <= 1.2) return "#34d058";       // top — verde forte
    if (ratio <= 1.8) return "#6db278";       // bom — verde médio
    if (ratio <= 3.0) return "#c9985a";       // ok — dourado
    return "#807a6d";                          // ruim — muted
  });

  const data = JSON.stringify({
    currency,
    donut: { labels: donutLabels, data: donutData },
    funnel: { labels: ["Impressões", "Alcance", "Cliques no link", "Conversões"],
              data: [tImp, tReach, tLink, tRes] },
    roas: { labels: roasLabels, data: roasValues, colors: roasColors },
    cpa: { labels: cpaLabels, data: cpaValues, colors: cpaColors },
  });

  const dashboardBlock = `
    <div class="rpt-section-title">DASHBOARDS INTERATIVOS</div>
    <div class="rpt-dash-grid">
      <section class="rpt-dash-card">
        <h3>Distribuição do investimento</h3>
        <p class="rpt-chart-hint">Quanto cada campanha ativa representa do gasto.</p>
        <div class="rpt-canvas-wrap"><canvas id="dashDonut"></canvas></div>
      </section>
      <section class="rpt-dash-card">
        <h3>Funil de eficiência</h3>
        <p class="rpt-chart-hint">Impressões → Alcance → Cliques no link → Conversões.</p>
        <div class="rpt-canvas-wrap"><canvas id="dashFunnel"></canvas></div>
      </section>
      <section class="rpt-dash-card">
        <h3>ROAS por campanha</h3>
        <p class="rpt-chart-hint">Verde ≥ 2 · Dourado ≥ 1 · Vermelho &lt; 1.</p>
        <div class="rpt-canvas-wrap rpt-canvas-tall"><canvas id="dashRoas"></canvas></div>
      </section>
      <section class="rpt-dash-card">
        <h3>Custo por Conversão (menores)</h3>
        <p class="rpt-chart-hint">Top 10 campanhas com menor CPA — verde mais forte = mais barato.</p>
        <div class="rpt-canvas-wrap rpt-canvas-tall"><canvas id="dashCpa"></canvas></div>
      </section>
    </div>`;

  const chartsScript = `
    (function () {
      if (typeof Chart === 'undefined') return;
      var DATA = ${data};
      var TEXT = '#ebe5d6', MUTED = '#807a6d', GRID = '#25252e', GOLD = '#c9985a';
      Chart.defaults.color = TEXT;
      Chart.defaults.font.family = 'Inter, -apple-system, sans-serif';
      Chart.defaults.font.size = 11;

      // Coleta os charts criados pra forçar resize antes de imprimir
      // (o grid muda de 2col → 1col em @media print).
      var _charts = [];
      function track(c) { _charts.push(c); return c; }
      window.addEventListener('beforeprint', function () {
        _charts.forEach(function (c) { try { c.resize(); } catch (e) {} });
      });
      var moneyFmt = function (v) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: DATA.currency }).format(v || 0);
      };
      var numFmt = function (v) { return new Intl.NumberFormat('pt-BR').format(Math.round(v || 0)); };

      // Donut — legenda em baixo pra não estreitar o gráfico.
      track(new Chart(document.getElementById('dashDonut'), {
        type: 'doughnut',
        data: {
          labels: DATA.donut.labels,
          datasets: [{
            data: DATA.donut.data,
            backgroundColor: ['#6d28d9','#8b5cf6','#c9985a','#6db278','#56d4dd','#c46a5e','#a371f7','#d4a574','#807a6d'],
            borderColor: '#15151a', borderWidth: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: TEXT, font: { size: 10 }, boxWidth: 12, padding: 8 },
            },
            tooltip: { callbacks: { label: function (ctx) {
              var total = ctx.dataset.data.reduce(function (s, v) { return s + v; }, 0);
              var p = total ? (ctx.parsed / total * 100).toFixed(1) : 0;
              return ' ' + ctx.label + ': ' + moneyFmt(ctx.parsed) + ' (' + p + '%)';
            } } },
          },
        },
      }));

      // Funil
      track(new Chart(document.getElementById('dashFunnel'), {
        type: 'bar',
        data: {
          labels: DATA.funnel.labels,
          datasets: [{
            data: DATA.funnel.data,
            backgroundColor: ['#6d28d9','#8b5cf6','#c9985a','#6db278'],
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function (ctx) {
              var base = DATA.funnel.data[0] || 1;
              var p = (ctx.parsed.x / base * 100).toFixed(1);
              return ' ' + numFmt(ctx.parsed.x) + ' · ' + p + '% de impressões';
            } } },
          },
          scales: {
            x: { ticks: { color: MUTED, callback: function (v) { return numFmt(v); } },
                 grid: { color: GRID } },
            y: { ticks: { color: TEXT }, grid: { display: false } },
          },
        },
      }));

      // ROAS
      track(new Chart(document.getElementById('dashRoas'), {
        type: 'bar',
        data: {
          labels: DATA.roas.labels,
          datasets: [{
            label: 'ROAS', data: DATA.roas.data,
            backgroundColor: DATA.roas.colors, borderRadius: 4,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function (ctx) {
              return ' ROAS ' + (ctx.parsed.y || 0).toFixed(2) + '×';
            } } },
          },
          scales: {
            x: { ticks: { color: MUTED, autoSkip: false, maxRotation: 45, minRotation: 30 },
                 grid: { color: GRID } },
            y: { ticks: { color: MUTED }, grid: { color: GRID }, beginAtZero: true },
          },
        },
      }));

      // CPA (custo por conversão — menores primeiro)
      var cpaEl = document.getElementById('dashCpa');
      if (cpaEl && DATA.cpa.data.length) {
        track(new Chart(cpaEl, {
          type: 'bar',
          data: {
            labels: DATA.cpa.labels,
            datasets: [{
              label: 'Custo por Conversão', data: DATA.cpa.data,
              backgroundColor: DATA.cpa.colors, borderRadius: 4,
            }],
          },
          options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: function (ctx) {
                return ' ' + moneyFmt(ctx.parsed.x) + ' por conversão';
              } } },
            },
            scales: {
              x: { ticks: { color: MUTED, callback: function (v) { return moneyFmt(v); } },
                   grid: { color: GRID } },
              y: { ticks: { color: TEXT, font: { size: 10 } }, grid: { display: false } },
            },
          },
        }));
      } else if (cpaEl) {
        cpaEl.parentElement.innerHTML = '<div style="color:' + MUTED + ';font-size:11px;padding:20px;text-align:center;">Sem conversões registradas no período.</div>';
      }
    })();
  `;

  return { dashboardBlock, chartsScript };
}

// Renderiza o HTML completo do relatório a partir dos blocos.
function renderShell({
  titleMain, titleSub, periodLabel, generatedAt, sidebarRows,
  statusBlock, kpisBlock, insightBlock, dashboardBlock = "", detailBlock,
  footerRight, chartsScript = "", brandLogoHtml = "",
}) {
  const chartJsTag = chartsScript
    ? `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>`
    : "";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório · ${esc(titleMain)} · ${esc(periodLabel)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Tinos:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  ${chartJsTag}
  <style>${REPORT_CSS}</style>
</head>
<body>
  <div class="rpt-actions">
    <button onclick="window.print()">Imprimir / PDF</button>
  </div>

  <header class="rpt-header">
    <div class="rpt-brand">
      ${brandLogoHtml}
      <div class="rpt-brand-text">
        <span class="rpt-brand-sub">META ADS · PERFORMANCE</span>
      </div>
    </div>
    <div class="rpt-header-meta">
      RELATÓRIO GERADO
      <strong>${esc(generatedAt.replace(",", " ·"))}</strong>
    </div>
  </header>

  <section class="rpt-title-row">
    <div class="rpt-title">
      <h1>${esc(titleMain)}</h1>
      <div class="rpt-title-sub">${esc(titleSub)}</div>
    </div>
    <div class="rpt-info">${sidebarRows}</div>
  </section>

  ${statusBlock}
  ${kpisBlock}
  ${insightBlock}
  ${dashboardBlock}
  ${detailBlock}

  <footer class="rpt-footer">
    <span>Dashboard Meta Ads · Relatório automático</span>
    <span class="rpt-footer-right"><span class="rpt-mark">${footerRight}</span></span>
  </footer>

  ${chartsScript ? `<script>${chartsScript}</script>` : ""}
</body>
</html>`;
}

// Abre o HTML em uma nova aba (com botão "Imprimir/PDF" flutuante).
function openReport(html, onError) {
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

// ============================================================================
// 1) generateReport — relatório por CLIENTE (single ou consolidado).
//    Acionado nos botões da aba Clientes.
// ============================================================================
export async function generateReport({ clients, accountId, datePreset, manualSaldo, onError }) {
  if (!clients.length) {
    if (onError) onError("Carregue os clientes antes de gerar o relatório.");
    return;
  }
  const isSingle = !!accountId;
  const filtered = isSingle
    ? clients.filter((c) => c.account_id === accountId)
    : clients.slice();
  if (!filtered.length) return;

  filtered.sort((a, b) => b.summary.total_spend - a.summary.total_spend);

  const periodLabel = PERIOD_LABELS[datePreset] || datePreset;
  const generatedAt = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const primary = isSingle ? filtered[0] : null;
  const titleMain = isSingle ? primary.name : "Consolidado";
  const titleSub = isSingle
    ? `${titleSubtitle(datePreset)} · apenas ativas`
    : `${filtered.length} clientes · ${titleSubtitle(datePreset)}`;

  // Relatório por cliente: só considera campanhas ATIVAS no momento.
  const allCamps = isSingle
    ? (primary.campaigns || []).filter((c) => c.status === "ACTIVE")
    : filtered.flatMap((c) => c.campaigns || []);
  const agg = aggregate(allCamps);
  const currency = primary ? primary.currency : "BRL";

  const sidebarRows = buildInfoSidebar([
    [isSingle ? "CLIENTE" : "CLIENTES", isSingle ? primary.name : String(filtered.length)],
    ["PLATAFORMA", "Meta Ads"],
    ["PERÍODO", periodLabel],
    ["CAMPANHAS", isSingle
      ? `${allCamps.length} ativa${allCamps.length === 1 ? "" : "s"}`
      : `${allCamps.length}${agg.tActive ? ` (${agg.tActive} ativa${agg.tActive === 1 ? "" : "s"})` : ""}`],
  ]);

  // Bloco de status: single mostra saldo individual; consolidado mostra agregado.
  let statusBlock;
  if (isSingle && primary) {
    const saldo = computeSaldo(primary, manualSaldo, datePreset);
    const accLabel = accountStatusLabel(primary.account_status);
    const isActive = primary.account_status === 1;
    const consumed = saldo.known ? Math.min(saldo.consumedPct, 100) : 0;
    const dias = saldo.known && saldo.daysLeft != null
      ? `estimativa de esgotamento em ~${Math.max(0, Math.floor(saldo.daysLeft))} dia(s)`
      : "ritmo de gasto não estimado";
    const saldoText = saldo.known
      ? `${esc(saldo.source)} · <strong>${pct(saldo.consumedPct).replace(".", ",")}</strong> consumido · ${esc(dias)}`
      : `<span class="rpt-muted">Saldo não cadastrado</span>`;
    const remainingValue = saldo.known ? money(saldo.remaining, currency) : "—";
    const barLevel = saldo.known ? saldo.level : "ok";

    statusBlock = `
      <section class="rpt-status">
        <div class="rpt-status-head">
          <div class="rpt-status-info">
            <span class="rpt-conta ${isActive ? "rpt-conta-on" : "rpt-conta-off"}">
              <span class="rpt-dot"></span>CONTA ${esc(accLabel.toUpperCase())}
            </span>
            <span class="rpt-status-text">${saldoText}</span>
          </div>
          <div class="rpt-status-saldo">
            <div class="rpt-saldo-label">SALDO RESTANTE</div>
            <div class="rpt-saldo-value">${remainingValue}</div>
          </div>
        </div>
        <div class="rpt-bar">
          <div class="rpt-bar-fill rpt-bar-${barLevel}" style="width:${consumed.toFixed(1)}%"></div>
        </div>
        <div class="rpt-bar-axis">
          <span>0%</span>
          <span class="rpt-bar-mid">${saldo.known ? pct(saldo.consumedPct).replace(".", ",") + " · atenção ao saldo" : ""}</span>
          <span>100%</span>
        </div>
      </section>`;
  } else {
    const activeAccounts = filtered.filter((c) => c.account_status === 1).length;
    statusBlock = buildAggregateStatus({
      activeCount: activeAccounts,
      totalLabel: `conta${activeAccounts === 1 ? "" : "s"} ativa${activeAccounts === 1 ? "" : "s"} de ${filtered.length} no relatório · ${agg.tActive} campanha${agg.tActive === 1 ? "" : "s"} em veiculação`,
      headlineLabel: "INVESTIMENTO",
      headlineNumber: money(agg.tSpend),
    });
  }

  // Tabela detalhe: single = campanhas ativas, consolidado = clientes.
  let detailBlock;
  if (isSingle) {
    const camps = [...allCamps].sort((a, b) => b.spend - a.spend);
    const cpaRef = cpaMedian(camps, "cost_per_result");
    const rows = camps.length ? camps.map((c) => {
      const orc = c.budget
        ? `${money(c.budget, currency)}${c.budget_type === "Diário" ? '<div class="rpt-cell-sub">/dia</div>' : ""}`
        : "—";
      const cpaCls = cpaClass(c.cost_per_result, cpaRef);
      const cpaCell = c.cost_per_result
        ? `<span class="${cpaCls ? "rpt-" + cpaCls : ""}">${money(c.cost_per_result, currency)}</span>`
        : "—";
      return `
        <tr>
          <td class="rpt-col-left">
            <div class="rpt-camp-name">${esc(c.name)}</div>
            ${c.objective ? `<div class="rpt-cell-sub">${esc(c.objective)}</div>` : ""}
          </td>
          <td class="rpt-col-center">${statusBadge(c.status)}</td>
          <td>${orc}</td>
          <td>${money(c.spend, currency)}</td>
          <td>${num(c.impressions)}</td>
          <td>${num(c.clicks)}</td>
          <td>${c.ctr.toFixed(2).replace(".", ",")}%</td>
          <td>${num(c.results)}</td>
          <td>${money(c.revenue, currency)}</td>
          <td>${cpaCell}</td>
        </tr>`;
    }).join("") : `<tr><td colspan="10" class="rpt-empty">Nenhuma campanha ativa no período.</td></tr>`;

    detailBlock = `
      <div class="rpt-section-title">DETALHAMENTO POR CAMPANHA</div>
      <div class="rpt-table-wrap">
        <table class="rpt-table">
          <thead><tr>
            <th class="rpt-col-left">CAMPANHA</th><th class="rpt-col-center">STATUS</th>
            <th>ORÇAMENTO</th><th>INVESTIDO</th><th>IMPR.</th>
            <th>CLIQUES</th><th>CTR</th><th>CONVERSÕES</th>
            <th>RECEITA</th><th>CUSTO/CONV.</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } else {
    const rows = filtered.map((cl) => {
      const s = cl.summary;
      const isOn = cl.account_status === 1;
      return `
        <tr>
          <td class="rpt-col-left">
            <div class="rpt-camp-name">${esc(cl.name)}</div>
            <div class="rpt-cell-sub">${esc(accountStatusLabel(cl.account_status))}</div>
          </td>
          <td class="rpt-col-center">
            <span class="rpt-pill ${isOn ? "rpt-pill-active" : "rpt-pill-muted"}">
              ${isOn ? "ATIVA" : "INATIVA"}
            </span>
          </td>
          <td>${num(s.total_campaigns)} <span class="rpt-cell-sub-inline">(${num(s.active_campaigns)})</span></td>
          <td>${money(s.total_spend, cl.currency)}</td>
          <td>${num(s.total_impressions)}</td>
          <td>${num(s.total_clicks)}</td>
          <td>${s.avg_ctr.toFixed(2).replace(".", ",")}%</td>
          <td>${num((cl.campaigns || []).reduce((sum, c) => sum + (c.results || 0), 0))}</td>
          <td>${money(s.total_revenue, cl.currency)}</td>
          <td>${s.roas.toFixed(2).replace(".", ",")}×</td>
        </tr>`;
    }).join("");

    detailBlock = `
      <div class="rpt-section-title">DETALHAMENTO POR CLIENTE</div>
      <div class="rpt-table-wrap">
        <table class="rpt-table">
          <thead><tr>
            <th class="rpt-col-left">CLIENTE</th><th class="rpt-col-center">STATUS</th>
            <th>CAMPANHAS</th><th>INVESTIDO</th><th>IMPR.</th>
            <th>CLIQUES</th><th>CTR</th><th>CONVERSÕES</th>
            <th>RECEITA</th><th>ROAS</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  const insightText = buildInsight(allCamps);
  const footerRight = isSingle
    ? `Brandcast · ${esc(primary.name)} · ${esc(shortPeriod(datePreset))}`
    : `Brandcast · Consolidado · ${esc(shortPeriod(datePreset))}`;

  // Dashboards interativos só aparecem no relatório single (por cliente).
  const dash = isSingle && allCamps.length
    ? buildInteractiveDashboards(allCamps, currency)
    : { dashboardBlock: "", chartsScript: "" };

  const brandLogoHtml = brandLogoImg(await getBrandLogoDataUri());

  const html = renderShell({
    titleMain, titleSub, periodLabel, generatedAt,
    sidebarRows, statusBlock,
    kpisBlock: buildKpisBlocks(agg, currency),
    insightBlock: buildInsightBox(insightText),
    dashboardBlock: dash.dashboardBlock,
    detailBlock, footerRight,
    chartsScript: dash.chartsScript,
    brandLogoHtml,
  });

  openReport(html, onError);
}

// ============================================================================
// 2) generateCampaignsReport — relatório de uma lista filtrada de campanhas.
//    Acionado na aba Campanhas (respeita filtros aplicados).
// ============================================================================
export async function generateCampaignsReport({ campaigns, clients, datePreset, filters, onError }) {
  if (!campaigns.length) {
    if (onError) onError("Nenhuma campanha para gerar relatório com os filtros atuais.");
    return;
  }

  const periodLabel = PERIOD_LABELS[datePreset] || datePreset;
  const generatedAt = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const camps = [...campaigns].sort((a, b) => b.spend - a.spend);
  const agg = aggregate(camps);

  // Clientes únicos no filtrado.
  const uniqueClients = [...new Set(camps.map((c) => c.client))];
  const isSingleClient = uniqueClients.length === 1;
  const headerClient = isSingleClient ? uniqueClients[0] : `${uniqueClients.length} clientes`;

  // Moeda mais comum (geralmente todas iguais).
  const currency = camps[0]?.currency || "BRL";

  // Filtros aplicados (pra mostrar no subtítulo).
  const filterBits = [];
  if (filters?.statusFilter && filters.statusFilter !== "ALL") {
    filterBits.push(filters.statusFilter === "ACTIVE" ? "apenas ativas" : "apenas pausadas");
  }
  if (filters?.clientFilter && filters.clientFilter !== "ALL") {
    filterBits.push(`cliente: ${filters.clientFilter}`);
  }
  if (filters?.search) {
    filterBits.push(`busca: "${filters.search}"`);
  }
  const filterLabel = filterBits.length ? ` · ${filterBits.join(" · ")}` : "";

  const titleMain = "Campanhas";
  const titleSub = `${titleSubtitle(datePreset)}${filterLabel}`;

  const sidebarRows = buildInfoSidebar([
    ["CLIENTES", headerClient],
    ["PLATAFORMA", "Meta Ads"],
    ["PERÍODO", periodLabel],
    ["CAMPANHAS", `${camps.length}${agg.tActive ? ` (${agg.tActive} ativa${agg.tActive === 1 ? "" : "s"})` : ""}`],
  ]);

  const statusBlock = buildAggregateStatus({
    activeCount: agg.tActive,
    totalLabel: `campanha${agg.tActive === 1 ? "" : "s"} em veiculação de ${camps.length} no filtro · ` +
                `${uniqueClients.length} cliente${uniqueClients.length === 1 ? "" : "s"} representado${uniqueClients.length === 1 ? "" : "s"}`,
    headlineLabel: "INVESTIMENTO",
    headlineNumber: money(agg.tSpend, currency),
  });

  // Tabela: lista de campanhas (com coluna Cliente quando há mais de 1).
  const showClientCol = !isSingleClient;
  const headRow = showClientCol
    ? `<tr>
         <th class="rpt-col-left">CAMPANHA</th><th class="rpt-col-left">CLIENTE</th>
         <th class="rpt-col-center">STATUS</th><th>INVESTIDO</th><th>IMPR.</th>
         <th>CLIQUES</th><th>CTR</th><th>CONVERSÕES</th><th>CUSTO/CONV.</th><th>ROAS</th>
       </tr>`
    : `<tr>
         <th class="rpt-col-left">CAMPANHA</th><th class="rpt-col-center">STATUS</th>
         <th>ORÇAMENTO</th><th>INVESTIDO</th><th>IMPR.</th>
         <th>CLIQUES</th><th>CTR</th><th>CONVERSÕES</th><th>CUSTO/CONV.</th><th>ROAS</th>
       </tr>`;

  const campCpaRef = cpaMedian(camps, "cost_per_result");
  const rows = camps.map((c) => {
    const orc = c.budget
      ? `${money(c.budget, c.currency)}${c.budget_type === "Diário" ? '<div class="rpt-cell-sub">/dia</div>' : ""}`
      : "—";
    const cpaCls = cpaClass(c.cost_per_result, campCpaRef);
    const cpaCell = c.cost_per_result
      ? `<span class="${cpaCls ? "rpt-" + cpaCls : ""}">${money(c.cost_per_result, c.currency)}</span>`
      : "—";
    if (showClientCol) {
      return `
        <tr>
          <td class="rpt-col-left">
            <div class="rpt-camp-name">${esc(c.name)}</div>
            ${c.objective ? `<div class="rpt-cell-sub">${esc(c.objective)}</div>` : ""}
          </td>
          <td class="rpt-col-left">${esc(c.client)}</td>
          <td class="rpt-col-center">${statusBadge(c.status)}</td>
          <td>${money(c.spend, c.currency)}</td>
          <td>${num(c.impressions)}</td>
          <td>${num(c.clicks)}</td>
          <td>${c.ctr.toFixed(2).replace(".", ",")}%</td>
          <td>${num(c.results)}</td>
          <td>${cpaCell}</td>
          <td>${c.roas.toFixed(2).replace(".", ",")}×</td>
        </tr>`;
    }
    return `
      <tr>
        <td class="rpt-col-left">
          <div class="rpt-camp-name">${esc(c.name)}</div>
          ${c.objective ? `<div class="rpt-cell-sub">${esc(c.objective)}</div>` : ""}
        </td>
        <td class="rpt-col-center">${statusBadge(c.status)}</td>
        <td>${orc}</td>
        <td>${money(c.spend, c.currency)}</td>
        <td>${num(c.impressions)}</td>
        <td>${num(c.clicks)}</td>
        <td>${c.ctr.toFixed(2).replace(".", ",")}%</td>
        <td>${num(c.results)}</td>
        <td>${cpaCell}</td>
        <td>${c.roas.toFixed(2).replace(".", ",")}×</td>
      </tr>`;
  }).join("");

  const detailBlock = `
    <div class="rpt-section-title">DETALHAMENTO POR CAMPANHA</div>
    <div class="rpt-table-wrap">
      <table class="rpt-table">
        <thead>${headRow}</thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  const brandLogoHtml = brandLogoImg(await getBrandLogoDataUri());

  const html = renderShell({
    titleMain, titleSub, periodLabel, generatedAt,
    sidebarRows, statusBlock,
    kpisBlock: buildKpisBlocks(agg, currency),
    insightBlock: buildInsightBox(buildInsight(camps)),
    detailBlock,
    footerRight: `Brandcast · Campanhas · ${esc(shortPeriod(datePreset))}`,
    brandLogoHtml,
  });

  openReport(html, onError);
}

// ============================================================================
// 3) generateChartsReport — relatório com os gráficos da aba Gráficos
//    embutidos como imagens PNG (capturadas dos <canvas> do Chart.js).
// ============================================================================
export async function generateChartsReport({ charts, clients, campaigns, datePreset, onError }) {
  if (!charts || !charts.length) {
    if (onError) onError("Nenhum gráfico disponível pra incluir no relatório.");
    return;
  }
  if (!campaigns.length) {
    if (onError) onError("Carregue os clientes antes de gerar o relatório.");
    return;
  }

  const periodLabel = PERIOD_LABELS[datePreset] || datePreset;
  const generatedAt = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const agg = aggregate(campaigns);
  const activeAccounts = clients.filter((c) => c.account_status === 1).length;

  const titleMain = "Gráficos";
  const titleSub = `${clients.length} clientes · ${titleSubtitle(datePreset)}`;

  const sidebarRows = buildInfoSidebar([
    ["CLIENTES", String(clients.length)],
    ["PLATAFORMA", "Meta Ads"],
    ["PERÍODO", periodLabel],
    ["GRÁFICOS", String(charts.length)],
  ]);

  const statusBlock = buildAggregateStatus({
    activeCount: activeAccounts,
    totalLabel: `conta${activeAccounts === 1 ? "" : "s"} ativa${activeAccounts === 1 ? "" : "s"} · ` +
                `${agg.tActive} campanha${agg.tActive === 1 ? "" : "s"} em veiculação`,
    headlineLabel: "INVESTIMENTO",
    headlineNumber: money(agg.tSpend),
  });

  const chartsHtml = charts.map((ch) => `
    <section class="rpt-chart-card">
      ${ch.title ? `<h3>${esc(ch.title)}</h3>` : ""}
      ${ch.hint ? `<p class="rpt-chart-hint">${esc(ch.hint)}</p>` : ""}
      <img src="${ch.dataUrl}" alt="${esc(ch.title || "Gráfico")}" />
    </section>`).join("");

  const detailBlock = `
    <div class="rpt-section-title">VISUALIZAÇÕES</div>
    <div class="rpt-charts-grid">${chartsHtml}</div>`;

  const brandLogoHtml = brandLogoImg(await getBrandLogoDataUri());

  const html = renderShell({
    titleMain, titleSub, periodLabel, generatedAt,
    sidebarRows, statusBlock,
    kpisBlock: buildKpisBlocks(agg, "BRL"),
    insightBlock: buildInsightBox(buildInsight(campaigns)),
    detailBlock,
    footerRight: `Brandcast · Gráficos · ${esc(shortPeriod(datePreset))}`,
    brandLogoHtml,
  });

  openReport(html, onError);
}

// ============================================================================
// CSS compartilhado — único ponto de verdade para o design do template.
// ============================================================================
const REPORT_CSS = `
  :root {
    --bg: #0a0a0c;
    --card: #15151a;
    --card-2: #1c1c22;
    --border: #25252e;
    --border-soft: #1f1f26;
    --text: #ebe5d6;
    --muted: #807a6d;
    --gold: #c9985a;
    --gold-soft: rgba(201, 152, 90, 0.18);
    --green: #6db278;
    --green-soft: rgba(109, 178, 120, 0.14);
    --red: #c46a5e;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: var(--bg);
    color: var(--text);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: "Inter", -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 12px;
    line-height: 1.5;
    padding: 36px 44px 48px;
  }

  /* Header strip */
  .rpt-header {
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: 18px; border-bottom: 1px solid var(--border);
  }
  .rpt-brand { display: flex; align-items: center; gap: 12px; }
  .rpt-brand-logo {
    height: 48px; width: auto; display: block; flex-shrink: 0;
  }
  .rpt-brand-text { display: flex; flex-direction: column; gap: 2px; }
  .rpt-brand-name { font-family: "Tinos", serif; font-size: 16px; font-weight: 700; color: var(--text); }
  .rpt-brand-sub {
    font-family: "IBM Plex Mono", monospace;
    font-size: 9.5px; font-weight: 500; color: var(--muted); letter-spacing: 1.5px;
  }
  .rpt-header-meta {
    text-align: right; font-family: "IBM Plex Mono", monospace;
    font-size: 10px; color: var(--muted); letter-spacing: 1px;
  }
  .rpt-header-meta strong {
    display: block; color: var(--text); font-weight: 500;
    margin-top: 2px; letter-spacing: 0.5px;
  }

  /* Título + sidebar */
  .rpt-title-row {
    display: grid; grid-template-columns: 1fr 280px; gap: 28px;
    align-items: start; margin-top: 32px; margin-bottom: 24px;
  }
  .rpt-title h1 {
    font-family: "Tinos", serif; font-size: 44px; font-weight: 400;
    line-height: 1.1; color: var(--text);
  }
  .rpt-title .rpt-title-sub {
    font-family: "Tinos", serif; font-style: italic;
    font-size: 26px; color: var(--gold); margin-top: 4px;
  }
  .rpt-info { display: flex; flex-direction: column; gap: 2px; }
  .rpt-info-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 0; border-bottom: 1px solid var(--border);
    font-family: "IBM Plex Mono", monospace; font-size: 10px;
  }
  .rpt-info-key { color: var(--muted); letter-spacing: 1px; }
  .rpt-info-val { color: var(--text); font-weight: 500; text-align: right; }

  /* Status */
  .rpt-status {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 10px; padding: 18px 22px; margin-bottom: 30px;
  }
  .rpt-status-head { display: flex; justify-content: space-between; align-items: center; gap: 22px; }
  .rpt-status-info { display: flex; align-items: center; gap: 16px; flex: 1; flex-wrap: wrap; }
  .rpt-conta {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 5px 12px; border-radius: 999px;
    font-size: 9.5px; font-weight: 600; letter-spacing: 1.2px;
    border: 1px solid var(--border); font-family: "IBM Plex Mono", monospace;
  }
  .rpt-conta-on { color: var(--green); }
  .rpt-conta-off { color: var(--muted); }
  .rpt-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .rpt-status-text { font-size: 12px; color: var(--text); line-height: 1.4; }
  .rpt-status-text strong { color: var(--gold); font-weight: 600; }
  .rpt-status-saldo { text-align: right; min-width: 140px; }
  .rpt-saldo-label {
    font-family: "IBM Plex Mono", monospace; font-size: 9.5px;
    color: var(--muted); letter-spacing: 1.2px; margin-bottom: 4px;
  }
  .rpt-saldo-value {
    font-family: "Tinos", serif; font-size: 26px; font-weight: 700;
    color: var(--gold); line-height: 1;
  }

  .rpt-bar {
    margin-top: 16px; height: 5px; background: var(--card-2);
    border-radius: 999px; overflow: hidden; position: relative;
  }
  .rpt-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #b27945, #d8a878); }
  .rpt-bar-warn { background: linear-gradient(90deg, #b27945, #d4a574); }
  .rpt-bar-critical { background: linear-gradient(90deg, #a04a3d, #c46a5e); }
  .rpt-bar-ok { background: linear-gradient(90deg, #4a7d52, #6db278); }
  .rpt-bar-axis {
    display: flex; justify-content: space-between; margin-top: 5px;
    font-family: "IBM Plex Mono", monospace; font-size: 9px;
    color: var(--muted); letter-spacing: 0.5px;
  }
  .rpt-bar-mid { color: var(--gold); }

  /* Section heading */
  .rpt-section-title {
    display: flex; align-items: center; gap: 10px;
    font-family: "IBM Plex Mono", monospace; font-size: 10px;
    color: var(--muted); letter-spacing: 2px;
    margin-top: 22px; margin-bottom: 12px;
  }
  .rpt-section-title::before {
    content: ""; width: 18px; height: 2px; background: var(--gold); border-radius: 2px;
  }

  /* KPIs */
  .rpt-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .rpt-kpi {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 8px; padding: 16px 18px; min-height: 96px;
    display: flex; flex-direction: column; justify-content: flex-start; gap: 8px;
  }
  .rpt-kpi-label {
    font-family: "IBM Plex Mono", monospace; font-size: 9.5px;
    color: var(--muted); letter-spacing: 1.5px;
  }
  .rpt-kpi-value {
    font-family: "Tinos", serif; font-size: 30px; font-weight: 400;
    color: var(--text); line-height: 1;
  }
  .rpt-kpi-value .rpt-x,
  .rpt-kpi-value .rpt-pcent { font-size: 16px; color: var(--muted); margin-left: 1px; }
  .rpt-kpi-value .rpt-neg { color: var(--muted); }
  .rpt-kpi-sub {
    font-family: "IBM Plex Mono", monospace; font-size: 9.5px;
    color: var(--gold); letter-spacing: 0.3px; margin-top: auto;
  }

  /* Insight box */
  .rpt-insight {
    display: grid; grid-template-columns: 36px 1fr; gap: 14px;
    background: var(--card); border: 1px solid var(--border);
    border-left: 3px solid var(--gold);
    border-radius: 8px; padding: 16px 20px; margin: 22px 0 26px;
    align-items: start;
  }
  .rpt-insight-icon {
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--gold-soft); color: var(--gold);
    display: flex; align-items: center; justify-content: center;
    font-family: "Tinos", serif; font-style: italic;
    font-size: 15px; font-weight: 700;
  }
  .rpt-insight-text { font-size: 12px; line-height: 1.55; color: var(--text); }
  .rpt-insight-text strong { color: var(--gold); font-weight: 600; }

  /* Tabela */
  .rpt-table-wrap {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 8px; overflow: hidden;
  }
  .rpt-table { width: 100%; border-collapse: collapse; }
  .rpt-table th {
    background: transparent; color: var(--muted);
    font-family: "IBM Plex Mono", monospace;
    font-size: 9px; font-weight: 500; letter-spacing: 1.2px;
    text-align: right; padding: 12px 10px; border-bottom: 1px solid var(--border);
  }
  .rpt-table th.rpt-col-left { text-align: left; }
  .rpt-table th.rpt-col-center { text-align: center; }
  .rpt-table td {
    padding: 14px 10px;
    font-family: "IBM Plex Mono", monospace;
    font-size: 10.5px; color: var(--text); text-align: right;
    border-bottom: 1px solid var(--border-soft); vertical-align: middle;
  }
  .rpt-table tr:last-child td { border-bottom: none; }
  .rpt-table td.rpt-col-left { text-align: left; font-family: "Inter", sans-serif; font-size: 11.5px; }
  .rpt-table td.rpt-col-center { text-align: center; }
  .rpt-camp-name { color: var(--text); font-weight: 500; }
  .rpt-cell-sub {
    font-family: "IBM Plex Mono", monospace; font-size: 9px;
    color: var(--muted); letter-spacing: 0.5px; margin-top: 3px;
  }
  .rpt-cell-sub-inline { font-size: 9px; color: var(--muted); }
  .rpt-empty {
    text-align: center !important; color: var(--muted) !important;
    padding: 22px !important; font-style: italic;
  }

  /* Destaque de CPA baixo (quanto menor, mais forte). */
  .rpt-cpa-good {
    color: #8edca0; font-weight: 700;
  }
  .rpt-cpa-best {
    color: #34d058; font-weight: 700;
    background: rgba(63, 185, 80, 0.18);
    border-radius: 5px;
    padding: 2px 8px;
    display: inline-block;
  }
  .rpt-cpa-elite {
    color: #1a0d04; font-weight: 800;
    background: linear-gradient(135deg, #6dffa3 0%, #3fb950 100%);
    border-radius: 5px;
    padding: 3px 10px;
    display: inline-block;
    box-shadow: 0 0 12px rgba(63, 185, 80, 0.45);
    letter-spacing: 0.3px;
  }

  /* Pílulas de status */
  .rpt-pill {
    display: inline-block; padding: 4px 11px; border-radius: 999px;
    font-family: "IBM Plex Mono", monospace; font-size: 9px;
    font-weight: 600; letter-spacing: 1px; border: 1px solid var(--border);
  }
  .rpt-pill-active { color: var(--green); background: var(--green-soft); border-color: rgba(109, 178, 120, 0.35); }
  .rpt-pill-paused { color: var(--gold); background: var(--gold-soft); border-color: rgba(201, 152, 90, 0.35); }
  .rpt-pill-muted { color: var(--muted); background: transparent; }

  /* Grid de gráficos (imagens — generateChartsReport) */
  .rpt-charts-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;
  }
  .rpt-chart-card {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 8px; padding: 16px;
  }
  .rpt-chart-card.wide { grid-column: 1 / -1; }
  .rpt-chart-card h3 {
    font-family: "Inter", sans-serif; font-size: 12px; font-weight: 600;
    color: var(--text); margin-bottom: 4px;
  }
  .rpt-chart-card .rpt-chart-hint {
    font-family: "IBM Plex Mono", monospace; font-size: 9.5px;
    color: var(--muted); letter-spacing: 0.5px; margin-bottom: 12px;
  }
  .rpt-chart-card img {
    width: 100%; height: auto; display: block;
    background: var(--card-2); border-radius: 6px;
  }

  /* Dashboards interativos (canvases — relatório single client) */
  .rpt-dash-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;
    margin-bottom: 22px;
  }
  .rpt-dash-card {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 8px; padding: 16px 18px;
  }
  .rpt-dash-card.wide { grid-column: 1 / -1; }
  .rpt-dash-card h3 {
    font-family: "Inter", sans-serif; font-size: 12px; font-weight: 600;
    color: var(--text); margin-bottom: 4px;
  }
  .rpt-dash-card .rpt-chart-hint {
    font-family: "IBM Plex Mono", monospace; font-size: 9.5px;
    color: var(--muted); letter-spacing: 0.5px; margin-bottom: 12px;
  }
  .rpt-canvas-wrap {
    position: relative; height: 240px; width: 100%;
  }
  .rpt-canvas-tall { height: 320px; }

  /* Footer */
  .rpt-footer {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 32px; padding-top: 18px; border-top: 1px solid var(--border);
    font-family: "IBM Plex Mono", monospace; font-size: 10px;
    color: var(--muted); letter-spacing: 0.3px;
  }
  .rpt-footer-right { font-style: italic; color: var(--text); }
  .rpt-footer-right .rpt-mark { font-family: "Tinos", serif; font-weight: 700; font-style: italic; }

  /* Actions (não imprime) */
  .rpt-actions { position: fixed; top: 18px; right: 22px; display: flex; gap: 8px; z-index: 999; }
  .rpt-actions button {
    background: var(--gold); color: #1a0d04; border: none;
    padding: 10px 16px; border-radius: 999px;
    font-family: "Inter", sans-serif; font-weight: 600; font-size: 12px;
    cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  .rpt-actions button:hover { filter: brightness(1.1); }

  /* Print */
  @media print {
    body { padding: 12mm 10mm; }
    .rpt-actions { display: none; }
    .rpt-status, .rpt-kpis, .rpt-insight, .rpt-table-wrap, .rpt-chart-card,
    .rpt-dash-card { page-break-inside: avoid; }
    /* Gráficos: 1 coluna pra caber no A4 portrait sem corte. */
    .rpt-dash-grid { grid-template-columns: 1fr !important; gap: 10px; }
    .rpt-dash-card.wide,
    .rpt-dash-card { grid-column: 1 / -1 !important; }
    .rpt-canvas-wrap { height: 200px !important; }
    .rpt-canvas-tall { height: 240px !important; }
    /* KPIs: continua 4 colunas mas mais apertado. */
    .rpt-kpi { padding: 12px 14px; min-height: 80px; }
    .rpt-kpi-value { font-size: 24px; }
    /* Tabela ocupa toda a largura sem overflow. */
    .rpt-table { table-layout: auto; font-size: 9.5px; }
    .rpt-table th, .rpt-table td { padding: 8px 6px; }
  }
  @page { size: A4 portrait; margin: 0; }
`;

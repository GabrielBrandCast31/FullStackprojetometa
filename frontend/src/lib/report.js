import { fmtMoney as money, fmtNum as num } from "./api/client";
import brandcastLogoUrl from "../assets/brandcastlogo.png";

// ============================================================================
// Gerador de relatórios PDF — estilo "Relatório Semanal de Mídia Paga".
// Layout multi-seção com gráficos (Chart.js via CDN), faixa de cabeçalho/rodapé
// em todas as páginas impressas, e marca Agência Brandcast (logo + roxo).
// ============================================================================

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmtPeriodoExtenso(datePreset) {
  const days = { last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 }[datePreset] || 30;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const fim = new Date(); fim.setDate(fim.getDate() - 1);
  const ini = new Date(fim); ini.setDate(ini.getDate() - (days - 1));
  const f = (d) => `${String(d.getDate()).padStart(2, "0")} de ${meses[d.getMonth()]}`;
  return `${f(ini)} a ${f(fim)} de ${fim.getFullYear()}`;
}

// Logo PNG → dataURI (canvas), cacheado. Necessário pq o relatório abre em blob:.
let _logoCache = null;
async function getLogo() {
  if (_logoCache) return _logoCache;
  try {
    _logoCache = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const h = 120, scale = Math.min(1, h / img.naturalHeight);
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        try { resolve(c.toDataURL("image/png")); } catch (e) { reject(e); }
      };
      img.onerror = reject;
      img.src = brandcastLogoUrl;
    });
  } catch { _logoCache = brandcastLogoUrl; }
  return _logoCache;
}

// Detecta etapa do funil pelo prefixo do nome (TOPO / MEIO / FUNDO).
function funilStage(name) {
  const n = (name || "").toUpperCase();
  if (n.startsWith("TOPO") || n.includes("TOPO")) return "Topo";
  if (n.startsWith("MEIO") || n.includes("MEIO")) return "Meio";
  if (n.startsWith("FUNDO") || n.includes("FUNDO")) return "Fundo";
  return "Outros";
}
// Agrupa por prefixo (1ª palavra) pra detectar "séries" (ex.: APAGÃO 1..5).
function serieKey(name) {
  const m = (name || "").trim().match(/^([A-Za-zÀ-ÿ]+)/);
  return m ? m[1].toUpperCase() : "";
}

function statusLabel(s) {
  if (s === "ACTIVE") return "Ativo";
  if ((s || "").includes("PAUSED")) return "Inativo";
  if (!s || s === "—" || s === "UNKNOWN") return "Inativo";
  return "Inativo";
}
const isActive = (s) => s === "ACTIVE";

// ============================================================================
// Gerador principal. rows = lista de conjuntos OU campanhas, com a forma:
//   { name, status, spend, impressions, reach, cpm, frequency, clicks,
//     results, cost_per_result, results_label }
// ============================================================================
async function generateWeekly({ title, level, rows, datePreset, currency, onError }) {
  try {
    const logo = await getLogo();
    const cur = currency || "BRL";
    const periodo = fmtPeriodoExtenso(datePreset);
    const unidade = level === "conjunto" ? "conjuntos de anúncios" : "campanhas";

    // ---- Totais ----
    const tSpend = rows.reduce((s, r) => s + (r.spend || 0), 0);
    const tImpr = rows.reduce((s, r) => s + (r.impressions || 0), 0);
    const tReach = rows.reduce((s, r) => s + (r.reach || 0), 0);
    const tRes = rows.reduce((s, r) => s + (r.results || 0), 0);
    const ativos = rows.filter((r) => isActive(r.status));
    const spendAtivos = ativos.reduce((s, r) => s + (r.spend || 0), 0);
    const cpmMedio = tImpr ? (tSpend / tImpr) * 1000 : 0;
    const freqMedia = tReach ? tImpr / tReach : 0;
    const comResultado = rows.filter((r) => r.results > 0);
    const resLabel = comResultado[0]?.results_label || "Resultados";

    // CPM por linha (recalcula se ausente).
    const withCpm = rows.map((r) => ({
      ...r, _cpm: r.cpm || (r.impressions ? (r.spend / r.impressions) * 1000 : 0),
    }));

    // Funil (por prefixo de nome).
    const funil = { Topo: 0, Meio: 0, Fundo: 0, Outros: 0 };
    rows.forEach((r) => { funil[funilStage(r.name)] += r.spend || 0; });
    const temFunil = (funil.Topo + funil.Meio + funil.Fundo) > 0;

    // Série dominante (grupo com mais membros e ≥3).
    const grupos = {};
    rows.forEach((r) => { const k = serieKey(r.name); if (k) (grupos[k] ||= []).push(r); });
    const serieNome = Object.keys(grupos).sort((a, b) => grupos[b].length - grupos[a].length)[0];
    const serie = serieNome && grupos[serieNome].length >= 3 ? grupos[serieNome] : null;

    // Melhor / pior por custo por resultado.
    const rank = [...comResultado].sort((a, b) => a.cost_per_result - b.cost_per_result);
    const melhor = rank[0], pior = rank.length > 1 ? rank[rank.length - 1] : null;

    // ---- Dados pros gráficos (JSON serializado) ----
    const sortBySpend = [...withCpm].sort((a, b) => b.spend - a.spend);
    const chartData = JSON.stringify({
      cur,
      invest: {
        labels: sortBySpend.map((r) => r.name),
        values: sortBySpend.map((r) => +(r.spend || 0).toFixed(2)),
        active: sortBySpend.map((r) => isActive(r.status)),
      },
      funil: temFunil ? {
        labels: ["Topo", "Meio", "Fundo"].filter((k) => funil[k] > 0),
        values: ["Topo", "Meio", "Fundo"].filter((k) => funil[k] > 0).map((k) => +funil[k].toFixed(2)),
      } : null,
      ativos: { ativo: +spendAtivos.toFixed(2), inativo: +(tSpend - spendAtivos).toFixed(2), n: ativos.length, total: rows.length },
      imprReach: {
        labels: sortBySpend.map((r) => r.name),
        impr: sortBySpend.map((r) => r.impressions || 0),
        reach: sortBySpend.map((r) => r.reach || 0),
      },
      cpm: (() => {
        const s = [...withCpm].filter((r) => r._cpm > 0).sort((a, b) => a._cpm - b._cpm);
        return { labels: s.map((r) => r.name), values: s.map((r) => +r._cpm.toFixed(2)), media: +cpmMedio.toFixed(2) };
      })(),
      resultados: comResultado.length ? {
        labels: comResultado.map((r) => r.name),
        res: comResultado.map((r) => r.results),
        cpr: comResultado.map((r) => +(r.cost_per_result || 0).toFixed(2)),
      } : null,
      serie: serie ? {
        nome: serieNome,
        labels: serie.map((r) => r.name),
        spend: serie.map((r) => +(r.spend || 0).toFixed(2)),
        impr: serie.map((r) => r.impressions || 0),
        res: serie.map((r) => r.results || 0),
      } : null,
      scatter: withCpm.filter((r) => r.reach > 0).map((r) => ({
        name: r.name,
        x: +(r.spend && r.reach ? (r.spend / r.reach) * 1000 : 0).toFixed(2), // custo por mil alcançadas
        y: +(r.frequency || (r.reach ? r.impressions / r.reach : 0)).toFixed(2),
        r: Math.max(4, Math.sqrt(r.spend || 1) * 1.6),
        active: isActive(r.status),
      })),
    });

    // ---- Tabela de performance ----
    const linhas = sortBySpend.map((r) => {
      const best = melhor && r.name === melhor.name && r.cost_per_result > 0;
      return `<tr>
        <td class="left">${esc(r.name)}</td>
        <td class="${isActive(r.status) ? "st-ativo" : "st-inativo"}">${statusLabel(r.status)}</td>
        <td class="num">${money(r.spend, cur)}</td>
        <td class="num">${num(r.impressions)}</td>
        <td class="num">${num(r.reach)}</td>
        <td class="num">${money(r._cpm, cur)}</td>
        <td class="num">${(r.frequency || 0).toFixed(2)}</td>
        <td class="num">${r.results ? num(r.results) : "—"}</td>
        <td class="num ${best ? "best" : ""}">${r.cost_per_result ? money(r.cost_per_result, cur) : "—"}</td>
      </tr>`;
    }).join("");

    // ---- Narrativas (heurísticas) ----
    const entregaTxt =
      `A conta entregou ${num(tImpr)} impressões para ${num(tReach)} pessoas únicas, com frequência média de ` +
      `${freqMedia.toFixed(2).replace(".", ",")} — cada pessoa viu os anúncios pouco mais de uma vez no período. ` +
      `O CPM médio ficou em ${money(cpmMedio, cur)}.`;

    const resultadoTxt = comResultado.length
      ? `Apenas ${comResultado.length} de ${rows.length} ${unidade} registraram resultado no período. ` +
        (melhor ? `O destaque foi <strong>${esc(melhor.name)}</strong> — ${num(melhor.results)} ${(melhor.results_label || "resultados").toLowerCase()} a ${money(melhor.cost_per_result, cur)} cada` : "") +
        (pior && melhor && melhor.cost_per_result ? `, contra ${money(pior.cost_per_result, cur)} do ${esc(pior.name)} (${(pior.cost_per_result / melhor.cost_per_result).toFixed(1)}x mais caro).` : ".")
      : `Nenhum ${level} registrou resultado rastreável no período — vale auditar o disparo do pixel/eventos antes de decisões de corte.`;

    // ---- Diagnóstico / recomendações ----
    const pontos = [];
    const semRes = rows.filter((r) => r.spend > 0 && r.results === 0);
    if (semRes.length) pontos.push(`<strong>Gasto sem resultado rastreado.</strong> ${semRes.length} ${unidade} investiram mas não registraram resultado (${money(semRes.reduce((s, r) => s + r.spend, 0), cur)}). Hipótese mais provável: falha de rastreamento de evento — não necessariamente desempenho ruim.`);
    if (melhor && !isActive(melhor.status)) pontos.push(`<strong>O mais eficiente está pausado.</strong> ${esc(melhor.name)} entregou o melhor custo por resultado (${money(melhor.cost_per_result, cur)}) e está inativo.`);
    if (rows.length >= 8) pontos.push(`<strong>Verba pulverizada.</strong> ${rows.length} ${unidade} dividindo ${money(tSpend, cur)} resultam em frequência média de ${freqMedia.toFixed(2).replace(".", ",")} — geralmente insuficiente pra resposta em conversão e pra sair da fase de aprendizado.`);
    if (serie) pontos.push(`<strong>Concorrência interna na série ${esc(serieNome)}.</strong> ${serie.length} ${unidade} disputando público semelhante elevam o CPM e dificultam a leitura de qual variação performa melhor.`);

    const recs = [];
    if (semRes.length) recs.push(`<strong>Auditar o pixel antes de cortar.</strong> Confirmar no Events Manager se os eventos disparam nas páginas dos ${unidade} sem resultado. Sem isso, qualquer pausa pode descartar quem converte sem registrar.`);
    if (serie) recs.push(`<strong>Consolidar a série ${esc(serieNome)}.</strong> Concentrar verba em 1–2 variações de melhor sinal em vez de manter várias competindo entre si — reduz CPM e acelera aprendizado.`);
    if (melhor && !isActive(melhor.status)) recs.push(`<strong>Reativar ${esc(melhor.name)}.</strong> Provou ser o caminho mais barato (${money(melhor.cost_per_result, cur)}/resultado). Reativar com orçamento dedicado.`);
    recs.push(`<strong>Elevar a frequência com remarketing.</strong> Criar conjunto sobre as ~${num(tReach)} pessoas alcançadas pra gerar o 2º e 3º contato que hoje não acontecem.`);
    if (melhor) recs.push(`<strong>Definir meta de custo por resultado.</strong> Usar ${money(melhor.cost_per_result, cur)} como benchmark e estabelecer um teto pra orientar corte e escala.`);

    // ---- Monta HTML ----
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" />
<title>${esc(title)} — Relatório Brandcast</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>${CSS}</style></head>
<body>
  <div class="actions"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>

  <!-- Faixas fixas (repetem em cada página impressa) -->
  <div class="band band-top">
    <span class="band-brand">${logo ? `<img src="${logo}" alt="Brandcast" />` : ""} Agência Brandcast — ${esc(title)}</span>
    <span>${esc(periodo)}</span>
  </div>
  <div class="band band-bot">
    <span>Fonte: Gerenciador de Anúncios (Meta Ads) · Atribuição: clique 7d / visualização 1d</span>
    <span>Agência Brandcast</span>
  </div>

  <main>
    <!-- SEÇÃO 1: Dashboard geral -->
    <section class="sec">
      <h1>Dashboard Geral</h1>
      <p class="lead">Visão consolidada dos ${rows.length} ${unidade} no período de ${esc(periodo)}.</p>
      <div class="kpis">
        <div class="kpi"><div class="kpi-v">${money(tSpend, cur)}</div><div class="kpi-l">Investimento total</div><div class="kpi-s">${money(spendAtivos, cur)} em ativos</div></div>
        <div class="kpi"><div class="kpi-v">${num(tImpr)}</div><div class="kpi-l">Impressões</div><div class="kpi-s">CPM médio ${money(cpmMedio, cur)}</div></div>
        <div class="kpi"><div class="kpi-v">${num(tReach)}</div><div class="kpi-l">Alcance</div><div class="kpi-s">frequência ${freqMedia.toFixed(2).replace(".", ",")}</div></div>
        <div class="kpi"><div class="kpi-v">${num(tRes)}</div><div class="kpi-l">${esc(resLabel)}</div><div class="kpi-s">${comResultado.length} ${level}(s) converteram</div></div>
        <div class="kpi"><div class="kpi-v">${ativos.length}/${rows.length}</div><div class="kpi-l">${level === "conjunto" ? "Conjuntos ativos" : "Campanhas ativas"}</div><div class="kpi-s">${rows.length - ativos.length} pausados</div></div>
      </div>
      <h3 class="chart-title">Investimento por ${level} (${cur === "BRL" ? "R$" : cur})</h3>
      <div class="chart-wrap tall"><canvas id="cInvest"></canvas></div>
      <div class="two">
        <div>${temFunil ? `<h3 class="chart-title">Investimento por etapa do funil</h3><div class="chart-wrap"><canvas id="cFunil"></canvas></div>` : ""}</div>
        <div><h3 class="chart-title">Verba em ativos × inativos</h3><div class="chart-wrap"><canvas id="cAtivos"></canvas></div></div>
      </div>
    </section>

    <!-- SEÇÃO 2: Entrega e custo -->
    <section class="sec break">
      <h1>Entrega e Custo de Mídia</h1>
      <p>${entregaTxt}</p>
      <h3 class="chart-title">Impressões × Alcance por ${level}</h3>
      <div class="chart-wrap tall"><canvas id="cImprReach"></canvas></div>
      <h3 class="chart-title">CPM por ${level} (custo por mil impressões)</h3>
      <div class="chart-wrap tall"><canvas id="cCpm"></canvas></div>
    </section>

    <!-- SEÇÃO 3: Tabela de performance -->
    <section class="sec break">
      <h1>Performance por ${level === "conjunto" ? "Conjunto de Anúncios" : "Campanha"}</h1>
      <table class="perf">
        <thead><tr>
          <th class="left">${level === "conjunto" ? "Conjunto" : "Campanha"}</th><th>Status</th>
          <th class="num">Gasto</th><th class="num">Impr.</th><th class="num">Alcance</th>
          <th class="num">CPM</th><th class="num">Freq.</th><th class="num">Result.</th><th class="num">Custo/Res.</th>
        </tr></thead>
        <tbody>${linhas}
          <tr class="total"><td class="left">TOTAL</td><td>${ativos.length} ativos</td>
            <td class="num">${money(tSpend, cur)}</td><td class="num">${num(tImpr)}</td>
            <td class="num">${num(tReach)}</td><td class="num">${money(cpmMedio, cur)}</td>
            <td class="num">${freqMedia.toFixed(2)}</td><td class="num">${num(tRes)}</td><td class="num">—</td></tr>
        </tbody>
      </table>
      ${comResultado.length ? `
        <h2>Resultados e custo por resultado</h2>
        <p>${resultadoTxt}</p>
        <div class="two">
          <div><h3 class="chart-title">Resultados registrados</h3><div class="chart-wrap"><canvas id="cRes"></canvas></div></div>
          <div><h3 class="chart-title">Custo por resultado</h3><div class="chart-wrap"><canvas id="cCpr"></canvas></div></div>
        </div>` : `<p>${resultadoTxt}</p>`}
    </section>

    ${serie ? `
    <!-- SEÇÃO 4: Análise da série -->
    <section class="sec break">
      <h1>Análise da Série ${esc(serieNome)}</h1>
      <p>A série <strong>${esc(serieNome)}</strong> reúne ${serie.length} variações e concentrou
        ${money(serie.reduce((s, r) => s + r.spend, 0), cur)} (${Math.round(serie.reduce((s, r) => s + r.spend, 0) / tSpend * 100)}% do investimento).
        Quando variações com entrega semelhante têm resultados muito diferentes, vale verificar o rastreamento antes de otimizar.</p>
      <h3 class="chart-title">${esc(serieNome)} — gasto × entrega</h3>
      <div class="chart-wrap tall"><canvas id="cSerie"></canvas></div>
    </section>` : ""}

    <!-- SEÇÃO: Eficiência scatter -->
    <section class="sec ${serie ? "" : "break"}">
      <h1>Eficiência de Alcance × Frequência</h1>
      <p>Cada ponto é um ${level}. Eixo X = custo por mil pessoas alcançadas, eixo Y = frequência, tamanho = investimento.
        Quanto mais à esquerda, mais barato pra alcançar público novo.</p>
      <div class="chart-wrap tall"><canvas id="cScatter"></canvas></div>
    </section>

    <!-- SEÇÃO: Diagnóstico -->
    <section class="sec break">
      <h1>Diagnóstico e Recomendações</h1>
      ${pontos.length ? `<h2>Pontos de atenção</h2><ol class="diag">${pontos.map((p) => `<li>${p}</li>`).join("")}</ol>` : ""}
      <h2>Recomendações</h2>
      <ul class="recs">${recs.map((r) => `<li>${r}</li>`).join("")}</ul>
    </section>
  </main>

  <script>
    (function () {
      if (typeof Chart === "undefined") return;
      var D = ${chartData};
      var BLUE = "#2d6cdf", BLUE_L = "#7aa6ef", GRAY = "#b4bcc8", GREEN = "#16a34a", RED = "#dc2626",
          ORANGE = "#f59e0b", PURPLE = "#6C02ED", PURPLE_L = "#a78bfa";
      var moneyFmt = function (v) { return new Intl.NumberFormat("pt-BR",{style:"currency",currency:D.cur}).format(v||0); };
      var numFmt = function (v) { return new Intl.NumberFormat("pt-BR").format(Math.round(v||0)); };
      Chart.defaults.font.family = "-apple-system, Segoe UI, Roboto, sans-serif";
      Chart.defaults.font.size = 11;
      Chart.defaults.color = "#374151";
      var noLegend = { legend: { display: false } };

      // 1. Investimento por linha (barras horizontais, cor por status)
      new Chart(document.getElementById("cInvest"), {
        type: "bar",
        data: { labels: D.invest.labels, datasets: [{ data: D.invest.values,
          backgroundColor: D.invest.active.map(function (a) { return a ? BLUE : GRAY; }),
          borderRadius: 3 }] },
        options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false },
            tooltip: { callbacks: { label: function (c) { return moneyFmt(c.parsed.x); } } } },
          scales: { x: { grid: { color: "#eee" }, ticks: { callback: function (v) { return numFmt(v); } } },
            y: { grid: { display: false }, ticks: { font: { size: 10 } } } } }
      });

      // 2. Funil (donut com total no centro)
      if (D.funil) {
        new Chart(document.getElementById("cFunil"), {
          type: "doughnut",
          data: { labels: D.funil.labels, datasets: [{ data: D.funil.values,
            backgroundColor: [BLUE, GREEN, ORANGE, GRAY], borderColor: "#fff", borderWidth: 2 }] },
          options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: "62%",
            plugins: { legend: { position: "bottom", labels: { font: { size: 10 } } },
              tooltip: { callbacks: { label: function (c) { return c.label + ": " + moneyFmt(c.parsed); } } } } },
          plugins: [centerText(moneyFmt(D.invest.values.reduce(function(a,b){return a+b;},0)), "total")]
        });
      }

      // 3. Ativos x inativos (donut)
      new Chart(document.getElementById("cAtivos"), {
        type: "doughnut",
        data: { labels: ["Ativos", "Inativos"], datasets: [{ data: [D.ativos.ativo, D.ativos.inativo],
          backgroundColor: [GREEN, GRAY], borderColor: "#fff", borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: "62%",
          plugins: { legend: { position: "bottom", labels: { font: { size: 10 } } },
            tooltip: { callbacks: { label: function (c) { return c.label + ": " + moneyFmt(c.parsed); } } } } },
        plugins: [centerText(D.ativos.n + " de " + D.ativos.total, "ativos")]
      });

      // 4. Impressões x Alcance (barras agrupadas verticais)
      new Chart(document.getElementById("cImprReach"), {
        type: "bar",
        data: { labels: D.imprReach.labels, datasets: [
          { label: "Impressões", data: D.imprReach.impr, backgroundColor: BLUE, borderRadius: 3 },
          { label: "Alcance", data: D.imprReach.reach, backgroundColor: BLUE_L, borderRadius: 3 } ] },
        options: { responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { position: "top" }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + numFmt(c.parsed.y); } } } },
          scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 40, minRotation: 40 } },
            y: { grid: { color: "#eee" }, ticks: { callback: function (v) { return numFmt(v); } } } } }
      });

      // 5. CPM por linha (barras horizontais, verde<=média / vermelho>média, linha de média)
      new Chart(document.getElementById("cCpm"), {
        type: "bar",
        data: { labels: D.cpm.labels, datasets: [{ data: D.cpm.values,
          backgroundColor: D.cpm.values.map(function (v) { return v > D.cpm.media ? RED : GREEN; }),
          borderRadius: 3 }] },
        options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return moneyFmt(c.parsed.x); } } } },
          scales: { x: { grid: { color: "#eee" }, ticks: { callback: function (v) { return moneyFmt(v); } } },
            y: { grid: { display: false }, ticks: { font: { size: 10 } } } } },
        plugins: [avgLine(D.cpm.media, moneyFmt(D.cpm.media))]
      });

      // 6. Resultados + custo por resultado
      if (D.resultados) {
        new Chart(document.getElementById("cRes"), {
          type: "bar",
          data: { labels: D.resultados.labels, datasets: [{ data: D.resultados.res, backgroundColor: GREEN, borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: noLegend,
            scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { grid: { color: "#eee" } } } }
        });
        new Chart(document.getElementById("cCpr"), {
          type: "bar",
          data: { labels: D.resultados.labels, datasets: [{ data: D.resultados.cpr, backgroundColor: PURPLE, borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false },
            tooltip: { callbacks: { label: function (c) { return moneyFmt(c.parsed.y); } } } },
            scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { grid: { color: "#eee" }, ticks: { callback: function (v) { return moneyFmt(v); } } } } }
        });
      }

      // 7. Série (gasto x impressões, eixo duplo)
      if (D.serie) {
        new Chart(document.getElementById("cSerie"), {
          type: "bar",
          data: { labels: D.serie.labels, datasets: [
            { label: "Gasto", data: D.serie.spend, backgroundColor: BLUE, borderRadius: 3, yAxisID: "y" },
            { label: "Impressões", data: D.serie.impr, backgroundColor: ORANGE, borderRadius: 3, yAxisID: "y1" } ] },
          options: { responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { position: "top" } },
            scales: { x: { grid: { display: false } },
              y: { position: "left", grid: { color: "#eee" }, ticks: { callback: function (v) { return moneyFmt(v); } } },
              y1: { position: "right", grid: { display: false }, ticks: { callback: function (v) { return numFmt(v); } } } } }
        });
      }

      // 8. Scatter eficiência (bubble)
      new Chart(document.getElementById("cScatter"), {
        type: "bubble",
        data: { datasets: [
          { label: "Ativo", data: D.scatter.filter(function (p) { return p.active; }), backgroundColor: "rgba(45,108,223,.65)" },
          { label: "Inativo", data: D.scatter.filter(function (p) { return !p.active; }), backgroundColor: "rgba(180,188,200,.65)" } ] },
        options: { responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { position: "top" },
            tooltip: { callbacks: { label: function (c) { var p = c.raw; return p.name + " — " + moneyFmt(p.x) + "/mil alcance · freq " + p.y; } } } },
          scales: { x: { title: { display: true, text: "Custo por mil alcançadas (" + (D.cur === "BRL" ? "R$" : D.cur) + ")" }, grid: { color: "#eee" } },
            y: { title: { display: true, text: "Frequência" }, grid: { color: "#eee" } } } }
      });

      // plugin: texto no centro do donut
      function centerText(big, small) {
        return { id: "ct" + Math.random(), afterDraw: function (chart) {
          var a = chart.getDatasetMeta(0).data[0]; if (!a) return;
          var x = a.x, y = a.y, ctx = chart.ctx;
          ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillStyle = "#1f2937"; ctx.font = "700 18px -apple-system, sans-serif";
          ctx.fillText(big, x, y - 6);
          ctx.fillStyle = "#9ca3af"; ctx.font = "400 11px -apple-system, sans-serif";
          ctx.fillText(small, x, y + 12); ctx.restore();
        } };
      }
      // plugin: linha vertical de média no gráfico horizontal
      function avgLine(media, label) {
        return { id: "avg" + Math.random(), afterDraw: function (chart) {
          var xs = chart.scales.x; if (!xs) return;
          var px = xs.getPixelForValue(media), top = chart.chartArea.top, bot = chart.chartArea.bottom, ctx = chart.ctx;
          ctx.save(); ctx.strokeStyle = "#6b7280"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bot); ctx.stroke();
          ctx.setLineDash([]); ctx.fillStyle = "#6b7280"; ctx.font = "700 10px -apple-system, sans-serif";
          ctx.textAlign = "left"; ctx.fillText("média " + label, px + 4, top + 10); ctx.restore();
        } };
      }
    })();
  </script>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { if (onError) onError("Permita pop-ups deste site para gerar o relatório."); return; }
    w.document.open(); w.document.write(html); w.document.close();
  } catch (e) {
    if (onError) onError(e instanceof Error ? e.message : "Falha ao gerar relatório.");
  }
}

// ============================================================================
// CSS
// ============================================================================
const CSS = `
  :root { --roxo:#6C02ED; --navy:#1e1442; --txt:#1f2937; --muted:#6b7280; --borda:#e5e7eb; }
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { background:#fff; color:var(--txt); font-family:-apple-system,"Segoe UI",Roboto,sans-serif;
    font-size:12.5px; line-height:1.55; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  main { max-width:880px; margin:0 auto; padding:74px 40px 60px; }

  /* Faixas fixas (repetem por página na impressão) */
  .band { position:fixed; left:0; right:0; display:flex; align-items:center; justify-content:space-between;
    padding:10px 40px; font-size:11px; z-index:100; }
  .band-top { top:0; background:linear-gradient(90deg,var(--navy),#3a1d6e); color:#fff; font-weight:600; }
  .band-top .band-brand { display:flex; align-items:center; gap:8px; }
  .band-top img { height:18px; width:auto; filter:brightness(0) invert(1); }
  .band-bot { bottom:0; background:#fff; border-top:1px solid var(--borda); color:var(--muted); }

  .sec { margin-bottom:30px; }
  .sec.break { page-break-before:always; padding-top:8px; }
  h1 { font-size:24px; font-weight:800; color:var(--navy); margin-bottom:6px; }
  h2 { font-size:16px; font-weight:700; color:var(--navy); margin:20px 0 8px; }
  h3.chart-title { font-size:14px; font-weight:700; color:var(--roxo); text-align:center; margin:18px 0 8px; }
  p { margin-bottom:10px; }
  .lead { color:var(--muted); margin-bottom:16px; }

  .kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:0; border:1px solid var(--borda);
    border-radius:8px; overflow:hidden; }
  .kpi { padding:14px 10px; text-align:center; border-right:1px solid var(--borda); }
  .kpi:last-child { border-right:none; }
  .kpi-v { font-size:20px; font-weight:800; color:var(--roxo); }
  .kpi-l { font-size:9.5px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; color:var(--muted); margin-top:3px; }
  .kpi-s { font-size:10px; color:var(--muted); margin-top:3px; }

  .chart-wrap { position:relative; height:260px; width:100%; break-inside:avoid; }
  .chart-wrap.tall { height:340px; }
  .two { display:grid; grid-template-columns:1fr 1fr; gap:20px; align-items:start; }

  table.perf { width:100%; border-collapse:collapse; font-size:11px; margin:8px 0; }
  table.perf thead th { background:var(--navy); color:#fff; padding:8px; text-align:right; font-size:10px; }
  table.perf thead th.left { text-align:left; }
  table.perf td { padding:7px 8px; border-bottom:1px solid var(--borda); text-align:right; }
  table.perf td.left { text-align:left; font-weight:600; }
  table.perf td.num { font-variant-numeric:tabular-nums; }
  table.perf tr:nth-child(even) { background:#f9fafb; }
  table.perf tr.total td { font-weight:800; background:#f3f4f6; border-top:2px solid var(--navy); }
  .st-ativo { color:var(--roxo); font-weight:600; }
  .st-inativo { color:var(--muted); }
  td.best { background:#dcfce7; color:#15803d; font-weight:800; }

  ol.diag, ul.recs { margin:6px 0 10px 18px; }
  ol.diag li, ul.recs li { margin-bottom:9px; padding-left:4px; }

  .actions { position:fixed; top:50px; right:16px; z-index:200; }
  .actions button { background:var(--roxo); color:#fff; border:none; border-radius:8px; padding:9px 16px;
    font-weight:700; cursor:pointer; box-shadow:0 4px 12px rgba(108,2,237,.3); }
  @media print { .actions { display:none; } main { padding:74px 0 50px; } @page { margin:0; size:A4; } }
`;

// ============================================================================
// Funções exportadas — mapeiam pros geradores antigos pra não quebrar imports.
// ============================================================================
export async function generateCampaignReport({ campaign, adsets = [], onError, datePreset, currency }) {
  return generateWeekly({
    title: campaign?.name || "Campanha", level: "conjunto", rows: adsets,
    datePreset, currency: currency || "BRL", onError,
  });
}

export async function generateReport({ clients = [], accountId, datePreset, onError }) {
  const isSingle = !!accountId;
  const client = isSingle ? clients.find((c) => c.account_id === accountId) : null;
  const rows = isSingle
    ? (client?.campaigns || [])
    : clients.flatMap((c) => c.campaigns || []);
  return generateWeekly({
    title: isSingle ? (client?.name || "Cliente") : "Consolidado",
    level: "campanha", rows, datePreset,
    currency: isSingle ? (client?.currency || "BRL") : "BRL", onError,
  });
}

export async function generateCampaignsReport({ campaigns = [], datePreset, onError }) {
  return generateWeekly({
    title: "Campanhas", level: "campanha", rows: campaigns,
    datePreset, currency: campaigns[0]?.currency || "BRL", onError,
  });
}

export async function generateChartsReport(args) { return generateCampaignsReport(args); }

// O relatório "visual" (captura de tela) agora cai no relatório completo com gráficos nativos.
export async function generateVisualReport({ clientName, datePreset, onError }) {
  if (onError) onError("Use o botão Relatório PDF — agora ele já inclui todos os gráficos.");
  void clientName; void datePreset;
}

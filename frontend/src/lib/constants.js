export const PERIOD_LABELS = {
  today: "Hoje",
  yesterday: "Ontem",
  last_7d: "Últimos 7 dias",
  last_14d: "Últimos 14 dias",
  last_30d: "Últimos 30 dias",
  last_90d: "Últimos 90 dias",
  this_month: "Este mês",
  last_month: "Mês passado",
  maximum: "Máximo",
};

export const PERIOD_OPTIONS = [
  ["today", "Hoje"],
  ["yesterday", "Ontem"],
  ["last_7d", "Últimos 7 dias"],
  ["last_14d", "Últimos 14 dias"],
  ["last_30d", "Últimos 30 dias"],
  ["last_90d", "Últimos 90 dias"],
  ["this_month", "Este mês"],
  ["last_month", "Mês passado"],
  ["maximum", "Máximo"],
];

// Dias cobertos pelo período (para estimar ritmo de gasto).
export function periodDays(preset) {
  const map = {
    today: 1, yesterday: 1, last_7d: 7, last_14d: 14, last_30d: 30,
    last_90d: 90, last_month: 30, maximum: 90,
  };
  if (preset === "this_month") return new Date().getDate();
  return map[preset] || 30;
}

// Limites para considerar um cliente "critico".
export const SALDO_ALERTA_PCT = 80;
export const SALDO_ALERTA_DIAS = 7;

// Paleta de cores acessivel pra graficos (mesma do app vanilla).
export const CHART_PALETTE = [
  "#4c8dff", "#3fb950", "#d29922", "#f85149", "#a371f7",
  "#f778ba", "#56d4dd", "#ffa657", "#79c0ff", "#7ee787",
];
export function chartColor(i) {
  return CHART_PALETTE[i % CHART_PALETTE.length];
}

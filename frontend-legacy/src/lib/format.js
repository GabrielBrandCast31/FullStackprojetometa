// Formatadores compartilhados (pt-BR). Identicos ao app vanilla.

export function money(v, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency,
  }).format(v || 0);
}

export function num(v) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(v || 0));
}

export function pct(v) {
  return (v || 0).toFixed(1) + "%";
}

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function roasClass(r) {
  if (r >= 2) return "roas-good";
  if (r >= 1) return "roas-mid";
  return "roas-bad";
}

// Destaca CPAs baixos numa lista. Quanto menor (e > 0), mais forte o destaque.
// O critério é relativo à mediana da lista — funciona pra qualquer escala/setor.
// Retorna ["", "cpa-good", "cpa-best", "cpa-elite"] (vazio = neutro).
export function cpaClass(cpa, refMedian) {
  if (!cpa || cpa <= 0 || !refMedian) return "";
  const ratio = cpa / refMedian;
  if (ratio <= 0.40) return "cpa-elite";    // <= 40% da mediana
  if (ratio <= 0.65) return "cpa-best";     // <= 65%
  if (ratio <= 0.95) return "cpa-good";     // <= 95%
  return "";
}

// Mediana dos CPAs > 0 da lista (usada como referência pra `cpaClass`).
export function cpaMedian(items, key = "cost_per_result") {
  const vals = items.map((i) => i[key]).filter((v) => v > 0).sort((a, b) => a - b);
  if (!vals.length) return 0;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

export const ACCOUNT_STATUS_LABELS = {
  1: "Ativa", 2: "Desativada", 3: "Não quitada", 7: "Em análise",
  8: "Pendente", 9: "Período de carência", 100: "Pendente", 101: "Fechada",
};
export function accountStatusLabel(code) {
  return ACCOUNT_STATUS_LABELS[code] || "—";
}

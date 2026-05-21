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

export const ACCOUNT_STATUS_LABELS = {
  1: "Ativa", 2: "Desativada", 3: "Não quitada", 7: "Em análise",
  8: "Pendente", 9: "Período de carência", 100: "Pendente", 101: "Fechada",
};
export function accountStatusLabel(code) {
  return ACCOUNT_STATUS_LABELS[code] || "—";
}

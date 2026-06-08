import { periodDays, SALDO_ALERTA_DIAS, SALDO_ALERTA_PCT } from "./constants.js";

// Cadeia de prioridade do saldo de um cliente (igual ao app vanilla):
//   1) valor informado manualmente no painel (manualSaldoMap)
//   2) limite de gastos da conta no Meta (spend_cap - amount_spent)
//   3) orcamento total (lifetime_budget) das campanhas
export function computeSaldo(client, manualSaldoMap, datePreset) {
  const spend = (client.campaigns || []).reduce((s, c) => s + c.spend, 0);
  const manual = manualSaldoMap[client.account_id];
  let total = null, remaining = null, source = null, asOf = null;

  if (manual && manual.valor > 0) {
    total = manual.valor;
    remaining = manual.valor - spend;
    source = "Saldo informado";
    asOf = manual.data;
  } else if (client.spend_cap > 0) {
    total = client.spend_cap;
    remaining = client.spend_cap - client.amount_spent;
    source = "Limite da conta (Meta)";
  } else {
    const lt = (client.campaigns || []).filter((c) => c.budget_type === "Total");
    const ltTotal = lt.reduce((s, c) => s + c.budget, 0);
    if (ltTotal > 0) {
      total = ltTotal;
      remaining = ltTotal - lt.reduce((s, c) => s + c.spend, 0);
      source = "Orçamento das campanhas";
    }
  }

  if (total === null) return { known: false, source: "Sem dado de saldo", spend };

  remaining = Math.max(remaining, 0);
  const consumedPct = total ? (1 - remaining / total) * 100 : 100;
  const dailyRate = spend / periodDays(datePreset);
  const daysLeft = dailyRate > 0 ? remaining / dailyRate : null;

  let level = "ok";
  if (remaining <= 0 || (daysLeft !== null && daysLeft <= 3)) level = "critical";
  else if (
    consumedPct >= SALDO_ALERTA_PCT ||
    (daysLeft !== null && daysLeft <= SALDO_ALERTA_DIAS)
  ) {
    level = "warn";
  }

  return {
    known: true, total, remaining, consumedPct, dailyRate, daysLeft,
    source, asOf, spend, level,
  };
}

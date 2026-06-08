// Calcula o saldo estimado de uma conta de anuncios.
// Cadeia de prioridade: manual (localStorage) -> spend_cap da conta -> orcamento total das campanhas.

import type { Client } from "./api/client";

const SALDO_ALERTA_PCT = 80;
const SALDO_ALERTA_DIAS = 7;

const DAYS_MAP: Record<string, number> = {
  today: 1, yesterday: 1, last_7d: 7, last_14d: 14,
  last_30d: 30, last_90d: 90, last_month: 30, maximum: 90,
};

export function periodDays(preset?: string): number {
  if (preset === "this_month") return new Date().getDate();
  return DAYS_MAP[preset || "last_30d"] || 30;
}

export type SaldoResult =
  | { known: false; source: string; spend: number }
  | {
      known: true;
      total: number;
      remaining: number;
      consumedPct: number;
      dailyRate: number;
      daysLeft: number | null;
      source: string;
      asOf?: string;
      spend: number;
      level: "ok" | "warn" | "critical";
    };

export type ManualSaldoMap = Record<string, { valor: number; data: string }>;

export function computeSaldo(
  client: Client,
  manualSaldoMap: ManualSaldoMap,
  datePreset: string,
): SaldoResult {
  const campaigns = client.campaigns || [];
  const spend = campaigns.reduce((s, c) => s + c.spend, 0);
  const manual = manualSaldoMap[client.account_id];

  let total: number | null = null;
  let remaining: number | null = null;
  let source = "";
  let asOf: string | undefined;

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
    const lt = campaigns.filter((c) => c.budget_type === "Total");
    const ltTotal = lt.reduce((s, c) => s + c.budget, 0);
    if (ltTotal > 0) {
      total = ltTotal;
      remaining = ltTotal - lt.reduce((s, c) => s + c.spend, 0);
      source = "Orçamento das campanhas";
    }
  }

  if (total === null || remaining === null) {
    return { known: false, source: "Sem dado de saldo", spend };
  }

  remaining = Math.max(remaining, 0);
  const consumedPct = total ? (1 - remaining / total) * 100 : 100;
  const dailyRate = spend / periodDays(datePreset);
  const daysLeft = dailyRate > 0 ? remaining / dailyRate : null;

  let level: "ok" | "warn" | "critical" = "ok";
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

// CSS class helpers
export function roasClass(r: number): string {
  if (r >= 2) return "text-success";
  if (r >= 1) return "text-foreground";
  return "text-destructive";
}

export function cpaMedian(items: { cost_per_result?: number }[], key: "cost_per_result" = "cost_per_result"): number {
  const vals = items.map((i) => i[key] || 0).filter((v) => v > 0).sort((a, b) => a - b);
  if (!vals.length) return 0;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

// Quanto menor (e > 0), mais forte o destaque visual. Retorna classes Tailwind pra UI.
export function cpaClass(cpa: number, refMedian: number): string {
  if (!cpa || cpa <= 0 || !refMedian) return "";
  const ratio = cpa / refMedian;
  if (ratio <= 0.40) return "text-success font-bold";
  if (ratio <= 0.65) return "text-success";
  if (ratio <= 0.95) return "text-success/80";
  return "";
}

// Label semantico ("cpa-elite", "cpa-best", "cpa-good", "") — usado pelo
// gerador de PDF que tem seu proprio CSS interno.
export function cpaLabel(cpa: number, refMedian: number): string {
  if (!cpa || cpa <= 0 || !refMedian) return "";
  const ratio = cpa / refMedian;
  if (ratio <= 0.40) return "cpa-elite";
  if (ratio <= 0.65) return "cpa-best";
  if (ratio <= 0.95) return "cpa-good";
  return "";
}

export const accountStatusLabel = (code: number): string => ({
  1: "Ativa", 2: "Desativada", 3: "Não quitada", 7: "Em análise",
  8: "Pendente", 9: "Carência", 100: "Pendente", 101: "Fechada",
}[code] || "—");

export const PERIOD_LABELS: Record<string, string> = {
  today: "Hoje", yesterday: "Ontem",
  last_7d: "Últimos 7 dias", last_14d: "Últimos 14 dias",
  last_30d: "Últimos 30 dias", last_90d: "Últimos 90 dias",
  this_month: "Este mês", last_month: "Mês passado",
  maximum: "Máximo",
};

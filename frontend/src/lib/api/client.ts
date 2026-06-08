// Cliente do backend FastAPI (mesmo origin via proxy nginx /api -> backend:8000).
// JWT persiste em localStorage; tela 401 -> redireciona pra /login.

const TOKEN_KEY = "auth_token";
const SALDO_KEY = "meta_saldo";

// JWT do nosso backend — esse continua no localStorage.
export function getAuthToken(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setAuthToken(t: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearAuthToken() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export function getManualSaldo(): Record<string, { valor: number; data: string }> {
  if (typeof localStorage === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(SALDO_KEY) || "{}"); }
  catch { return {}; }
}
export function setManualSaldo(m: Record<string, { valor: number; data: string }>) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SALDO_KEY, JSON.stringify(m));
}

// Wrapper de fetch — envia JWT, parseia JSON, lança em 4xx/5xx.
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const resp = await fetch(path, { ...init, headers });
  const text = await resp.text();
  let data: unknown = null;
  if (text) { try { data = JSON.parse(text); } catch { /* keep null */ } }

  if (resp.status === 401) {
    clearAuthToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Sessão expirada");
  }
  if (!resp.ok) {
    const detail = (data as { detail?: string } | null)?.detail || `HTTP ${resp.status}`;
    throw new Error(detail);
  }
  return data as T;
}

// ============== Types ==============
export interface Campaign {
  id: string;
  name: string;
  client: string;
  status: string;
  objective: string;
  budget: number;
  budget_type: string;
  start_time?: string;
  stop_time?: string;
  spend: number;
  revenue: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  link_clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  leads: number;
  conversations: number;
  cost_per_conversation: number;
  results: number;
  results_label: string;
  cpa: number;
  cost_per_result: number;
  conv_rate: number;
  roas: number;
  attribution_setting?: string;
  currency?: string;
}

export interface ClientSummary {
  total_campaigns: number;
  active_campaigns: number;
  total_spend: number;
  total_revenue: number;
  total_purchases: number;
  total_results: number;
  total_conversations: number;
  total_impressions: number;
  total_clicks: number;
  total_link_clicks: number;
  roas: number;
  avg_ctr: number;
  cpa: number;
  cost_per_conversation: number;
}

export interface Client {
  account_id: string;
  name: string;
  currency: string;
  account_status: number;
  amount_spent: number;
  spend_cap: number;
  balance: number;
  campaigns: Campaign[];
  summary: ClientSummary;
  summary_previous: ClientSummary | null;
  error: string | null;
}

export interface OverviewResponse {
  date_preset: string;
  clients: Client[];
}

// ============== Endpoints ==============
export async function authLogin(email: string, password: string): Promise<{ token: string }> {
  return apiFetch<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function authRegister(
  name: string, email: string, password: string, admin_password: string,
): Promise<{ ok: boolean; user: { name: string; email: string } }> {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, admin_password }),
  });
}

export async function authMe(): Promise<{ name: string; email: string }> {
  return apiFetch("/api/auth/me");
}

export async function fetchHealth(): Promise<{ status: string; ai_enabled: boolean; meta_api: string }> {
  return apiFetch("/api/health");
}

// Overview/timeseries: o backend usa o token armazenado (auth.get_meta_token)
// e cacheia a resposta por 30 minutos. Passe force_refresh=true pra atropelar.
export async function fetchOverview(
  date_preset = "last_30d",
  include_previous = true,
  force_refresh = false,
): Promise<OverviewResponse & { from_cache?: boolean }> {
  return apiFetch("/api/overview", {
    method: "POST",
    body: JSON.stringify({ date_preset, include_previous, force_refresh }),
  });
}

export async function fetchTimeseries(
  account_ids: string[],
  date_preset = "last_30d",
  force_refresh = false,
): Promise<{
  date_preset: string;
  from_cache?: boolean;
  accounts: { account_id: string; rows: { date_start: string; spend: string; action_values?: { action_type: string; value: string }[] }[] }[];
}> {
  return apiFetch("/api/timeseries", {
    method: "POST",
    body: JSON.stringify({ account_ids, date_preset, force_refresh }),
  });
}

// ============== Meta token (armazenado no backend) ==============
export async function getMetaTokenStatus(): Promise<{ configured: boolean; preview: string }> {
  return apiFetch("/api/meta/token");
}

export async function saveMetaToken(access_token: string): Promise<{ ok: boolean; preview: string }> {
  return apiFetch("/api/meta/token", {
    method: "POST",
    body: JSON.stringify({ access_token }),
  });
}

export async function deleteMetaToken(): Promise<{ ok: boolean }> {
  return apiFetch("/api/meta/token", { method: "DELETE" });
}

// ============== Helpers de formato ==============
export const fmtMoney = (v: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v || 0);

export const fmtNum = (v: number) =>
  new Intl.NumberFormat("pt-BR").format(Math.round(v || 0));

export const fmtPct = (v: number) => (v || 0).toFixed(2).replace(".", ",") + "%";

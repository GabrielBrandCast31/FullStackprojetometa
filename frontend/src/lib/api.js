// URL relativa: o FastAPI serve o app e a API na mesma origem em prod.
// Em dev, o Vite faz proxy de /api -> 127.0.0.1:8000 (ver vite.config.js).
export const API_BASE = "";

export function getToken() {
  return localStorage.getItem("auth_token") || "";
}

export function saveToken(t) {
  localStorage.setItem("auth_token", t);
}

export function clearToken() {
  localStorage.removeItem("auth_token");
}

export function authHeaders(extra) {
  return Object.assign({ Authorization: "Bearer " + getToken() }, extra || {});
}

// POST JSON util para auth (sem token, sem authHeaders).
export async function postJSON(path, body) {
  const resp = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await resp.json(); } catch { /* sem corpo */ }
  if (!resp.ok) throw new Error(data.detail || "Erro inesperado. Tente novamente.");
  return data;
}

// Wrap de fetch que dispara um redirect ao login se a sessão expirar (401).
// Devolve { resp, data } pra o caller tratar erros próprios.
export async function fetchAuth(path, init = {}) {
  const headers = authHeaders(init.headers);
  const resp = await fetch(API_BASE + path, { ...init, headers });
  if (resp.status === 401) {
    clearToken();
    window.location.replace("/login");
    throw new Error("Sessão expirada.");
  }
  let data = {};
  try { data = await resp.json(); } catch { /* sem corpo */ }
  return { resp, data };
}

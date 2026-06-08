// Hook compartilhado pelas paginas que precisam do overview + auth + token.
// Cuida de: auth guard, verificar se ha meta token, carregar /api/overview (com cache),
// expor flag from_cache, e fornecer refresh() pra forcar bypass do cache.

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  authMe, getAuthToken, clearAuthToken,
  getMetaTokenStatus, fetchOverview, getManualSaldo, setManualSaldo,
  type Client,
} from "@/lib/api/client";

export type Period = "last_7d" | "last_30d" | "last_90d";

export function useDashboard(period: Period = "last_30d") {
  const nav = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [manualSaldo, setManualSaldoState] = useState(() => getManualSaldo());

  useEffect(() => {
    if (!getAuthToken()) { nav({ to: "/login" }); return; }
    authMe().then((u) => { setUser(u); setAuthChecked(true); })
      .catch(() => nav({ to: "/login" }));
  }, [nav]);

  useEffect(() => {
    if (!authChecked) return;
    getMetaTokenStatus().then((s) => setTokenConfigured(s.configured))
      .catch(() => setTokenConfigured(false));
  }, [authChecked]);

  function load(force = false) {
    if (!authChecked || !tokenConfigured) return;
    setLoading(true); setError("");
    fetchOverview(period, true, force)
      .then((r) => { setClients(r.clients); setFromCache(!!r.from_cache); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (authChecked && tokenConfigured) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, tokenConfigured, period]);

  function logout() { clearAuthToken(); nav({ to: "/login" }); }

  function updateSaldo(accountId: string, valor: number, data: string) {
    const next = { ...manualSaldo, [accountId]: { valor, data } };
    setManualSaldo(next); setManualSaldoState(next);
  }
  function removeSaldo(accountId: string) {
    const next = { ...manualSaldo };
    delete next[accountId];
    setManualSaldo(next); setManualSaldoState(next);
  }

  return {
    user, authChecked, tokenConfigured,
    clients, loading, error, fromCache,
    refresh: () => load(true),
    logout, manualSaldo, updateSaldo, removeSaldo,
  };
}

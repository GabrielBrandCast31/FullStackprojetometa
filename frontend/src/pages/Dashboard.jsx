import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  authHeaders, clearToken, fetchAuth, API_BASE,
} from "../lib/api.js";
import { PERIOD_OPTIONS } from "../lib/constants.js";
import Topbar from "../components/Topbar.jsx";
import SaldoModal from "../components/SaldoModal.jsx";
import Overview from "../tabs/Overview.jsx";
import Clients from "../tabs/Clients.jsx";
import Campaigns from "../tabs/Campaigns.jsx";
import Charts from "../tabs/Charts.jsx";
import NewCampaign from "../tabs/NewCampaign.jsx";
import SaldoAlerts from "../tabs/SaldoAlerts.jsx";
import BrandLogo from "../components/BrandLogo.jsx";

const TABS = [
  ["overview", "Visão Geral", "📊"],
  ["clients", "Clientes", "👥"],
  ["saldo", "Alertas de saldo", "🔔"],
  ["campaigns", "Campanhas", "🎯"],
  ["charts", "Gráficos", "📈"],
  ["new-campaign", "Nova campanha", "➕"],
];

export default function Dashboard() {
  const nav = useNavigate();
  const [token, setToken] = useState(() => localStorage.getItem("meta_token") || "");
  const [period, setPeriod] = useState("last_30d");
  const [datePreset, setDatePreset] = useState("last_30d");
  const [clients, setClients] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [view, setView] = useState("overview");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ msg: "", type: "" });
  const [user, setUser] = useState(null);
  const [aiEnabled, setAiEnabled] = useState(false);

  // Saldo manual por conta — persistido em localStorage.
  const [manualSaldo, setManualSaldo] = useState(() => {
    try { return JSON.parse(localStorage.getItem("meta_saldo") || "{}"); }
    catch { return {}; }
  });
  // Estado do modal de saldo: null ou { accountId, name }.
  const [saldoEditing, setSaldoEditing] = useState(null);

  // Filtro pré-aplicado quando vem da aba Visão Geral (cliente clicado).
  const [campaignsPrefilter, setCampaignsPrefilter] = useState(null);

  // ---- valida token JWT na montagem e mostra nome do usuario logado
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(API_BASE + "/api/auth/me", { headers: authHeaders() });
        if (!resp.ok) throw new Error("unauthorized");
        const u = await resp.json();
        if (!cancelled) setUser(u);
      } catch {
        clearToken();
        nav("/login", { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [nav]);

  useEffect(() => {
    fetch(API_BASE + "/api/health")
      .then((r) => r.json())
      .then((h) => setAiEnabled(!!h.ai_enabled))
      .catch(() => setAiEnabled(false));
  }, []);

  const persistSaldo = useCallback((next) => {
    setManualSaldo(next);
    localStorage.setItem("meta_saldo", JSON.stringify(next));
  }, []);

  function setSaldo(accountId, valor, data) {
    persistSaldo({ ...manualSaldo, [accountId]: { valor, data } });
  }

  function removeSaldo(accountId) {
    const next = { ...manualSaldo };
    delete next[accountId];
    persistSaldo(next);
  }

  function logout() {
    clearToken();
    nav("/login", { replace: true });
  }

  async function loadOverview() {
    const t = token.trim();
    if (!t) {
      setStatus({ msg: "Informe o access token.", type: "error" });
      return;
    }
    localStorage.setItem("meta_token", t);
    setDatePreset(period);
    setLoading(true);
    setStatus({ msg: "Buscando todos os clientes na API do Meta... (pode levar de 20 a 60 segundos)", type: "" });

    try {
      const { resp, data } = await fetchAuth("/api/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: t, date_preset: period }),
      });
      if (!resp.ok) throw new Error(data.detail || "Erro ao carregar dados.");

      const cs = [];
      for (const cl of data.clients) {
        for (const c of cl.campaigns || []) {
          cs.push({ ...c, account_id: cl.account_id, client: cl.name, currency: cl.currency });
        }
      }
      setClients(data.clients);
      setCampaigns(cs);
      setLoaded(true);

      const erros = data.clients.filter((c) => c.error).length;
      setStatus({
        msg: `${data.clients.length} cliente(s) carregado(s).` +
          (erros ? ` ${erros} conta(s) com erro de acesso.` : ""),
        type: erros ? "" : "success",
      });
    } catch (err) {
      setStatus({ msg: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  }

  const accountCount = useMemo(() => (
    loaded ? `${clients.length} cliente(s) · ${campaigns.length} campanha(s)` : ""
  ), [loaded, clients.length, campaigns.length]);

  // Atalho da Visao Geral / Criticos -> aba Campanhas filtrada pelo cliente.
  function openClientCampaigns(clientName) {
    setCampaignsPrefilter({ client: clientName, status: "ALL" });
    setView("campaigns");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const sharedProps = {
    clients, campaigns, manualSaldo, datePreset,
    onEditSaldo: (id) => {
      const cl = clients.find((c) => c.account_id === id);
      setSaldoEditing(cl ? { accountId: id, name: cl.name } : null);
    },
    onOpenClient: openClientCampaigns,
    setStatus,
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <BrandLogo height={53} />
        </div>

        <nav className="sidebar-nav">
          {TABS.map(([id, label, icon]) => (
            <button
              key={id}
              className={"sidebar-item" + (view === id ? " active" : "")}
              onClick={() => { setView(id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={!loaded}
              title={!loaded ? "Carregue os clientes primeiro" : label}
            >
              <span className="sidebar-icon">{icon}</span>
              <span className="sidebar-label">{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          {user && (
            <div className="sidebar-user">
              <span className="sidebar-user-name">{user.name || user.email || ""}</span>
            </div>
          )}
          <button className="btn-ghost sidebar-logout" onClick={logout}>Sair</button>
        </div>
      </aside>

      <div className="app-main">
        <Topbar
          accountName={accountCount}
          userName={user ? (user.name || user.email || "") : ""}
          onLogout={logout}
        />

        <section className="panel connect-panel">
          <div className="field">
            <label htmlFor="token">Access Token do Facebook</label>
            <input
              type="password" id="token"
              placeholder="Cole aqui o seu access token" autoComplete="off"
              value={token} onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <div className="field field-sm">
            <label htmlFor="period">Período</label>
            <select id="period" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIOD_OPTIONS.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={loadOverview} disabled={loading}>
            Carregar clientes
          </button>
        </section>

        <p className={"status-msg" + (status.type ? " " + status.type : "")}>{status.msg}</p>

        {loaded && (
          <main id="dashboard">
            {view === "overview"     && <Overview {...sharedProps} aiEnabled={aiEnabled} />}
            {view === "clients"      && <Clients {...sharedProps} />}
            {view === "saldo"        && <SaldoAlerts {...sharedProps} />}
            {view === "campaigns"    && <Campaigns {...sharedProps}
                                          prefilter={campaignsPrefilter}
                                          onPrefilterConsumed={() => setCampaignsPrefilter(null)} />}
            {view === "charts"       && <Charts {...sharedProps} metaToken={token} onLogout={logout} />}
            {view === "new-campaign" && <NewCampaign {...sharedProps} metaToken={token} onLogout={logout} />}
          </main>
        )}

        {saldoEditing && (
          <SaldoModal
            accountId={saldoEditing.accountId}
            clientName={saldoEditing.name}
            current={manualSaldo[saldoEditing.accountId]}
            onClose={() => setSaldoEditing(null)}
            onSave={(valor, data) => { setSaldo(saldoEditing.accountId, valor, data); setSaldoEditing(null); }}
            onRemove={() => { removeSaldo(saldoEditing.accountId); setSaldoEditing(null); }}
          />
        )}

        <footer className="footer">
          O token é guardado apenas no seu navegador e enviado direto ao backend para consultar a API do Meta.
        </footer>
      </div>
    </div>
  );
}

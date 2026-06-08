import { useEffect, useMemo, useState } from "react";
import { money, num, roasClass, cpaClass, cpaMedian } from "../lib/format.js";
import { generateCampaignsReport } from "../lib/report.js";

function StatusTag({ status }) {
  if (status === "ACTIVE") return <span className="tag tag-active">Ativa</span>;
  if ((status || "").includes("PAUSED")) return <span className="tag tag-paused">Pausada</span>;
  const label = {
    ARCHIVED: "Arquivada", DELETED: "Excluída",
    IN_PROCESS: "Processando", WITH_ISSUES: "Com problemas",
  }[status] || status;
  return <span className="tag tag-other">{label}</span>;
}

export default function Campaigns({ campaigns, clients, prefilter, onPrefilterConsumed, datePreset, setStatus, onOpenCampaign }) {
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [clientFilter, setClientFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Consome pre-filtro vindo da Visao Geral (cliente clicado) ou da busca global da topbar.
  useEffect(() => {
    if (prefilter) {
      if (prefilter.client) setClientFilter(prefilter.client);
      if (prefilter.status) setStatusFilter(prefilter.status);
      if (typeof prefilter.search === "string") setSearch(prefilter.search);
      onPrefilterConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilter]);

  const clientOptions = useMemo(() => (
    [...new Set(clients.map((c) => c.name))].sort()
  ), [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (statusFilter === "ACTIVE" && c.status !== "ACTIVE") return false;
      if (statusFilter === "PAUSED" && !(c.status || "").includes("PAUSED")) return false;
      if (clientFilter !== "ALL" && c.client !== clientFilter) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => b.spend - a.spend);
  }, [campaigns, statusFilter, clientFilter, search]);

  // Mediana dos CPAs (>0) das campanhas filtradas — usada pra destacar os baixos.
  const cpaRef = useMemo(() => cpaMedian(filtered, "cost_per_result"), [filtered]);
  const convCpaRef = useMemo(() => cpaMedian(filtered, "cost_per_conversation"), [filtered]);

  return (
    <section id="view-campaigns" className="view">
      <section className="panel filters">
        <div className="field field-sm">
          <label htmlFor="filter-status">Status</label>
          <select
            id="filter-status" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ACTIVE">Apenas ativas</option>
            <option value="ALL">Todas</option>
            <option value="PAUSED">Pausadas</option>
          </select>
        </div>
        <div className="field field-sm">
          <label htmlFor="filter-client">Cliente</label>
          <select
            id="filter-client" value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="ALL">Todos os clientes</option>
            {clientOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-search">Buscar campanha</label>
          <input
            type="text" id="filter-search" placeholder="Filtrar por nome..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="filter-count">
          {filtered.length} de {campaigns.length} campanhas
        </span>
        <button
          className="btn-primary"
          onClick={() => generateCampaignsReport({
            campaigns: filtered, clients, datePreset,
            filters: { statusFilter, clientFilter, search },
            onError: (msg) => setStatus && setStatus({ msg, type: "error" }),
          })}
          disabled={!filtered.length}
        >
          📄 Baixar PDF
        </button>
      </section>

      <section className="panel table-panel">
        <h2>Campanhas</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campanha</th><th>Cliente</th><th>Status</th>
                <th>Orçamento</th><th>Investido</th>
                <th>Impressões</th><th>Alcance</th><th>Freq.</th>
                <th>Cliques</th><th>Cliques link</th>
                <th>CTR</th><th>CPM</th>
                <th>Resultados</th><th>Custo/Result.</th>
                <th>Conversas</th><th>Custo/Conversa</th>
                <th>Receita</th><th>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {!filtered.length && (
                <tr className="empty-row">
                  <td colSpan={18}>Nenhuma campanha para os filtros selecionados.</td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className="clickable-row"
                    onClick={() => onOpenCampaign && onOpenCampaign(c.id)}>
                  <td>{c.name}</td>
                  <td>{c.client}</td>
                  <td><StatusTag status={c.status} /></td>
                  <td>
                    {c.budget
                      ? <>{money(c.budget, c.currency)} <small>{c.budget_type}</small></>
                      : "—"}
                  </td>
                  <td>{money(c.spend, c.currency)}</td>
                  <td>{num(c.impressions)}</td>
                  <td>{num(c.reach)}</td>
                  <td>{(c.frequency || 0).toFixed(2)}</td>
                  <td>{num(c.clicks)}</td>
                  <td>{num(c.link_clicks)}</td>
                  <td>{c.ctr.toFixed(2)}%</td>
                  <td>{c.cpm ? money(c.cpm, c.currency) : "—"}</td>
                  <td>{num(c.results)} <small>{c.results_label}</small></td>
                  <td className={cpaClass(c.cost_per_result, cpaRef)}>
                    {c.cost_per_result ? money(c.cost_per_result, c.currency) : "—"}
                  </td>
                  <td>{num(c.conversations)}</td>
                  <td className={cpaClass(c.cost_per_conversation, convCpaRef)}>
                    {c.cost_per_conversation ? money(c.cost_per_conversation, c.currency) : "—"}
                  </td>
                  <td>{money(c.revenue, c.currency)}</td>
                  <td className={roasClass(c.roas)}>{c.roas.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

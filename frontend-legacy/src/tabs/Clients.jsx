import { useMemo } from "react";
import { money, num, roasClass, accountStatusLabel } from "../lib/format.js";
import { computeSaldo } from "../lib/saldo.js";
import { generateReport } from "../lib/report.js";

export default function Clients({
  clients, manualSaldo, datePreset, onEditSaldo, onOpenClient, setStatus,
}) {
  // Ordena por gasto decrescente (mais relevantes primeiro).
  const rows = useMemo(() => (
    clients
      .map((cl) => ({ cl, saldo: computeSaldo(cl, manualSaldo, datePreset) }))
      .sort((a, b) => b.cl.summary.total_spend - a.cl.summary.total_spend)
  ), [clients, manualSaldo, datePreset]);

  function runReport(accountId) {
    generateReport({
      clients, accountId, datePreset, manualSaldo,
      onError: (msg) => setStatus({ msg, type: "error" }),
    });
  }

  return (
    <section id="view-clients" className="view">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Clientes</h2>
            <p className="panel-hint">
              Uma conta de anúncios = um cliente. Clique em <strong>Saldo</strong> para
              cadastrar o valor recarregado e a data — o painel desconta o gasto e avisa
              quando estiver acabando.
            </p>
          </div>
          <button className="btn-primary" onClick={() => runReport(null)}>
            📄 Gerar relatório completo
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Status</th>
                <th>Campanhas</th>
                <th>Investido</th>
                <th>Receita</th>
                <th>ROAS</th>
                <th>Compras</th>
                <th>Saldo restante</th>
                <th>Origem</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr className="empty-row"><td colSpan={11}>Nenhum cliente.</td></tr>
              )}
              {rows.map(({ cl, saldo }) => {
                const s = cl.summary;
                return (
                  <tr key={cl.account_id}>
                    <td className="client-cell" onClick={() => onOpenClient(cl.name)}>
                      {cl.name}
                      {cl.error && <div className="row-error">⚠️ {cl.error}</div>}
                    </td>
                    <td>{accountStatusLabel(cl.account_status)}</td>
                    <td>
                      {num(s.total_campaigns)}{" "}
                      <small>{num(s.active_campaigns)} ativas</small>
                    </td>
                    <td>{money(s.total_spend, cl.currency)}</td>
                    <td>{money(s.total_revenue, cl.currency)}</td>
                    <td className={roasClass(s.roas)}>{s.roas.toFixed(2)}</td>
                    <td>{num(s.total_purchases)}</td>
                    <td>
                      {saldo.known ? (
                        <div className="saldo-cell">
                          <div className={"saldo-value " + saldo.level}>
                            {money(saldo.remaining, cl.currency)}
                          </div>
                          <div className="saldo-bar mini">
                            <span style={{ width: Math.min(saldo.consumedPct, 100) + "%" }} />
                          </div>
                        </div>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td><small>{saldo.source}</small></td>
                    <td>
                      <button className="btn-ghost" onClick={() => onEditSaldo(cl.account_id)}>
                        Saldo
                      </button>
                    </td>
                    <td>
                      <button className="btn-ghost" onClick={() => runReport(cl.account_id)}>
                        📄 Relatório
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

import { useEffect, useRef, useState } from "react";

export default function SaldoModal({ clientName, current, onClose, onSave, onRemove }) {
  const [valor, setValor] = useState(current ? current.valor : "");
  const [data, setData] = useState(
    current && current.data ? current.data : new Date().toISOString().slice(0, 10),
  );
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function save() {
    const v = parseFloat(valor);
    if (!v || v <= 0) { inputRef.current?.focus(); return; }
    onSave(v, data || "");
  }

  // Clicar no fundo cinza fecha o modal.
  function onBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="modal" onClick={onBackdrop}>
      <div className="modal-box">
        <h3>Saldo — {clientName}</h3>
        <p className="panel-hint">
          Informe o valor recarregado e a data. O painel subtrai o gasto do período
          selecionado a partir dessa data.
        </p>
        <div className="field">
          <label htmlFor="saldo-valor">Valor recarregado (R$)</label>
          <input
            ref={inputRef}
            type="number" id="saldo-valor" step="0.01" min="0" placeholder="ex: 3000"
            value={valor} onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>
        <div className="field">
          <label htmlFor="saldo-data">Data da recarga</label>
          <input
            type="date" id="saldo-data"
            value={data} onChange={(e) => setData(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onRemove}>Remover</button>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

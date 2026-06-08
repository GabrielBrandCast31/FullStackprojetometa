import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type Props = {
  clientName: string;
  current?: { valor: number; data: string };
  onClose: () => void;
  onSave: (valor: number, data: string) => void;
  onRemove: () => void;
};

export function SaldoModal({ clientName, current, onClose, onSave, onRemove }: Props) {
  const [valor, setValor] = useState(current?.valor ? String(current.valor) : "");
  const [data, setData] = useState(
    current?.data || new Date().toISOString().slice(0, 10),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function save() {
    const v = parseFloat(valor);
    if (!v || v <= 0) { inputRef.current?.focus(); return; }
    onSave(v, data);
  }

  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onBackdrop}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Saldo — {clientName}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Informe o valor recarregado e a data. O painel desconta o gasto do período a partir dela.
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-white/5">
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="saldo-valor" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Valor recarregado (R$)
            </label>
            <input
              ref={inputRef}
              id="saldo-valor" type="number" step="0.01" min="0" placeholder="ex: 3000"
              value={valor} onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label htmlFor="saldo-data" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Data da recarga
            </label>
            <input
              id="saldo-data" type="date"
              value={data} onChange={(e) => setData(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button onClick={onRemove}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-destructive hover:bg-destructive/10">
            Remover
          </button>
          <div className="flex-1" />
          <button onClick={onClose}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-white/5">
            Cancelar
          </button>
          <button onClick={save}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

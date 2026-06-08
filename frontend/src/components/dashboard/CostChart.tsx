import { useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fetchTimeseries, type Client } from "@/lib/api/client";

type Point = { day: string; spend: number; revenue: number };

type Props = { clients: Client[]; period?: string };

export function CostChart({ clients, period = "last_30d" }: Props) {
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clients.length) { setData([]); return; }
    let cancelled = false;
    setLoading(true);
    fetchTimeseries(clients.map((c) => c.account_id), period)
      .then((res) => {
        if (cancelled) return;
        const byDay = new Map<string, { spend: number; revenue: number }>();
        for (const acc of res.accounts) {
          for (const row of acc.rows) {
            const d = byDay.get(row.date_start) || { spend: 0, revenue: 0 };
            d.spend += parseFloat(row.spend || "0");
            for (const av of (row.action_values || [])) {
              if (av.action_type === "purchase" || av.action_type === "omni_purchase") {
                d.revenue += parseFloat(av.value || "0");
              }
            }
            byDay.set(row.date_start, d);
          }
        }
        const dates = [...byDay.keys()].sort();
        setData(dates.map((d) => ({ day: d.slice(5), ...byDay.get(d)! })));
      })
      .catch(() => {/* keep empty */})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clients, period]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border p-6">
        <h3 className="font-semibold">Investimento × Receita (diário)</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {loading ? "Carregando série diária..." : "Soma de todas as contas no período."}
        </p>
      </div>
      <div className="h-72 w-full p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.62 0.21 280)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="oklch(0.62 0.21 280)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.7 0.17 162)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="oklch(0.7 0.17 162)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.27 0.01 285)" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="day" stroke="oklch(0.62 0.01 285)" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="oklch(0.62 0.01 285)" fontSize={10} tickLine={false} axisLine={false}
              tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
            <Tooltip
              cursor={{ stroke: "oklch(0.62 0.21 280)", strokeWidth: 1, strokeDasharray: "4 4" }}
              contentStyle={{
                background: "oklch(0.185 0.005 285)", border: "1px solid oklch(0.27 0.01 285)",
                borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Mono, monospace",
              }}
              labelStyle={{ color: "oklch(0.985 0 0)", fontWeight: 600 }}
              formatter={(value: number, name) =>
                name === "spend"
                  ? [value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Investido"]
                  : [value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Receita"]
              }
            />
            <Area type="monotone" dataKey="spend" stroke="oklch(0.62 0.21 280)" strokeWidth={2} fill="url(#spendFill)" />
            <Area type="monotone" dataKey="revenue" stroke="oklch(0.7 0.17 162)" strokeWidth={2} fill="url(#revFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

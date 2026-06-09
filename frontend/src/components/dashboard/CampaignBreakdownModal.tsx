import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { X, Trophy, Crown, Award, Layers, Megaphone, TrendingDown, FileText } from "lucide-react";
import {
  fetchCampaignBreakdown, fmtMoney, fmtNum,
  type AdSet, type Ad, type Campaign,
} from "@/lib/api/client";
// @ts-expect-error report.js gerador PDF
import { generateCampaignReport } from "@/lib/report.js";

const tooltipStyle: React.CSSProperties = {
  background: "rgba(20, 17, 38, 0.96)", border: "1px solid rgba(139, 92, 246, 0.25)",
  borderRadius: 12, fontSize: 12, fontFamily: "IBM Plex Mono, monospace",
  padding: "8px 12px", boxShadow: "0 8px 24px -4px rgba(0,0,0,0.4)", backdropFilter: "blur(8px)",
};
const tipItem: React.CSSProperties = { color: "#f4f4f5" };
const tipLabel: React.CSSProperties = { color: "#a78bfa", fontWeight: 600, marginBottom: 4 };
const AXIS = "rgba(167, 139, 250, 0.55)";
const GRID = "rgba(167, 139, 250, 0.10)";
const axis = { stroke: AXIS, fontSize: 10, tickLine: false, axisLine: false, tick: { fill: AXIS } };

type Props = {
  campaign: Campaign;
  currency: string;
  period: string;
  onClose: () => void;
};

export function CampaignBreakdownModal({ campaign, currency, period, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adsets, setAdsets] = useState<AdSet[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    fetchCampaignBreakdown(campaign.id, period)
      .then((r) => { if (!cancelled) { setAdsets(r.adsets); setAds(r.ads); } })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaign.id, period]);

  // ESC fecha
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Campeão: anúncio com mais resultados (desempate por ROAS).
  const champion = useMemo(() => {
    const withResults = ads.filter((a) => a.results > 0);
    if (withResults.length)
      return [...withResults].sort((a, b) => b.results - a.results || b.roas - a.roas)[0];
    const withSpend = ads.filter((a) => a.spend > 0);
    return withSpend.length ? [...withSpend].sort((a, b) => b.roas - a.roas)[0] : null;
  }, [ads]);

  // Ranking: anúncios com gasto, ordenados por menor custo por resultado.
  const cpaRanking = useMemo(() =>
    ads.filter((a) => a.cost_per_result > 0)
      .sort((a, b) => a.cost_per_result - b.cost_per_result)
      .slice(0, 8),
  [ads]);

  // Conjuntos com gasto, pra gráficos.
  const adsetData = useMemo(() =>
    [...adsets].filter((a) => a.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 8)
      .map((a) => ({
        name: a.name.length > 22 ? a.name.slice(0, 20) + "…" : a.name,
        investido: a.spend, resultados: a.results, roas: a.roas,
      })),
  [adsets]);

  const adData = useMemo(() =>
    [...ads].filter((a) => a.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 10)
      .map((a) => ({
        name: a.name.length > 22 ? a.name.slice(0, 20) + "…" : a.name,
        investido: a.spend, resultados: a.results,
      })),
  [ads]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-full w-full max-w-5xl overflow-y-auto border-l border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky */}
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-background/95 px-6 py-5 backdrop-blur">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Detalhe da Campanha</div>
            <h2 className="mt-0.5 truncate text-2xl font-bold tracking-tight">{campaign.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{adsets.length} conjunto(s)</span><span>·</span>
              <span>{ads.length} anúncio(s)</span><span>·</span>
              <span className="font-mono">{fmtMoney(campaign.spend, currency)} investido</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => generateCampaignReport({
                campaign, adsets, ads, datePreset: period, currency,
                onError: (m: string) => alert(m),
              })}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/20 disabled:opacity-50">
              <FileText className="size-4" /> Relatório PDF
            </button>
            <button onClick={onClose} className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground">
              <X className="size-5" />
            </button>
          </div>
        </header>

        <div className="space-y-6 p-6">
          {loading && (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Carregando conjuntos e anúncios do Meta...
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
          )}

          {!loading && !error && (
            <>
              {/* CAMPEÃO */}
              {champion && (
                <section className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-6">
                  <div className="absolute right-4 top-4 opacity-20">
                    <Crown className="size-20 text-primary" />
                  </div>
                  <div className="flex items-center gap-2 text-primary">
                    <Crown className="size-5" />
                    <span className="text-xs font-bold uppercase tracking-widest">Anúncio Campeão</span>
                  </div>
                  <h3 className="mt-3 text-xl font-bold">{champion.name}</h3>
                  <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                    <ChampStat label="Resultados" value={fmtNum(champion.results)} accent />
                    <ChampStat label="Custo/Result." value={champion.cost_per_result ? fmtMoney(champion.cost_per_result, currency) : "—"} />
                    <ChampStat label="ROAS" value={`${champion.roas.toFixed(2)}x`} />
                    <ChampStat label="Investido" value={fmtMoney(champion.spend, currency)} />
                  </div>
                </section>
              )}

              {/* RANKING CPA (sempre) */}
              <section className="rounded-2xl border border-border/60 bg-card/80 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <TrendingDown className="size-4 text-success" />
                  <h3 className="text-sm font-semibold tracking-tight">Ranking — Menor Custo por Resultado</h3>
                </div>
                {cpaRanking.length ? (
                  <ol className="space-y-2">
                    {cpaRanking.map((a, i) => {
                      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`;
                      const best = i === 0;
                      return (
                        <li key={a.id}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                            best ? "border-success/40 bg-success/5" : "border-border/50 bg-background/40"
                          }`}>
                          <span className="w-8 shrink-0 text-center text-sm font-bold">{medal}</span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{a.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {fmtNum(a.results)} {a.results_label} · {fmtMoney(a.spend, currency)} investido · ROAS {a.roas.toFixed(2)}x
                            </div>
                          </div>
                          <div className={`shrink-0 text-right font-mono text-lg font-bold tabular-nums ${best ? "text-success" : ""}`}>
                            {fmtMoney(a.cost_per_result, currency)}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum anúncio com custo por resultado calculável (sem conversões ainda).</p>
                )}
              </section>

              {/* CONJUNTOS */}
              <section className="rounded-2xl border border-border/60 bg-card/80 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold tracking-tight">Performance por Conjunto</h3>
                </div>
                {adsetData.length ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={adsetData} margin={{ top: 8, right: 8, left: -8, bottom: 55 }}>
                        <defs>
                          <linearGradient id="bdSpend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a78bfa" stopOpacity={1} />
                            <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.8} />
                          </linearGradient>
                          <linearGradient id="bdRes" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#86efac" stopOpacity={1} />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.8} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                        <XAxis dataKey="name" {...axis} fontSize={9} angle={-30} textAnchor="end" height={60} interval={0} />
                        <YAxis yAxisId="l" {...axis} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                        <YAxis yAxisId="r" orientation="right" {...axis} />
                        <Tooltip contentStyle={tooltipStyle} itemStyle={tipItem} labelStyle={tipLabel}
                          cursor={{ fill: "rgba(139,92,246,0.06)" }}
                          formatter={(v: number, n) => n === "investido" ? [fmtMoney(v, currency), "Investido"] : [fmtNum(v), "Resultados"]} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
                        <Bar yAxisId="l" dataKey="investido" name="Investido" fill="url(#bdSpend)" radius={[6, 6, 0, 0]} />
                        <Bar yAxisId="r" dataKey="resultados" name="Resultados" fill="url(#bdRes)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-sm text-muted-foreground">Sem conjuntos com gasto no período.</p>}
                <EntityTable entities={adsets} currency={currency} kind="adset" />
              </section>

              {/* ANÚNCIOS */}
              <section className="rounded-2xl border border-border/60 bg-card/80 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Megaphone className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold tracking-tight">Performance por Anúncio</h3>
                </div>
                {adData.length ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={adData} margin={{ top: 8, right: 8, left: -8, bottom: 55 }}>
                        <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                        <XAxis dataKey="name" {...axis} fontSize={9} angle={-30} textAnchor="end" height={60} interval={0} />
                        <YAxis {...axis} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={tooltipStyle} itemStyle={tipItem} labelStyle={tipLabel}
                          cursor={{ fill: "rgba(139,92,246,0.06)" }}
                          formatter={(v: number, n) => n === "investido" ? [fmtMoney(v, currency), "Investido"] : [fmtNum(v), "Resultados"]} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
                        <Bar dataKey="investido" name="Investido" fill="url(#bdSpend)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="resultados" name="Resultados" fill="url(#bdRes)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-sm text-muted-foreground">Sem anúncios com gasto no período.</p>}
                <EntityTable entities={ads} currency={currency} kind="ad" champion={champion?.id} />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ChampStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-xl font-bold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function EntityTable({ entities, currency, kind, champion }: {
  entities: (AdSet | Ad)[]; currency: string; kind: "adset" | "ad"; champion?: string;
}) {
  const rows = [...entities].sort((a, b) => b.spend - a.spend);
  // Menor CPA da lista pra destacar.
  const cpas = rows.filter((r) => r.cost_per_result > 0).map((r) => r.cost_per_result);
  const minCpa = cpas.length ? Math.min(...cpas) : 0;
  if (!rows.length) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 font-medium">{kind === "adset" ? "Conjunto" : "Anúncio"}</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Investido</th>
            <th className="px-3 py-2 text-right font-medium">Result.</th>
            <th className="px-3 py-2 text-right font-medium">Custo/Result.</th>
            <th className="px-3 py-2 text-right font-medium">ROAS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((r) => {
            const isActive = r.status === "ACTIVE";
            const isChamp = champion && r.id === champion;
            const bestCpa = r.cost_per_result > 0 && r.cost_per_result === minCpa;
            return (
              <tr key={r.id} className={isChamp ? "bg-primary/5" : ""}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 font-medium">
                    {isChamp && <Trophy className="size-3.5 text-primary" />}
                    <span className="truncate">{r.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    isActive ? "bg-success/10 text-success" : "bg-white/5 text-muted-foreground"
                  }`}>{isActive ? "Ativa" : "Pausada"}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtMoney(r.spend, currency)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtNum(r.results)}</td>
                <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${bestCpa ? "font-bold text-success" : ""}`}>
                  {r.cost_per_result ? <>{bestCpa && <Award className="mr-1 inline size-3" />}{fmtMoney(r.cost_per_result, currency)}</> : "—"}
                </td>
                <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${r.roas >= 2 ? "text-success" : r.roas < 1 ? "text-destructive" : ""}`}>
                  {r.roas.toFixed(2)}x
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

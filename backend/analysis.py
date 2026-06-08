"""Processamento de campanhas e motor de analise local (sem IA).

- build_campaigns: cruza campanhas + insights e calcula metricas derivadas.
- build_summary: KPIs agregados.
- previous_period_range: calcula o periodo anterior equivalente (pra trend %).
- auto_insights: insights automaticos por regras.
- analyze_question: respostas a perguntas em texto livre (fallback sem IA).
"""

from datetime import date, timedelta

# Tipos de acao do Meta que representam compra (em ordem de preferencia).
PURCHASE_TYPES = [
    "omni_purchase",
    "purchase",
    "offsite_conversion.fk_purchase",
    "onsite_web_purchase",
]
# Tipos de acao que representam leads.
LEAD_TYPES = [
    "lead",
    "offsite_conversion.fk_lead",
    "onsite_conversion.lead_grouped",
]
# Tipos de acao do Meta que representam "conversa iniciada" (WhatsApp/Messenger).
# Comum em campanhas com objetivo de mensagens.
CONVERSATION_TYPES = [
    "onsite_conversion.messaging_conversation_started_7d",
    "messaging_conversation_started_7d",
    "onsite_conversion.total_messaging_connection",
]
# Separadores usados para extrair o "cliente" do nome da campanha.
SEPARATORS = [" | ", " - ", " — ", " – ", " :: ", " > "]


def _to_float(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _action_value(actions, types) -> float:
    """Retorna o valor da primeira acao encontrada entre os tipos pedidos."""
    if not actions:
        return 0.0
    by_type = {a.get("action_type"): _to_float(a.get("value")) for a in actions}
    for t in types:
        if t in by_type:
            return by_type[t]
    return 0.0


def extract_client(name: str) -> str:
    """Deriva o nome do cliente a partir de um prefixo no nome da campanha.

    Ex.: 'ACME | Black Friday' -> 'ACME'. Sem separador -> 'Sem cliente'.
    """
    if not name:
        return "Sem cliente"
    for sep in SEPARATORS:
        if sep in name:
            prefix = name.split(sep)[0].strip()
            if prefix and len(prefix) <= 40:
                return prefix.upper()
    return "Sem cliente"


def build_campaigns(raw_campaigns: list[dict], raw_insights: list[dict]) -> list[dict]:
    """Cruza a lista de campanhas com os insights e monta os objetos finais."""
    insights_by_id = {i.get("campaign_id"): i for i in raw_insights}
    result = []

    for c in raw_campaigns:
        ins = insights_by_id.get(c.get("id"), {})

        spend = _to_float(ins.get("spend"))
        actions = ins.get("actions", [])
        action_values = ins.get("action_values", [])

        purchases = _action_value(actions, PURCHASE_TYPES)
        leads = _action_value(actions, LEAD_TYPES)
        link_clicks = _action_value(actions, ["link_click"])
        conversations = _action_value(actions, CONVERSATION_TYPES)
        revenue = _action_value(action_values, PURCHASE_TYPES)

        roas_list = ins.get("purchase_roas") or []
        if roas_list:
            roas = _to_float(roas_list[0].get("value"))
        else:
            roas = revenue / spend if spend else 0.0

        # Orcamento: vem em centavos. Pode estar na campanha (CBO) ou nos conjuntos.
        daily = _to_float(c.get("daily_budget"))
        lifetime = _to_float(c.get("lifetime_budget"))
        if daily:
            budget, budget_type = daily / 100, "Diário"
        elif lifetime:
            budget, budget_type = lifetime / 100, "Total"
        else:
            budget, budget_type = 0.0, "Por conjunto"

        # "Resultados" = conversoes reais (compras > leads). Sem isso, fica zero.
        # `link_clicks` segue exposto separadamente — nao entra como fallback aqui
        # para nao inflar artificialmente a metrica de conversao.
        if purchases:
            results, results_label = purchases, "Compras"
        elif leads:
            results, results_label = leads, "Leads"
        else:
            results, results_label = 0.0, "—"

        cpa = spend / results if results else 0.0
        cost_per_conversation = spend / conversations if conversations else 0.0
        # Taxa de conversao: resultados sobre cliques (proxy de eficiencia do funil).
        conv_rate = results / clicks * 100 if (clicks := int(_to_float(ins.get("clicks")))) else 0.0

        result.append({
            "id": c.get("id"),
            "name": c.get("name", "(sem nome)"),
            "client": extract_client(c.get("name", "")),
            "status": c.get("effective_status") or c.get("status") or "UNKNOWN",
            "objective": c.get("objective", ""),
            "budget": round(budget, 2),
            "budget_type": budget_type,
            "start_time": c.get("start_time", ""),
            "stop_time": c.get("stop_time", ""),
            "spend": round(spend, 2),
            "impressions": int(_to_float(ins.get("impressions"))),
            "clicks": int(_to_float(ins.get("clicks"))),
            "link_clicks": int(_to_float(ins.get("inline_link_clicks")) or link_clicks),
            "reach": int(_to_float(ins.get("reach"))),
            "frequency": round(_to_float(ins.get("frequency")), 2),
            "ctr": round(_to_float(ins.get("ctr")), 2),
            "cpc": round(_to_float(ins.get("cpc")), 2),
            "cpm": round(_to_float(ins.get("cpm")), 2),
            "purchases": round(purchases, 2),
            "leads": round(leads, 2),
            "conversations": round(conversations, 2),
            "cost_per_conversation": round(cost_per_conversation, 2),
            "revenue": round(revenue, 2),
            "roas": round(roas, 2),
            "results": round(results, 2),
            "results_label": results_label,
            "cpa": round(cpa, 2),
            "cost_per_result": round(cpa, 2),
            "conv_rate": round(conv_rate, 2),
            "attribution_setting": ins.get("attribution_setting", ""),
        })

    return result


def previous_period_range(date_preset: str) -> dict | None:
    """Calcula o `time_range` (since/until em ISO) do periodo anterior
    equivalente ao `date_preset`, pra comparar e exibir % de tendencia.

    Exemplos (hoje = D):
      - last_7d  cobre  D-7..D-1   ->  previous: D-14..D-8
      - last_30d cobre  D-30..D-1  ->  previous: D-60..D-31
      - today    cobre  D          ->  previous: D-1 (ontem)

    Periodos sem janela fixa (this_month, last_month, maximum) retornam None
    e o trend nao eh calculado nesses casos.
    """
    today = date.today()
    days_map = {
        "today": 1, "yesterday": 1,
        "last_7d": 7, "last_14d": 14,
        "last_30d": 30, "last_90d": 90,
    }
    days = days_map.get(date_preset)
    if not days:
        return None
    end = today - timedelta(days=days + 1)
    start = end - timedelta(days=days - 1)
    return {"since": start.isoformat(), "until": end.isoformat()}


def build_summary(campaigns: list[dict]) -> dict:
    """KPIs agregados de um conjunto de campanhas."""
    active = [c for c in campaigns if c["status"] == "ACTIVE"]
    total_spend = sum(c["spend"] for c in campaigns)
    total_revenue = sum(c["revenue"] for c in campaigns)
    total_purchases = sum(c["purchases"] for c in campaigns)
    total_results = sum(c.get("results", 0) for c in campaigns)
    total_conversations = sum(c.get("conversations", 0) for c in campaigns)
    total_impressions = sum(c["impressions"] for c in campaigns)
    total_clicks = sum(c["clicks"] for c in campaigns)
    total_link_clicks = sum(c.get("link_clicks", 0) for c in campaigns)

    return {
        "total_campaigns": len(campaigns),
        "active_campaigns": len(active),
        "total_spend": round(total_spend, 2),
        "total_revenue": round(total_revenue, 2),
        "total_purchases": round(total_purchases, 2),
        "total_results": round(total_results, 2),
        "total_conversations": round(total_conversations, 2),
        "total_impressions": total_impressions,
        "total_clicks": total_clicks,
        "total_link_clicks": total_link_clicks,
        "roas": round(total_revenue / total_spend, 2) if total_spend else 0.0,
        "avg_ctr": round(total_clicks / total_impressions * 100, 2) if total_impressions else 0.0,
        "cpa": round(total_spend / total_results, 2) if total_results else 0.0,
        "cost_per_conversation": round(total_spend / total_conversations, 2) if total_conversations else 0.0,
    }


def _money(v) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def auto_insights(campaigns: list[dict]) -> list[str]:
    """Gera insights automaticos por regras simples."""
    insights: list[str] = []
    with_spend = [c for c in campaigns if c["spend"] > 0]

    if not with_spend:
        insights.append("Nenhuma campanha registrou investimento no período selecionado.")
        return insights

    s = build_summary(campaigns)
    insights.append(
        f"💰 Investimento total de {_money(s['total_spend'])} em "
        f"{len(with_spend)} campanha(s) com entrega."
    )
    insights.append(
        f"📈 ROAS geral de {s['roas']:.2f} — receita de {_money(s['total_revenue'])} "
        f"e {int(s['total_purchases'])} compra(s)."
    )

    best = max(with_spend, key=lambda c: c["roas"])
    if best["roas"] > 0:
        insights.append(f"🏆 Melhor ROAS: \"{best['name']}\" ({best['roas']:.2f}).")

    low = [c for c in with_spend if c["roas"] < 1]
    if low:
        worst = min(low, key=lambda c: c["roas"])
        wasted = sum(c["spend"] for c in low)
        insights.append(
            f"⚠️ {len(low)} campanha(s) com ROAS abaixo de 1 (total de {_money(wasted)}). "
            f"Pior: \"{worst['name']}\" ({worst['roas']:.2f})."
        )

    no_conv = [c for c in with_spend if c["purchases"] == 0]
    if no_conv:
        wasted = sum(c["spend"] for c in no_conv)
        insights.append(
            f"🚫 {len(no_conv)} campanha(s) gastaram {_money(wasted)} sem registrar compras."
        )

    scalable = [c for c in with_spend if c["roas"] >= 3 and c["purchases"] > 0]
    if scalable:
        names = ", ".join(f"\"{c['name']}\"" for c in scalable[:3])
        insights.append(f"🚀 Candidatas a escalar (ROAS ≥ 3): {names}.")

    return insights


def analyze_question(question: str, campaigns: list[dict]) -> str:
    """Motor de analise local (fallback quando nao ha IA configurada).

    Interpreta a pergunta por palavras-chave e devolve uma resposta em texto.
    """
    q = (question or "").lower()
    if not campaigns:
        return "Não há campanhas carregadas para analisar. Carregue o dashboard primeiro."

    with_spend = [c for c in campaigns if c["spend"] > 0]
    s = build_summary(campaigns)

    def linhas(cs, key, reverse=True, n=5):
        ordenadas = sorted(cs, key=lambda c: c[key], reverse=reverse)[:n]
        return "\n".join(
            f"- **{c['name']}** — ROAS {c['roas']:.2f} · investido {_money(c['spend'])} "
            f"· {int(c['purchases'])} compra(s) · CPA {_money(c['cpa'])}"
            for c in ordenadas
        )

    if any(k in q for k in ["melhor", "top", "destaque", "campeã", "campea", "escalar"]):
        return (
            "**Campanhas de melhor desempenho (por ROAS):**\n\n"
            + (linhas(with_spend, "roas") or "Sem campanhas com investimento.")
        )

    if any(k in q for k in ["pior", "ruim", "baixo", "desperd", "cortar", "pausar"]):
        ruins = [c for c in with_spend if c["roas"] < 1] or with_spend
        return (
            "**Campanhas que merecem atenção (menor ROAS):**\n\n"
            + linhas(ruins, "roas", reverse=False)
            + "\n\nConsidere revisar criativos, público ou pausar as de pior retorno."
        )

    if any(k in q for k in ["cliente"]):
        por_cliente: dict[str, dict] = {}
        for c in campaigns:
            d = por_cliente.setdefault(c["client"], {"spend": 0.0, "revenue": 0.0, "n": 0})
            d["spend"] += c["spend"]
            d["revenue"] += c["revenue"]
            d["n"] += 1
        partes = []
        for nome, d in sorted(por_cliente.items(), key=lambda x: x[1]["spend"], reverse=True):
            roas = d["revenue"] / d["spend"] if d["spend"] else 0
            partes.append(
                f"- **{nome}** — {d['n']} campanha(s) · investido {_money(d['spend'])} "
                f"· ROAS {roas:.2f}"
            )
        return "**Desempenho por cliente:**\n\n" + "\n".join(partes)

    if any(k in q for k in ["gasto", "investi", "orçament", "orcament", "custo", "verba"]):
        return (
            f"**Investimento total:** {_money(s['total_spend'])}\n"
            f"**Receita gerada:** {_money(s['total_revenue'])}\n"
            f"**ROAS geral:** {s['roas']:.2f}\n"
            f"**CPA médio:** {_money(s['cpa'])}\n\n"
            "**Maiores investimentos:**\n" + linhas(with_spend, "spend")
        )

    if any(k in q for k in ["compra", "venda", "conversã", "conversao", "receita", "fatura", "roas"]):
        return (
            f"**Total de compras:** {int(s['total_purchases'])}\n"
            f"**Receita:** {_money(s['total_revenue'])}\n"
            f"**ROAS geral:** {s['roas']:.2f}\n\n"
            "**Campanhas por ROAS:**\n" + linhas(with_spend, "roas")
        )

    # Resposta padrao: resumo geral + insights automaticos.
    return (
        f"**Resumo do período**\n\n"
        f"- Campanhas: {s['total_campaigns']} ({s['active_campaigns']} ativas)\n"
        f"- Investido: {_money(s['total_spend'])}\n"
        f"- Receita: {_money(s['total_revenue'])}\n"
        f"- ROAS geral: {s['roas']:.2f}\n"
        f"- Compras: {int(s['total_purchases'])} · CPA {_money(s['cpa'])}\n"
        f"- CTR médio: {s['avg_ctr']:.2f}%\n\n"
        "**Insights automáticos**\n\n"
        + "\n".join(f"- {i}" for i in auto_insights(campaigns))
    )

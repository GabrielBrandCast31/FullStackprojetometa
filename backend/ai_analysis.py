"""Analise de performance com IA (Claude API / Anthropic SDK).

Usado pelo endpoint /api/analyze. Se ANTHROPIC_API_KEY nao estiver configurada,
is_available() retorna False e o app cai no motor local (analysis.analyze_question).
"""

import json
import os

from anthropic import AsyncAnthropic, APIError

DEFAULT_MODEL = "claude-opus-4-7"

# Prompt do sistema: estavel entre requisicoes -> marcado para cache (prompt caching).
SYSTEM_PROMPT = """Você é um analista sênior de tráfego pago, especialista em Meta Ads \
(Facebook/Instagram Ads). Você recebe dados reais de campanhas de uma conta de anúncios \
e responde perguntas do gestor sobre performance.

Diretrizes:
- Responda SEMPRE em português do Brasil.
- Baseie-se exclusivamente nos dados fornecidos no JSON. Não invente números.
- Seja direto e prático: traga diagnósticos e recomendações acionáveis, não só descrições.
- Cite campanhas pelo nome e use os números (ROAS, investido, CPA, CTR, compras) para sustentar cada ponto.
- Valores monetários estão na moeda informada no campo "moeda". Formate como "R$ 1.234,56".
- Use Markdown: títulos curtos, listas e **negrito** nos pontos-chave.
- Quando fizer sentido, aponte campanhas para escalar, otimizar ou pausar, com a justificativa.
- Se a pergunta não puder ser respondida com os dados, diga isso claramente."""


def is_available() -> bool:
    """True se ha uma chave da Anthropic configurada no ambiente."""
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def _model() -> str:
    return os.getenv("ANTHROPIC_MODEL") or DEFAULT_MODEL


async def analyze_with_ai(question: str, campaigns: list[dict], currency: str = "BRL") -> str:
    """Envia os dados das campanhas + a pergunta para o Claude e devolve a analise.

    Levanta RuntimeError se a chave nao estiver configurada e APIError em falhas
    da API (tratadas pelo chamador para cair no fallback local).
    """
    if not is_available():
        raise RuntimeError("ANTHROPIC_API_KEY não configurada.")

    client = AsyncAnthropic()  # le ANTHROPIC_API_KEY do ambiente
    dados = json.dumps(
        {"moeda": currency or "BRL", "campanhas": campaigns},
        ensure_ascii=False,
        indent=2,
    )

    response = await client.messages.create(
        model=_model(),
        max_tokens=4096,
        thinking={"type": "adaptive"},  # Claude decide quando/quanto pensar
        # System estavel -> cacheado. Reduz custo quando varias perguntas usam o mesmo prompt.
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{
            "role": "user",
            "content": [
                # Os dados das campanhas se repetem entre perguntas da mesma sessao -> cacheados.
                {
                    "type": "text",
                    "text": f"Dados das campanhas (JSON):\n{dados}",
                    "cache_control": {"type": "ephemeral"},
                },
                {"type": "text", "text": f"Pergunta do gestor: {question}"},
            ],
        }],
    )

    # Em Opus 4.7 o bloco 'thinking' vem vazio por padrao; pegamos apenas o texto.
    texto = "".join(b.text for b in response.content if b.type == "text").strip()
    return texto or "Não consegui gerar uma análise para essa pergunta."


__all__ = ["analyze_with_ai", "is_available", "APIError"]

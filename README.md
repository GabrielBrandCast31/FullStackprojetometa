# Dashboard Meta Ads

App para analisar campanhas do Meta Ads (Facebook/Instagram). Você cola o seu
access token, o app busca as campanhas pela API do Meta e monta um dashboard com
nome, status, orçamento, resultados, compras, ROAS e demais métricas — com
filtros e um campo de perguntas para análise inteligente.

- **Frontend:** HTML, CSS e JavaScript puro (`frontend/`)
- **Backend:** FastAPI / Python (`backend/`)
- **Análise:** Claude API (Anthropic) com fallback para um motor de regras local

## Como rodar

Pré-requisito: Python 3.10+.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # edite o .env conforme abaixo
python main.py
```

Abra **http://127.0.0.1:8010** no navegador.

## Configuração (`backend/.env`)

| Variável            | Para que serve                                                        |
|---------------------|-----------------------------------------------------------------------|
| `META_API_VERSION`  | Versão da Graph API do Meta. Ajuste se a Meta descontinuar a versão.  |
| `ANTHROPIC_API_KEY` | Chave da Claude API. Com ela, o campo de perguntas usa IA de verdade. |
| `ANTHROPIC_MODEL`   | Modelo do Claude (padrão `claude-opus-4-7`).                          |

Sem `ANTHROPIC_API_KEY`, o app continua funcionando: a análise usa o motor de
regras local (insights automáticos, melhores/piores campanhas, desperdício etc.).

## Usando o app

1. Cole o **access token** do Facebook e confirme o **ID da conta** de anúncios.
2. Escolha o **período** e clique em **Carregar campanhas**.
3. Use os filtros: **status** (padrão "Apenas ativas"), **cliente** e busca por nome.
4. No bloco **Análise inteligente**, faça perguntas sobre as campanhas filtradas.

O **cliente** é derivado automaticamente do nome da campanha, pelo prefixo antes
de um separador (` | `, ` - `, ` :: ` etc.). Ex.: `ACME | Black Friday` → cliente `ACME`.

## Segurança

- O access token **não fica no código**. É digitado por você, guardado apenas no
  `localStorage` do navegador e enviado ao backend só na hora da consulta.
- O backend não persiste o token em disco.
- **Recomendado:** se um token foi compartilhado fora de um canal seguro, gere um
  novo no [Gerenciador de Negócios / Graph API Explorer](https://developers.facebook.com/tools/explorer/).

## Estrutura

```
DashboardMeta/
├── backend/
│   ├── main.py            # API FastAPI + serve o frontend
│   ├── meta_client.py     # chamadas à Graph API do Meta
│   ├── analysis.py        # processamento + motor de análise local
│   ├── ai_analysis.py     # análise com a Claude API
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
```

## Permissões do token

O access token precisa ter acesso de leitura à conta de anúncios
(`ads_read`). Use um token do app/usuário com permissão na conta informada.

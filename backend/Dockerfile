# Imagem enxuta (Python 3.11 slim) — backend FastAPI + Marketing API client.
FROM python:3.11-slim

# Variaveis padrao do Python pra container:
# - PYTHONUNBUFFERED: log do uvicorn aparece em tempo real
# - PYTHONDONTWRITEBYTECODE: nao polui o filesystem com .pyc
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Camada separada para dependencias (cacheia melhor entre builds).
COPY requirements.txt .
RUN pip install -r requirements.txt

# Codigo da aplicacao. Os arquivos sensiveis (.env, users.db) ficam fora
# da imagem via .dockerignore — entram no runtime via env_file e volume.
COPY . .

EXPOSE 8000

# Hostname 0.0.0.0 para aceitar conexoes vindas da rede do Docker
# (o nginx do container "frontend" bate aqui via http://backend:8000).
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

<<<<<<< HEAD
# Markdown AI Studio

Markdown AI Studio is a full-stack MVP for generating, editing, previewing, saving, and exporting Markdown with an OpenAI-compatible vLLM endpoint running on an H200 GPU server.

## Stack

- Frontend: Next.js, TypeScript, Tailwind CSS, CodeMirror, react-markdown, remark-gfm
- Backend: FastAPI, SQLAlchemy, PostgreSQL
- AI inference: OpenAI-compatible `/v1/chat/completions` endpoint from vLLM
- TOR template learning: upload PDF/DOCX/TXT/Markdown TORs by company, extract sections, learn reusable profiles, retrieve examples, and generate new TORs
- Vector search: Qdrant with embeddings from an OpenAI-compatible `/v1/embeddings` endpoint
- Export: Markdown download in the browser and PDF rendering through FastAPI
- Runtime: Docker Compose

## Project Structure

```text
frontend/
backend/
docker-compose.yml
README.md
.env.example
```

## Environment

Copy the example file and edit values for your environment:

```bash
cp .env.example .env
```

Key settings:

```env
OPENAI_API_BASE=http://h200-server:8000/v1
OPENAI_API_KEY=
MODEL_NAME=your-model-name
EMBEDDING_MODEL=BAAI/bge-m3
VECTOR_DB_URL=http://qdrant:6333
MAX_UPLOAD_SIZE_MB=25
DATABASE_URL=postgresql://postgres:postgres@db:5432/markdown_ai
```

`OPENAI_API_KEY` is optional. Use it if your vLLM OpenAI-compatible server enforces bearer authentication. The backend still accepts the older `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` names for compatibility.

## Run With Docker Compose

```bash
docker compose up --build
```

The app uses SQLAlchemy `create_all` on backend startup, so the TOR tables are created automatically when the backend starts. For this repo, the migration/startup command is:

```bash
docker compose up --build backend
```

Open the app at:

```text
http://localhost:3000
```

FastAPI is available at:

```text
http://localhost:8000/docs
```

## Run Backend Locally

Start PostgreSQL first, then from `backend/`:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/markdown_ai
export OPENAI_API_BASE=http://h200-server:8000/v1
export MODEL_NAME=your-model-name
export EMBEDDING_MODEL=BAAI/bge-m3
export VECTOR_DB_URL=http://localhost:6333
uvicorn app.main:app --reload --port 8000
```

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/markdown_ai"
$env:OPENAI_API_BASE="http://h200-server:8000/v1"
$env:MODEL_NAME="your-model-name"
$env:EMBEDDING_MODEL="BAAI/bge-m3"
$env:VECTOR_DB_URL="http://localhost:6333"
uvicorn app.main:app --reload --port 8000
```

## Run Frontend Locally

From `frontend/`:

```bash
npm install
BACKEND_INTERNAL_URL=http://localhost:8000 npm run dev
```

On Windows PowerShell:

```powershell
npm install
$env:BACKEND_INTERNAL_URL="http://localhost:8000"
npm run dev
```

Open:

```text
http://localhost:3000
```

## Configure The H200 vLLM Endpoint

The backend calls an OpenAI-compatible chat completions endpoint:

```text
POST ${OPENAI_API_BASE}/chat/completions
POST ${OPENAI_API_BASE}/embeddings
```

Example vLLM command:

```bash
python -m vllm.entrypoints.openai.api_server \
  --model /models/your-model \
  --served-model-name your-model-name \
  --host 0.0.0.0 \
  --port 8000 \
  --tensor-parallel-size 1 \
  --gpu-memory-utilization 0.9
```

Set the application values to match:

```env
OPENAI_API_BASE=http://h200-server:8000/v1
MODEL_NAME=your-model-name
EMBEDDING_MODEL=your-embedding-model
```

## Backend API

- `POST /api/generate`
- `POST /api/improve`
- `POST /api/summarize`
- `POST /api/export/pdf`
- `GET /api/documents`
- `POST /api/documents`
- `GET /api/documents/{id}`
- `PUT /api/documents/{id}`
- `DELETE /api/documents/{id}`
- `GET /api/tor/companies`
- `POST /api/tor/upload`
- `GET /api/tor/documents?company_name=Company%20A`
- `GET /api/tor/profiles/{company_name}`
- `POST /api/tor/generate`

Generation endpoints accept `stream: true` and return streamed Markdown text. With `stream: false`, they return JSON:

```json
{
  "markdown": "# Generated Markdown"
}
```

TOR generation accepts:

```json
{
  "company_name": "Company A",
  "project_title": "AI Chatbot System",
  "project_description": "...",
  "budget": "...",
  "duration": "...",
  "requirements": "...",
  "language": "th"
}
```

## Notes For Extension

- Add Alembic migrations before expanding the database schema beyond the MVP.
- Add authentication and document ownership before exposing this outside a trusted network.
- Add rate limits and request size limits at the reverse proxy for shared deployments.
=======


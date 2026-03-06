# Agent Starter

FastAPI + PydanticAI multi-agent starter with Vercel AI SDK-compatible chat endpoints and a Bun/Vite test UI.

## Project Structure

```text
app/
  api/
    dependencies/
      auth.py          # JWT auth + test mode bypass
    routes/
      agents.py        # GET /api/agents, POST /api/agents/{id}/chat
      health.py        # GET /health
  core/
    config.py          # Settings via pydantic-settings (.env)
    schemas.py         # Shared Pydantic models
  domain/
    deps.py            # AgentDeps dataclass (user info + agent config)
  services/
    agent_registry.py  # Agent definitions, config schemas, caching
    llm.py             # LLM provider resolution + env hydration
  tools/
    example_tools.py   # General tools (add, deferred, approval, choice)
    visualization_tools.py  # Chart/plot tools
    calculator_tools.py     # Arithmetic tools (add, subtract, multiply, divide)
  main.py              # FastAPI app factory + middleware
test-ui/               # Bun/Vite React UI (local testing only)
tests/                  # Pytest suite
```

## Quick Start

```bash
make install-deps   # Install Python + JS dependencies
make start          # Start API (port 8000) + UI (port 5173)
```

Open:
- **API health:** http://localhost:8000/health
- **Test UI:** http://localhost:5173

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Health check |
| `GET` | `/api/agents` | Yes | List available agents with config schemas |
| `POST` | `/api/agents/{agent_id}/chat` | Yes | Chat with a specific agent (Vercel AI adapter, SDK v6) |

### Agent Config

Agents can declare a `config_schema` — a list of fields (required/optional) that clients must provide. Config is sent via the `X-Agent-Config` header as a JSON string. The backend validates required fields and returns `422` if any are missing.

Example:
```
X-Agent-Config: {"output_format": "json", "precision": "4"}
```

### Rate Limiting

- **Global:** 60 requests/minute per IP
- **Chat endpoint:** 20 requests/minute per IP
- **Max request body:** 5 MB

## Authentication

All `/api/agents` endpoints use bearer auth:

- **`TEST_MODE=true`:** If no `Authorization` header is provided, a dummy test user is injected. A startup warning is logged.
- **`TEST_MODE=false`:** Strict JWT verification. Requires:
  - `AUTH_JWKS_URL` (must be `https://`)
  - `AUTH_ISSUER`
  - `AUTH_AUDIENCE`
  - `AUTH_ALGORITHMS` (default: `RS256`)

JWTs are verified against JWKS with signature, issuer, audience, and expiry checks.

## Environment

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_PROVIDER` | Yes | LLM provider (openai, anthropic, etc.) |
| `LLM_MODEL` | Yes | Model name |
| `OPENAI_API_KEY` | Varies | API key for your provider |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `TEST_MODE` | No | `true` disables auth (default: `false`) |
| `AUTH_JWKS_URL` | If !test | JWKS endpoint URL |
| `AUTH_ISSUER` | If !test | JWT issuer |
| `AUTH_AUDIENCE` | If !test | JWT audience |

## Adding Agents & Tools

### 1. Create tools

Add a new toolset in `app/tools/`:

```python
from pydantic_ai import FunctionToolset, RunContext
from app.domain.deps import AgentDeps

my_toolset: FunctionToolset[AgentDeps] = FunctionToolset()

@my_toolset.tool
async def my_tool(ctx: RunContext[AgentDeps], param: str) -> dict:
    # Access agent config via ctx.deps.config
    return {"result": param}
```

### 2. Register agent

Add to `_AGENT_DEFINITIONS` in `app/services/agent_registry.py`:

```python
AgentDefinition(
    id='my-agent',
    name='My Agent',
    description='What this agent does.',
    system_prompt='You are a helpful agent...',
    toolsets=[my_toolset],
    config_schema=[
        ConfigField(name='api_key', field_type='secret', required=True),
    ],
),
```

The agent is immediately available at `GET /api/agents` and `POST /api/agents/my-agent/chat`.

## Commands

| Command | Description |
|---------|-------------|
| `make install-deps` | Install all dependencies |
| `make start` | Run API + UI concurrently |
| `make test` | Run pytest suite |
| `make lint` | Run ruff linter |
| `make test-webui-build` | Verify UI builds |
| `make precommit-install` | Install pre-commit hooks |
| `make precommit-run` | Run all hooks |

## Test UI

The `test-ui/` directory contains a React app for local API testing. Features:

- **Agent switcher** — dropdown to select agents
- **Agent config dialog** — auto-generated form from agent config schema, saved in localStorage
- **Chat with tools** — approval and deferred tool support
- **Chat sessions** — multiple sessions with local persistence

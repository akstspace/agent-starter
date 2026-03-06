from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from pydantic import BaseModel
from pydantic_ai.ui.vercel_ai import VercelAIAdapter
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.responses import Response

from app.api.dependencies.auth import get_current_user
from app.core.config import settings
from app.core.schemas import AuthenticatedUser
from app.domain.deps import AgentDeps
from app.services.agent_registry import (
    get_agent_by_id,
    get_agent_definition,
    list_agent_definitions,
)
from app.services.llm import llm_unavailable_reason

router = APIRouter(prefix='/api/agents', tags=['agents'])
CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
limiter = Limiter(key_func=get_remote_address)


class ConfigFieldInfo(BaseModel):
    name: str
    field_type: str
    required: bool
    default: str | None
    description: str


class AgentInfo(BaseModel):
    id: str
    name: str
    description: str
    config_schema: list[ConfigFieldInfo]


@router.get('')
async def list_agents(user: CurrentUser) -> list[AgentInfo]:
    """Return all available agents."""
    return [
        AgentInfo(
            id=d.id,
            name=d.name,
            description=d.description,
            config_schema=[
                ConfigFieldInfo(
                    name=f.name,
                    field_type=f.field_type,
                    required=f.required,
                    default=f.default,
                    description=f.description,
                )
                for f in d.config_schema
            ],
        )
        for d in list_agent_definitions()
    ]


def _extract_agent_config(request: Request) -> dict[str, Any]:
    """Read agent config from X-Agent-Config header (JSON string)."""
    raw = request.headers.get('x-agent-config', '')
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (json.JSONDecodeError, Exception):
        return {}


def _validate_agent_config(agent_id: str, config: dict[str, Any]) -> dict[str, Any]:
    """Validate config against the agent's schema. Apply defaults. Return validated config."""
    definition = get_agent_definition(agent_id)
    if definition is None:
        return config

    validated: dict[str, Any] = {}
    missing: list[str] = []

    for field in definition.config_schema:
        if field.name in config:
            validated[field.name] = config[field.name]
        elif field.default is not None:
            validated[field.name] = field.default
        elif field.required:
            missing.append(field.name)

    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f'Missing required agent config fields: {missing}',
        )

    return validated


def _build_deps(user: AuthenticatedUser, config: dict[str, Any]) -> AgentDeps:
    return AgentDeps(
        user_id=user.sub,
        user_email=user.email,
        config=config,
    )


@router.post('/{agent_id}/chat')
@limiter.limit('20/minute')
async def agent_chat(
    agent_id: str = Path(pattern=r'^[a-z0-9_-]+$', max_length=64),
    request: Request = None,
    user: CurrentUser = None,
) -> Response:
    """Chat with a specific agent by ID."""
    unavailable_reason = llm_unavailable_reason(settings.llm_model)
    if unavailable_reason:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=unavailable_reason,
        )

    try:
        agent = get_agent_by_id(agent_id)
    except KeyError:
        valid_ids = [d.id for d in list_agent_definitions()]
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'Unknown agent. Available agents: {valid_ids}',
        ) from None

    raw_config = _extract_agent_config(request)
    validated_config = _validate_agent_config(agent_id, raw_config)
    deps = _build_deps(user, validated_config)

    return await VercelAIAdapter.dispatch_request(
        request,
        agent=agent,
        deps=deps,
        sdk_version=6,
    )

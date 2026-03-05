
from dataclasses import dataclass, field
from typing import Any

from pydantic_ai import Agent, DeferredToolRequests, FunctionToolset

from app.core.config import settings
from app.domain.deps import AgentDeps
from app.services.llm import resolve_model_spec
from app.tools import example_toolset, visualization_toolset
from app.tools.calculator_tools import calculator_toolset


@dataclass(frozen=True)
class ConfigField:
    """A single user-configurable field for an agent."""

    name: str
    field_type: str  # 'string' | 'number' | 'boolean' | 'secret'
    required: bool = True
    default: str | None = None
    description: str = ''


@dataclass(frozen=True)
class AgentDefinition:
    id: str
    name: str
    description: str
    system_prompt: str
    toolsets: list[FunctionToolset[AgentDeps]] = field(default_factory=list)
    config_schema: list[ConfigField] = field(default_factory=list)


_AGENT_DEFINITIONS: list[AgentDefinition] = [
    AgentDefinition(
        id='general',
        name='General Assistant',
        description=(
            'A practical assistant that can perform calculations, '
            'queue deferred reports, ask the user to choose options, '
            'and create chart visualizations.'
        ),
        system_prompt=(
            'You are a practical assistant for this API project. '
            'Use tools whenever the user asks for calculations or operations. '
            'Use queue_deferred_report only for tasks explicitly described as long-running. '
            'Use ask_user_single_choice when you need the user '
            'to choose one option before continuing. '
            'Use create_recharts_plot for standard Recharts visualizations. '
            'Use create_shadcn_plot when the user asks for shadcn-style charts. '
            'Keep plot payloads small. '
        ),
        toolsets=[example_toolset, visualization_toolset],
    ),
    AgentDefinition(
        id='calculator',
        name='Calculator',
        description=(
            'A focused arithmetic agent that can add, subtract, multiply, '
            'and divide numbers.'
        ),
        system_prompt=(
            'You are a calculator assistant. '
            'You can only perform arithmetic operations: addition, subtraction, '
            'multiplication, and division. '
            'Always use the provided tools to perform calculations — never compute in your head. '
            'If the user asks for something outside arithmetic, politely explain '
            'that you can only help with math calculations.'
        ),
        toolsets=[calculator_toolset],
        config_schema=[
            ConfigField(
                name='output_format',
                field_type='string',
                required=True,
                default=None,
                description='Result format: plain, json, or markdown',
            ),
            ConfigField(
                name='precision',
                field_type='number',
                required=False,
                default='2',
                description='Number of decimal places in results',
            ),
        ],
    ),
]

_AGENTS_CACHE: dict[str, Agent[AgentDeps]] = {}


def list_agent_definitions() -> list[AgentDefinition]:
    """Return all registered agent definitions."""
    return list(_AGENT_DEFINITIONS)


def get_agent_definition(agent_id: str) -> AgentDefinition | None:
    """Look up an agent definition by ID."""
    for definition in _AGENT_DEFINITIONS:
        if definition.id == agent_id:
            return definition
    return None


def get_agent_by_id(agent_id: str) -> Agent[AgentDeps]:
    """Build (or return cached) pydantic-ai Agent instance for the given agent_id."""
    if agent_id in _AGENTS_CACHE:
        return _AGENTS_CACHE[agent_id]

    definition = get_agent_definition(agent_id)
    if definition is None:
        raise KeyError(f"Unknown agent_id: '{agent_id}'")

    model: Any = resolve_model_spec(settings.llm_model)
    agent: Agent[AgentDeps] = Agent(
        model,
        deps_type=AgentDeps,
        output_type=[str, DeferredToolRequests],
        system_prompt=definition.system_prompt,
        toolsets=definition.toolsets,
    )
    _AGENTS_CACHE[agent_id] = agent
    return agent


def build_agent(model: Any, agent_id: str = 'general') -> Agent[AgentDeps]:
    """Build a pydantic-ai Agent for the given agent_id using the provided model.

    Useful for testing – pass a FunctionModel or any model without touching the
    settings-based cache used by get_agent_by_id.
    """
    definition = get_agent_definition(agent_id)
    if definition is None:
        raise KeyError(f"Unknown agent_id: '{agent_id}'")

    return Agent(
        model,
        deps_type=AgentDeps,
        output_type=[str, DeferredToolRequests],
        system_prompt=definition.system_prompt,
        toolsets=definition.toolsets,
    )

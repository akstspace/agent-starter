
from typing import Any
from uuid import uuid4

from pydantic_ai import ApprovalRequired, CallDeferred, FunctionToolset, RunContext

from app.domain.deps import AgentDeps

example_toolset: FunctionToolset[AgentDeps] = FunctionToolset()


@example_toolset.tool
async def add_numbers(ctx: RunContext[AgentDeps], a: float, b: float) -> dict[str, Any]:
    """Simple tool example: add two numbers."""
    return {
        'operation': 'add',
        'a': a,
        'b': b,
        'result': a + b,
    }


@example_toolset.tool
async def queue_deferred_report(ctx: RunContext[AgentDeps], topic: str) -> str:
    """Simple deferred tool example: queue a long-running report."""
    normalized_topic = topic.strip()
    if not normalized_topic:
        return 'Please provide a non-empty topic.'

    raise CallDeferred(
        metadata={
            'topic': normalized_topic,
            'request_id': f'req_{uuid4().hex[:10]}',
            'requested_by': ctx.deps.user_email or ctx.deps.user_id,
        }
    )


@example_toolset.tool
async def ask_user_single_choice(
    ctx: RunContext[AgentDeps],
    question: str,
    options: list[str],
) -> str:
    """Deferred tool example: ask the user to pick one option in UI, then use it as tool output."""
    normalized_question = question.strip()
    normalized_options = [option.strip() for option in options if option.strip()]

    if not normalized_question:
        return 'Question is required.'
    if len(normalized_options) < 2:
        return 'Provide at least two options.'

    raise CallDeferred(
        metadata={
            'interaction': 'single-select',
            'question': normalized_question,
            'options': normalized_options,
            'request_id': f'choice_{uuid4().hex[:10]}',
            'requested_by': ctx.deps.user_email or ctx.deps.user_id,
        }
    )


@example_toolset.tool
async def rotate_service_api_key(ctx: RunContext[AgentDeps], key_name: str, reason: str) -> str:
    """Simple approval-required example for a sensitive action."""
    if not ctx.tool_call_approved:
        raise ApprovalRequired(
            metadata={
                'key_name': key_name,
                'reason': reason,
            }
        )

    return f"Approval received. API key '{key_name}' would be rotated with reason: {reason}."

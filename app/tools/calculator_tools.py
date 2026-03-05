import math
from typing import Any

from pydantic_ai import FunctionToolset, RunContext

from app.domain.deps import AgentDeps

calculator_toolset: FunctionToolset[AgentDeps] = FunctionToolset()

_MAX_OPERAND = 1e15


def _validate_operand(value: float, name: str) -> float:
    """Validate that an operand is a safe finite number."""
    if not isinstance(value, (int, float)):
        raise ValueError(f'{name} must be a number.')
    if not math.isfinite(value):
        raise ValueError(f'{name} must be a finite number (no NaN or Infinity).')
    if abs(value) > _MAX_OPERAND:
        raise ValueError(f'{name} is out of allowed range (±{_MAX_OPERAND}).')
    return float(value)


@calculator_toolset.tool
async def add(ctx: RunContext[AgentDeps], a: float, b: float) -> dict[str, Any]:
    """Add two numbers together and return the result."""
    a = _validate_operand(a, 'a')
    b = _validate_operand(b, 'b')
    return {'operation': 'add', 'a': a, 'b': b, 'result': a + b}


@calculator_toolset.tool
async def subtract(ctx: RunContext[AgentDeps], a: float, b: float) -> dict[str, Any]:
    """Subtract b from a and return the result."""
    a = _validate_operand(a, 'a')
    b = _validate_operand(b, 'b')
    return {'operation': 'subtract', 'a': a, 'b': b, 'result': a - b}


@calculator_toolset.tool
async def multiply(ctx: RunContext[AgentDeps], a: float, b: float) -> dict[str, Any]:
    """Multiply two numbers together and return the result."""
    a = _validate_operand(a, 'a')
    b = _validate_operand(b, 'b')
    result = a * b
    if abs(result) > _MAX_OPERAND:
        raise ValueError('Result exceeds allowed range.')
    return {'operation': 'multiply', 'a': a, 'b': b, 'result': result}


@calculator_toolset.tool
async def divide(ctx: RunContext[AgentDeps], a: float, b: float) -> dict[str, Any]:
    """Divide a by b and return the result."""
    a = _validate_operand(a, 'a')
    b = _validate_operand(b, 'b')
    if b == 0:
        raise ValueError('Cannot divide by zero.')
    result = a / b
    return {'operation': 'divide', 'a': a, 'b': b, 'result': result}

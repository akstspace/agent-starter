from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentDeps:
    user_id: str
    user_email: str | None = None
    config: dict[str, Any] = field(default_factory=dict)

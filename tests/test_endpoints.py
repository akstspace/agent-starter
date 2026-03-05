"""FastAPI endpoint integration tests.

Uses the already-instantiated ``app`` from ``app.main`` with ``TestClient``.
Auth is controlled by patching ``settings`` in the auth dependency module.
"""

from __future__ import annotations

from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import auth as auth_dep
from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


# ── Health ───────────────────────────────────────────────────────────────────


def test_health_returns_200(client: TestClient) -> None:
    response = client.get('/health')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'


# ── GET /api/agents ──────────────────────────────────────────────────────────


def test_list_agents_test_mode_allows_no_token(
    client: TestClient, auth_settings_mock,
) -> None:
    auth_settings_mock.test_mode = True
    response = client.get('/api/agents')
    assert response.status_code == 200
    agents = response.json()
    assert isinstance(agents, list)
    ids = [a['id'] for a in agents]
    assert 'general' in ids
    assert 'calculator' in ids


def test_list_agents_auth_mode_rejects_no_token(
    client: TestClient, auth_settings_mock,
) -> None:
    auth_settings_mock.test_mode = False
    response = client.get('/api/agents')
    assert response.status_code == 401


def test_list_agents_auth_mode_rejects_bad_token(
    client: TestClient, auth_settings_mock,
) -> None:
    auth_settings_mock.test_mode = False
    with patch.object(auth_dep, '_decode_token', side_effect=jwt.InvalidTokenError()):
        response = client.get(
            '/api/agents',
            headers={'Authorization': 'Bearer bad-token'},
        )
    assert response.status_code == 401


def test_list_agents_auth_mode_accepts_valid_token(
    client: TestClient, auth_settings_mock,
) -> None:
    auth_settings_mock.test_mode = False
    with patch.object(
        auth_dep, '_decode_token',
        return_value={'sub': 'user-123', 'email': 'u@test.com', 'name': 'Test'},
    ):
        response = client.get(
            '/api/agents',
            headers={'Authorization': 'Bearer good-token'},
        )
    assert response.status_code == 200
    assert len(response.json()) >= 2


# ── POST /api/agents/{agent_id}/chat ─────────────────────────────────────────


def test_agent_chat_unknown_agent_returns_404(
    client: TestClient, auth_settings_mock,
) -> None:
    auth_settings_mock.test_mode = True
    response = client.post(
        '/api/agents/nonexistent/chat',
        json={'messages': [{'role': 'user', 'content': 'hi'}]},
    )
    assert response.status_code == 404


def test_agent_chat_auth_mode_rejects_no_token(
    client: TestClient, auth_settings_mock,
) -> None:
    auth_settings_mock.test_mode = False
    response = client.post(
        '/api/agents/general/chat',
        json={'messages': [{'role': 'user', 'content': 'hi'}]},
    )
    assert response.status_code == 401


def test_agent_chat_auth_mode_rejects_bad_token(
    client: TestClient, auth_settings_mock,
) -> None:
    auth_settings_mock.test_mode = False
    with patch.object(auth_dep, '_decode_token', side_effect=jwt.InvalidTokenError()):
        response = client.post(
            '/api/agents/general/chat',
            headers={'Authorization': 'Bearer bad-token'},
            json={'messages': [{'role': 'user', 'content': 'hi'}]},
        )
    assert response.status_code == 401

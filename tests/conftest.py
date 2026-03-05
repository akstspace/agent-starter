
from collections.abc import Iterator
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def auth_settings_mock() -> Iterator[MagicMock]:
    mock = MagicMock()
    mock.test_mode = False
    mock.test_user_id = 'user-test'
    mock.test_user_email = 'test-user@example.com'
    mock.jwt_algorithms = ['RS256']
    mock.auth_issuer = 'https://issuer.example.com'
    mock.auth_audience = 'agent-starter'
    mock.auth_jwks_url = 'https://jwks.example.com/.well-known/jwks.json'

    with patch('app.api.dependencies.auth.settings', mock):
        yield mock


@pytest.fixture
def llm_settings_mock() -> Iterator[MagicMock]:
    mock = MagicMock()
    mock.llm_provider = 'openai'
    mock.openai_api_key = None
    mock.anthropic_api_key = None
    mock.gemini_api_key = None
    mock.vertexai_api_key = None
    mock.bedrock_api_key = None
    mock.deepseek_api_key = None
    mock.groq_api_key = None
    mock.mistral_api_key = None
    mock.co_api_key = None
    mock.cerebras_api_key = None
    mock.fireworks_api_key = None
    mock.github_api_key = None
    mock.xai_api_key = None
    mock.openrouter_api_key = None
    mock.huggingface_api_key = None
    mock.moonshotai_api_key = None
    mock.together_api_key = None
    mock.vercel_api_key = None

    with patch('app.services.llm.settings', mock):
        yield mock

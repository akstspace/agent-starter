import os
from unittest.mock import patch

from app.services.llm import llm_unavailable_reason, resolve_model_spec


def test_llm_unavailable_reason_hydrates_openai_env_from_settings(llm_settings_mock) -> None:
    llm_settings_mock.openai_api_key = 'unit-test-key'

    with patch.dict(os.environ, {}, clear=True):
        reason = llm_unavailable_reason('openai:gpt-5.2')

        assert reason is None
        assert os.getenv('OPENAI_API_KEY') == 'unit-test-key'


def test_resolve_model_spec_hydrates_env_for_prefixed_model(llm_settings_mock) -> None:
    llm_settings_mock.openai_api_key = 'unit-test-key-2'

    with patch.dict(os.environ, {}, clear=True):
        result = resolve_model_spec('openai:gpt-5.2')

        assert result == 'openai:gpt-5.2'
        assert os.getenv('OPENAI_API_KEY') == 'unit-test-key-2'

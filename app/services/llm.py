
import os

from pydantic import SecretStr

from app.core.config import settings

_PROVIDER_KEY_REQUIREMENTS: dict[str, tuple[tuple[str, str], ...]] = {
    'openai': (('openai_api_key', 'OPENAI_API_KEY'),),
    'anthropic': (('anthropic_api_key', 'ANTHROPIC_API_KEY'),),
    'google-gla': (('gemini_api_key', 'GEMINI_API_KEY'),),
    'google-vertex': (('vertexai_api_key', 'VERTEXAI_API_KEY'),),
    'bedrock': (('bedrock_api_key', 'BEDROCK_API_KEY'),),
    'deepseek': (('deepseek_api_key', 'DEEPSEEK_API_KEY'),),
    'groq': (('groq_api_key', 'GROQ_API_KEY'),),
    'mistral': (('mistral_api_key', 'MISTRAL_API_KEY'),),
    'cohere': (('co_api_key', 'CO_API_KEY'),),
    'cerebras': (('cerebras_api_key', 'CEREBRAS_API_KEY'),),
    'fireworks': (('fireworks_api_key', 'FIREWORKS_API_KEY'),),
    'github': (('github_api_key', 'GITHUB_API_KEY'),),
    'xai': (('xai_api_key', 'XAI_API_KEY'),),
    'openrouter': (('openrouter_api_key', 'OPENROUTER_API_KEY'),),
    'huggingface': (('huggingface_api_key', 'HUGGINGFACE_API_KEY'),),
    'moonshotai': (('moonshotai_api_key', 'MOONSHOTAI_API_KEY'),),
    'together': (('together_api_key', 'TOGETHER_API_KEY'),),
    'vercel': (('vercel_api_key', 'VERCEL_API_KEY'),),
}


def _normalize_provider(value: str) -> str:
    provider = value.strip().lower()
    if provider == 'google':
        return 'google-gla'
    return provider


def resolve_provider(model_name: str) -> str:
    candidate = model_name.strip()
    if ':' in candidate:
        return _normalize_provider(candidate.split(':', 1)[0])
    return _normalize_provider(settings.llm_provider or 'openai')


def _hydrate_provider_env(model_name: str) -> None:
    provider = resolve_provider(model_name)
    requirements = _PROVIDER_KEY_REQUIREMENTS.get(provider, ())
    for setting_name, env_name in requirements:
        existing = os.getenv(env_name)
        if isinstance(existing, str) and existing.strip():
            continue

        candidate = getattr(settings, setting_name, None)
        if isinstance(candidate, SecretStr):
            value = candidate.get_secret_value()
            if value.strip():
                os.environ[env_name] = value.strip()
        elif isinstance(candidate, str) and candidate.strip():
            os.environ[env_name] = candidate.strip()


def resolve_model_spec(model_name: str) -> str:
    _hydrate_provider_env(model_name)
    candidate = model_name.strip()
    if ':' in candidate:
        return candidate
    provider = _normalize_provider(settings.llm_provider or 'openai')
    return f'{provider}:{candidate}'


def llm_unavailable_reason(model_name: str) -> str | None:
    _hydrate_provider_env(model_name)

    provider = resolve_provider(model_name)
    requirements = _PROVIDER_KEY_REQUIREMENTS.get(provider, ())
    if not requirements:
        return None

    for setting_name, env_name in requirements:
        value = os.getenv(env_name)
        if isinstance(value, str) and value.strip():
            return None

        candidate = getattr(settings, setting_name, None)
        if isinstance(candidate, SecretStr):
            if candidate.get_secret_value().strip():
                return None
        elif isinstance(candidate, str) and candidate.strip():
            return None

    env_names = ' or '.join(env_name for _, env_name in requirements)
    return f"{env_names} is not configured for provider '{provider}'."


from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, AnyHttpUrl, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        case_sensitive=False,
    )

    app_name: str = 'Agent Starter API'
    cors_origins: str = 'http://localhost:3000,http://localhost:5173,http://localhost:8000'

    llm_provider: str = Field(
        default='openai',
        validation_alias=AliasChoices('LLM_PROVIDER'),
    )
    llm_model: str = Field(
        default='gpt-5.2',
        validation_alias=AliasChoices('LLM_MODEL', 'OPENAI_MODEL'),
    )

    openai_api_key: SecretStr | None = None
    anthropic_api_key: SecretStr | None = None
    gemini_api_key: SecretStr | None = None
    vertexai_api_key: SecretStr | None = None
    bedrock_api_key: SecretStr | None = None
    deepseek_api_key: SecretStr | None = None
    groq_api_key: SecretStr | None = None
    mistral_api_key: SecretStr | None = None
    co_api_key: SecretStr | None = None
    cerebras_api_key: SecretStr | None = None
    fireworks_api_key: SecretStr | None = None
    github_api_key: SecretStr | None = None
    xai_api_key: SecretStr | None = None
    openrouter_api_key: SecretStr | None = None
    huggingface_api_key: SecretStr | None = None
    moonshotai_api_key: SecretStr | None = None
    together_api_key: SecretStr | None = None
    vercel_api_key: SecretStr | None = None

    auth_jwks_url: AnyHttpUrl | None = None
    auth_issuer: str | None = None
    auth_audience: str | None = None
    auth_algorithms: str = 'RS256'

    test_mode: bool = False
    test_user_id: str = 'user-test'
    test_user_email: str = 'test-user@example.com'

    max_plot_data_points: int = 300
    max_plot_payload_bytes: int = 200_000

    @field_validator('auth_jwks_url', 'auth_issuer', 'auth_audience', mode='before')
    @classmethod
    def empty_string_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(',') if origin.strip()]

    @property
    def jwt_algorithms(self) -> list[str]:
        return [alg.strip() for alg in self.auth_algorithms.split(',') if alg.strip()]

    @model_validator(mode='after')
    def validate_auth_configuration(self) -> Settings:
        if self.test_mode:
            return self

        missing: list[str] = []
        if not self.auth_jwks_url:
            missing.append('AUTH_JWKS_URL')
        if not self.auth_issuer:
            missing.append('AUTH_ISSUER')
        if not self.auth_audience:
            missing.append('AUTH_AUDIENCE')

        if missing:
            joined = ', '.join(missing)
            raise ValueError(f'{joined} must be set when TEST_MODE=false.')

        if self.auth_jwks_url and self.auth_jwks_url.scheme != 'https':
            raise ValueError('AUTH_JWKS_URL must use https when TEST_MODE=false.')

        if not self.jwt_algorithms:
            raise ValueError('AUTH_ALGORITHMS must contain at least one JWT algorithm.')

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

import pytest

from app.core.config import Settings


def test_non_test_mode_requires_auth_fields() -> None:
    with pytest.raises(ValueError, match='AUTH_JWKS_URL, AUTH_ISSUER, AUTH_AUDIENCE'):
        Settings(test_mode=False, _env_file=None)


def test_non_test_mode_requires_https_jwks() -> None:
    with pytest.raises(ValueError, match='AUTH_JWKS_URL must use https'):
        Settings(
            test_mode=False,
            auth_jwks_url='http://jwks.example.com/.well-known/jwks.json',
            auth_issuer='https://issuer.example.com',
            auth_audience='agent-starter',
            _env_file=None,
        )


def test_non_test_mode_with_valid_auth_settings_passes() -> None:
    settings = Settings(
        test_mode=False,
        auth_jwks_url='https://jwks.example.com/.well-known/jwks.json',
        auth_issuer='https://issuer.example.com',
        auth_audience='agent-starter',
        auth_algorithms='RS256,EdDSA',
        _env_file=None,
    )

    assert settings.test_mode is False
    assert settings.jwt_algorithms == ['RS256', 'EdDSA']

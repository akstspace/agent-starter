from functools import lru_cache
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient
from jwt.exceptions import PyJWKClientError

from app.core.config import settings
from app.core.schemas import AuthenticatedUser

_http_bearer = HTTPBearer(auto_error=False)
BearerCredentials = Annotated[HTTPAuthorizationCredentials | None, Depends(_http_bearer)]


@lru_cache
def _get_jwks_client() -> PyJWKClient:
    # auth_jwks_url is validated in settings when TEST_MODE=false.
    if not settings.auth_jwks_url:
        raise RuntimeError('AUTH_JWKS_URL is not configured.')
    return PyJWKClient(str(settings.auth_jwks_url))


def _decode_token(token: str) -> dict[str, Any]:
    signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=settings.jwt_algorithms,
        issuer=settings.auth_issuer,
        audience=settings.auth_audience,
        options={'verify_signature': True, 'verify_exp': True, 'verify_aud': True},
    )


def _unauthorized(detail: str = 'Invalid or missing bearer token.') -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={'WWW-Authenticate': 'Bearer'},
    )


def _authenticate_credentials(
    credentials: HTTPAuthorizationCredentials | None,
) -> AuthenticatedUser:
    if credentials is None:
        raise _unauthorized('Authentication required.')

    token = credentials.credentials
    if not token:
        raise _unauthorized('Bearer token is required.')

    try:
        payload = _decode_token(token)
    except (InvalidTokenError, PyJWKClientError):
        raise _unauthorized() from None
    except Exception:
        raise _unauthorized('Unable to verify bearer token.') from None

    subject = payload.get('sub')
    if not isinstance(subject, str) or not subject.strip():
        raise _unauthorized('Token subject (sub) is missing.')

    email = payload.get('email')
    name = payload.get('name')

    return AuthenticatedUser(
        sub=subject,
        email=email if isinstance(email, str) else None,
        name=name if isinstance(name, str) else None,
    )


def get_current_user(credentials: BearerCredentials) -> AuthenticatedUser:
    if settings.test_mode and credentials is None:
        return AuthenticatedUser(
            sub=settings.test_user_id,
            email=settings.test_user_email,
            name='Test User',
        )
    return _authenticate_credentials(credentials)

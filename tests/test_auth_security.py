from unittest.mock import patch

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.api.dependencies import auth as auth_dep


def test_test_mode_without_token_returns_dummy_user(auth_settings_mock) -> None:
    auth_settings_mock.test_mode = True
    auth_settings_mock.test_user_id = 'dummy-user'
    auth_settings_mock.test_user_email = 'dummy@example.com'

    user = auth_dep.get_current_user(credentials=None)

    assert user.sub == 'dummy-user'
    assert user.email == 'dummy@example.com'


def test_non_test_mode_requires_credentials(auth_settings_mock) -> None:
    auth_settings_mock.test_mode = False

    with pytest.raises(HTTPException) as exc_info:
        auth_dep.get_current_user(credentials=None)

    assert exc_info.value.status_code == 401


def test_invalid_token_rejected(auth_settings_mock) -> None:
    auth_settings_mock.test_mode = False

    credentials = HTTPAuthorizationCredentials(scheme='Bearer', credentials='bad-token')
    with patch.object(auth_dep, '_decode_token', side_effect=jwt.InvalidTokenError()):
        with pytest.raises(HTTPException) as exc_info:
            auth_dep.get_current_user(credentials=credentials)

    assert exc_info.value.status_code == 401


def test_valid_token_maps_to_user(auth_settings_mock) -> None:
    auth_settings_mock.test_mode = False

    credentials = HTTPAuthorizationCredentials(scheme='Bearer', credentials='good-token')
    with patch.object(
        auth_dep,
        '_decode_token',
        return_value={'sub': 'user-123', 'email': 'user@example.com', 'name': 'User'},
    ):
        user = auth_dep.get_current_user(credentials=credentials)

    assert user.sub == 'user-123'
    assert user.email == 'user@example.com'
    assert user.name == 'User'

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes.agents import router as agents_router
from app.api.routes.health import router as health_router
from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024  # 5 MB

limiter = Limiter(key_func=get_remote_address, default_limits=['60/minute'])


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Reject requests with bodies larger than MAX_REQUEST_BODY_BYTES."""

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get('content-length')
        if content_length and int(content_length) > MAX_REQUEST_BODY_BYTES:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={'detail': f'Request body exceeds {MAX_REQUEST_BODY_BYTES} bytes.'},
            )
        return await call_next(request)


def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={'detail': f'Rate limit exceeded: {exc.detail}'},
    )


@asynccontextmanager
async def _lifespan(app: FastAPI):
    if settings.test_mode:
        logger.warning(
            '\n'
            '╔══════════════════════════════════════════════════════════╗\n'
            '║  ⚠️  TEST_MODE is ON — authentication is DISABLED ⚠️    ║\n'
            '║  All endpoints accept unauthenticated requests.        ║\n'
            '║  Set TEST_MODE=false and configure AUTH_* env vars     ║\n'
            '║  before deploying to any non-local environment.        ║\n'
            '╚══════════════════════════════════════════════════════════╝'
        )
    yield


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, lifespan=_lifespan)

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)

    app.add_middleware(MaxBodySizeMiddleware)

    origins = settings.allowed_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if origins else ['*'],
        allow_credentials=bool(origins),
        allow_methods=['*'],
        allow_headers=['*'],
    )

    app.include_router(health_router)
    app.include_router(agents_router)

    return app


app = create_app()

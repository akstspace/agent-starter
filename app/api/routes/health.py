from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get('/health')
@limiter.limit('60/minute')
async def health(request: Request) -> dict[str, str | int]:
    return {
        'status': 'ok',
        'vercel_ai_sdk_version': 6,
    }

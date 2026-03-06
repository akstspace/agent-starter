from fastapi import APIRouter

router = APIRouter()


@router.get('/health')
async def health() -> dict[str, str | int]:
    return {
        'status': 'ok',
        'vercel_ai_sdk_version': 6,
    }

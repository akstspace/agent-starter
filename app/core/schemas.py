from pydantic import BaseModel


class AuthenticatedUser(BaseModel):
    sub: str
    email: str | None = None
    name: str | None = None

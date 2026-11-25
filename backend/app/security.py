import secrets
import string
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User
from app.permissions import get_matrix

# Параметры OWASP (19 МиБ, t=2): при mem_limit api 320m параллельные входы не упираются в память
_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
# Хэш для сравнения при несуществующем логине — время ответа не выдаёт, есть ли такой пользователь
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing")

PASSWORD_CHANGE_REQUIRED = "password_change_required"  # noqa: S105 — код ошибки, не пароль


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def generate_temp_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isdigit() for c in pw) and any(c.isalpha() for c in pw):
            return pw


def create_session_token(user: User) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user.id),
        "tv": user.token_version,
        "iat": now,
        "exp": now + timedelta(hours=s.session_hours),
    }
    return jwt.encode(payload, s.secret_key, algorithm="HS256")


def set_session_cookie(response: Response, user: User) -> None:
    s = get_settings()
    response.set_cookie(
        s.cookie_name,
        create_session_token(user),
        max_age=s.session_hours * 3600,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(s.cookie_name, path="/", httponly=True, secure=s.cookie_secure, samesite="lax")


def client_ip(request: Request) -> str:
    # uvicorn запущен с --proxy-headers: request.client — реальный адрес клиента из X-Forwarded-For
    return request.client.host if request.client else "0.0.0.0"  # noqa: S104


def _unauthorized() -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется вход в систему")


def load_session_user(request: Request, db: Session) -> User:
    s = get_settings()
    token = request.cookies.get(s.cookie_name)
    if not token:
        raise _unauthorized()
    try:
        payload = jwt.decode(token, s.secret_key, algorithms=["HS256"])
        user_id = uuid.UUID(str(payload["sub"]))
        tv = int(payload["tv"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _unauthorized() from None
    user = db.get(User, user_id)
    if user is None or not user.is_active or user.token_version != tv:
        raise _unauthorized()
    return user


class Access:
    """Зависимость проверки доступа. Каждый эндпоинт обязан объявить Access или Public —
    это проверяет тест-матрица прав (tests/test_permissions_matrix.py).

    perm=None — любой вошедший пользователь. allow_pending=True — доступно и до смены временного пароля.
    """

    def __init__(self, perm: str | None = None, *, allow_pending: bool = False) -> None:
        self.perm = perm
        self.allow_pending = allow_pending

    def __call__(self, request: Request, db: Session = Depends(get_db)) -> User:
        user = load_session_user(request, db)
        if user.must_change_password and not self.allow_pending:
            raise HTTPException(status.HTTP_403_FORBIDDEN, PASSWORD_CHANGE_REQUIRED)
        if self.perm is not None and not get_matrix().can(user.role, self.perm):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Недостаточно прав")
        request.state.user = user
        return user

    def __repr__(self) -> str:
        return f"Access({self.perm!r}, allow_pending={self.allow_pending})"


class Public:
    """Явная пометка публичного эндпоинта (без входа)."""

    def __call__(self) -> None:
        return None


PUBLIC = Public()

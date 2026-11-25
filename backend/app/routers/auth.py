from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.audit import audit
from app.config import get_settings
from app.db import get_db
from app.models import LoginAttempt, User
from app.permissions import get_matrix
from app.routers.users import user_out
from app.schemas import ChangePasswordIn, LoginIn, MeOut, SessionOut
from app.security import (
    PUBLIC,
    Access,
    clear_session_cookie,
    client_ip,
    hash_password,
    load_session_user,
    set_session_cookie,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def me_out(user: User) -> MeOut:
    m = get_matrix()
    return MeOut(
        user=user_out(user),
        sections=m.sections.get(user.role, []),
        permissions=m.permissions.get(user.role, []),
        all_projects=user.role in m.all_projects_roles,
    )


@router.post("/login", response_model=MeOut, dependencies=[Depends(PUBLIC)])
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> MeOut:
    s = get_settings()
    ip = client_ip(request)
    now = datetime.now(UTC)
    since = now - timedelta(minutes=s.login_window_minutes)
    failures = db.scalar(
        select(func.count())
        .select_from(LoginAttempt)
        .where(
            LoginAttempt.login == data.login,
            LoginAttempt.ip == ip,
            LoginAttempt.success.is_(False),
            LoginAttempt.at >= since,
        )
    )
    if (failures or 0) >= s.login_max_failures:
        audit(db, "auth.login_rate_limited", user_id=None, request=request, details={"login": data.login})
        db.commit()
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Слишком много неудачных попыток. Попробуйте через {s.login_window_minutes} минут.",
        )

    user = db.scalar(select(User).where(User.login == data.login))
    ok = verify_password(user.password_hash if user else None, data.password)
    if not ok or user is None or not user.is_active:
        db.add(LoginAttempt(login=data.login, ip=ip, success=False))
        reason = "blocked" if (ok and user is not None) else "bad_credentials"
        audit(
            db,
            "auth.login_failed",
            user_id=user.id if user else None,
            request=request,
            details={"login": data.login, "reason": reason},
        )
        db.commit()
        if reason == "blocked":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Учётная запись заблокирована")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный логин или пароль")

    # Успешный вход: сбрасываем счётчик неудач для логина+IP, чистим старые записи
    db.execute(delete(LoginAttempt).where(LoginAttempt.login == data.login, LoginAttempt.ip == ip))
    db.execute(delete(LoginAttempt).where(LoginAttempt.at < now - timedelta(days=1)))
    user.last_login_at = now
    audit(db, "auth.login", user_id=user.id, request=request)
    db.commit()
    set_session_cookie(response, user)
    return me_out(user)


@router.post("/logout", status_code=204, dependencies=[Depends(PUBLIC)])
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> None:
    try:
        user: User | None = Access(allow_pending=True)(request, db)
    except HTTPException:
        user = None
    if user is not None:
        audit(db, "auth.logout", user_id=user.id, request=request)
        db.commit()
    clear_session_cookie(response)


@router.get("/session", response_model=SessionOut, dependencies=[Depends(PUBLIC)])
def session(request: Request, db: Session = Depends(get_db)) -> SessionOut:
    """Состояние входа без 401 (стартовая проверка в браузере; не засоряет консоль ошибками)."""
    try:
        user = load_session_user(request, db)
    except HTTPException:
        return SessionOut(me=None)
    return SessionOut(me=me_out(user))


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(Access(allow_pending=True))) -> MeOut:
    return me_out(user)


@router.post("/change-password", response_model=MeOut)
def change_password(
    data: ChangePasswordIn,
    request: Request,
    response: Response,
    user: User = Depends(Access(allow_pending=True)),
    db: Session = Depends(get_db),
) -> MeOut:
    if not verify_password(user.password_hash, data.current_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Текущий пароль указан неверно")
    if data.new_password == data.current_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Новый пароль должен отличаться от текущего")
    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    user.token_version += 1
    audit(db, "auth.password_changed", user_id=user.id, request=request, target_type="user", target_id=user.id)
    db.commit()
    # Остальные сессии пользователя закрыты (token_version), текущая — продлевается новым токеном
    set_session_cookie(response, user)
    return me_out(user)

import ipaddress
import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AuditLog
from app.security import client_ip

# Человекочитаемые названия действий (для журнала в интерфейсе)
ACTION_LABEL = {
    "auth.login": "Вход в систему",
    "auth.login_failed": "Неудачная попытка входа",
    "auth.login_rate_limited": "Вход заблокирован: превышено число попыток",
    "auth.logout": "Выход из системы",
    "auth.password_changed": "Смена пароля",
    "user.created": "Создан сотрудник",
    "user.updated": "Изменены данные сотрудника",
    "user.role_changed": "Изменена роль",
    "user.projects_changed": "Изменены назначенные объекты",
    "user.password_reset": "Сброшен пароль",
    "user.blocked": "Сотрудник заблокирован",
    "user.unblocked": "Сотрудник разблокирован",
    "user.bootstrap": "Создана учётная запись директора (первый запуск)",
    "user.admin_created": "Создана служебная учётная запись администратора (CLI)",
    "project.created": "Создан объект",
}


def _valid_ip(value: str) -> str | None:
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


def audit(
    db: Session,
    action: str,
    *,
    user_id: uuid.UUID | None,
    request: Request | None = None,
    target_type: str | None = None,
    target_id: object | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            action=action,
            user_id=user_id,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            details=details or {},
            ip=_valid_ip(client_ip(request)) if request is not None else None,
        )
    )

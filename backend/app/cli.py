"""Служебные команды.

  python -m app.cli bootstrap          — создать директора из .env (DIRECTOR_*), если директора ещё нет
  python -m app.cli create-admin LOGIN "ФИО"   — служебная учётная запись admin (пароль спросит интерактивно
                                       или возьмёт из переменной ADMIN_PASSWORD)
"""

import argparse
import getpass
import os
import sys

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select

from app.audit import audit
from app.config import get_settings
from app.db import get_sessionmaker
from app.models import User
from app.schemas import Login, Password
from app.security import hash_password


def _validate(login: str, password: str) -> tuple[str, str]:
    try:
        return TypeAdapter(Login).validate_python(login), TypeAdapter(Password).validate_python(password)
    except ValidationError as e:
        raise SystemExit(f"Ошибка: {e.errors()[0]['msg']}") from None


def bootstrap() -> int:
    s = get_settings()
    with get_sessionmaker()() as db:
        if db.scalar(select(User.id).where(User.role == "director").limit(1)) is not None:
            print("bootstrap: директор уже есть — ничего не делаю")
            return 0
        if not s.director_login or not s.director_password:
            print("bootstrap: DIRECTOR_LOGIN / DIRECTOR_PASSWORD не заданы в .env", file=sys.stderr)
            return 1
        login, password = _validate(s.director_login, s.director_password)
        if db.scalar(select(User.id).where(User.login == login)) is not None:
            print(f"bootstrap: логин {login} уже занят другой учётной записью", file=sys.stderr)
            return 1
        user = User(
            login=login,
            full_name=s.director_name,
            position="Директор",
            role="director",
            password_hash=hash_password(password),
            # Пароль из .env знает разработчик — при первом входе директор задаёт свой
            must_change_password=True,
            is_active=True,
            token_version=0,
        )
        db.add(user)
        db.flush()
        audit(db, "user.bootstrap", user_id=None, target_type="user", target_id=user.id,
              details={"login": login})
        db.commit()
        print(f"bootstrap: создан директор {login}")
        return 0


def create_admin(login: str, name: str) -> int:
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Пароль администратора: ")
    login, password = _validate(login, password)
    with get_sessionmaker()() as db:
        if db.scalar(select(User.id).where(User.login == login)) is not None:
            print(f"create-admin: логин {login} уже занят", file=sys.stderr)
            return 1
        user = User(login=login, full_name=name, position="Администратор системы", role="admin",
                    password_hash=hash_password(password), must_change_password=False, is_active=True,
                    token_version=0)
        db.add(user)
        db.flush()
        audit(db, "user.admin_created", user_id=None, target_type="user", target_id=user.id,
              details={"login": login})
        db.commit()
        print(f"create-admin: создан администратор {login}")
        return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("bootstrap")
    p = sub.add_parser("create-admin")
    p.add_argument("login")
    p.add_argument("name")
    args = parser.parse_args(argv)
    if args.cmd == "bootstrap":
        return bootstrap()
    return create_admin(args.login, args.name)


if __name__ == "__main__":
    sys.exit(main())

"""Тесты идут на реальном PostgreSQL. База для тестов: TEST_DATABASE_URL
(по умолчанию — локальный postgres на 5433, см. backend/README.md). Схема создаётся миграциями Alembic."""

import os
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import psycopg
import pytest
from sqlalchemy.engine import make_url

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://stroyai:stroyai@localhost:5433/stroyai_test"
)
ORIGIN = "http://testserver"

os.environ.update(
    DATABASE_URL=TEST_DB_URL,
    SECRET_KEY="test-secret-key-0123456789-abcdefghijklmnop",
    COOKIE_SECURE="false",
    ALLOWED_ORIGINS=ORIGIN,
    DIRECTOR_LOGIN="director",
    DIRECTOR_PASSWORD="Director123",
    DIRECTOR_NAME="Карабасов Аслан",
)

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from app.db import get_engine, get_sessionmaker  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Project, User  # noqa: E402
from app.security import hash_password  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
PASSWORD = "Passw0rd123"
_HASH = hash_password(PASSWORD)


def _recreate_database() -> None:
    url = make_url(TEST_DB_URL)
    admin = url.set(database="postgres", drivername="postgresql")
    with psycopg.connect(admin.render_as_string(hide_password=False), autocommit=True) as conn:
        conn.execute(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)')
        conn.execute(f'CREATE DATABASE "{url.database}"')


@pytest.fixture(scope="session", autouse=True)
def database() -> Iterator[None]:
    _recreate_database()
    cfg = Config(str(BACKEND / "alembic.ini"))
    command.upgrade(cfg, "head")
    yield
    get_engine().dispose()


@pytest.fixture(autouse=True)
def clean_tables() -> Iterator[None]:
    yield
    with get_engine().begin() as conn:
        conn.execute(text("TRUNCATE user_projects, audit_log, login_attempts, users, projects RESTART IDENTITY"))


def make_client() -> TestClient:
    return TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})


@pytest.fixture
def client() -> TestClient:
    return make_client()


@dataclass
class Ctx:
    def user(
        self,
        role: str = "foreman",
        *,
        login: str | None = None,
        must_change: bool = False,
        active: bool = True,
        projects: list[Project] | None = None,
    ) -> User:
        with get_sessionmaker()() as db:
            n = db.scalar(text("SELECT count(*) FROM users")) or 0
            u = User(
                login=login or f"{role}{n + 1}",
                full_name=f"Тест {role} {n + 1}",
                position="",
                role=role,
                password_hash=_HASH,
                must_change_password=must_change,
                is_active=active,
                token_version=0,
                projects=[db.merge(p) for p in projects or []],
            )
            db.add(u)
            db.commit()
            db.refresh(u)
            return u

    def project(self, name: str = "Объект") -> Project:
        with get_sessionmaker()() as db:
            p = Project(name=name, address="")
            db.add(p)
            db.commit()
            db.refresh(p)
            return p

    def login(self, user: User, password: str = PASSWORD) -> TestClient:
        c = make_client()
        r = c.post("/api/auth/login", json={"login": user.login, "password": password})
        assert r.status_code == 200, r.text
        return c


@pytest.fixture
def ctx() -> Ctx:
    return Ctx()


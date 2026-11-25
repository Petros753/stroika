"""Тест-матрица «роль × эндпоинт» по shared/permissions.json.

1. Каждый маршрут /api объявляет Access(...) или Public — иначе тест падает (нельзя забыть проверку прав).
2. Каждый защищённый маршрут описан в CASES — новый эндпоинт без кейса роняет тест.
3. Для каждой роли: разрешённые получают 2xx, остальные — 403. Без входа — 401.
   До смены временного пароля — 403 (кроме маршрутов с allow_pending).
"""

from collections.abc import Callable
from typing import Any

import httpx
import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.main import app
from app.permissions import get_matrix
from app.security import Access, Public
from tests.conftest import PASSWORD, Ctx, make_client

ROLES = list(get_matrix().roles)


def _access_of(route: APIRoute) -> Access | Public | None:
    found: list[Access | Public] = []
    stack = list(route.dependant.dependencies)
    while stack:
        d = stack.pop()
        if isinstance(d.call, Access | Public):
            found.append(d.call)
        stack.extend(d.dependencies)
    assert len(found) <= 1, f"{route.path}: несколько деклараций доступа {found}"
    return found[0] if found else None


API_ROUTES = [
    (method, r.path, r)
    for r in app.routes
    if isinstance(r, APIRoute)
    for method in sorted(r.methods)
]

PUBLIC_ROUTES = {
    ("GET", "/api/health"),
    ("HEAD", "/api/health"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/logout"),
    ("GET", "/api/auth/session"),
}


class Env:
    """Данные для вызова эндпоинта: объект, к которому назначен пользователь, и посторонний сотрудник."""

    def __init__(self, ctx: Ctx, role: str) -> None:
        self.project = ctx.project("Объект матрицы")
        self.user = ctx.user(role, projects=[self.project])
        self.target = ctx.user("foreman")


Case = Callable[[TestClient, Env], httpx.Response]

CASES: dict[tuple[str, str], Case] = {
    ("GET", "/api/auth/me"): lambda c, e: c.get("/api/auth/me"),
    ("POST", "/api/auth/change-password"): lambda c, e: c.post(
        "/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "NewPassw0rd9"}
    ),
    ("GET", "/api/permissions"): lambda c, e: c.get("/api/permissions"),
    ("GET", "/api/projects"): lambda c, e: c.get("/api/projects"),
    ("GET", "/api/projects/{project_id}"): lambda c, e: c.get(f"/api/projects/{e.project.id}"),
    ("POST", "/api/projects"): lambda c, e: c.post("/api/projects", json={"name": "Новый объект"}),
    ("GET", "/api/audit"): lambda c, e: c.get("/api/audit"),
    ("GET", "/api/users"): lambda c, e: c.get("/api/users"),
    ("POST", "/api/users"): lambda c, e: c.post(
        "/api/users",
        json={"login": "new.worker", "full_name": "Новый Сотрудник", "role": "foreman",
              "password": "Temp12345", "project_ids": [str(e.project.id)]},
    ),
    ("PATCH", "/api/users/{user_id}"): lambda c, e: c.patch(
        f"/api/users/{e.target.id}", json={"role": "pto", "position": "Инженер"}
    ),
    ("POST", "/api/users/{user_id}/reset-password"): lambda c, e: c.post(
        f"/api/users/{e.target.id}/reset-password", json={}
    ),
    ("POST", "/api/users/{user_id}/block"): lambda c, e: c.post(f"/api/users/{e.target.id}/block", json={}),
    ("POST", "/api/users/{user_id}/unblock"): lambda c, e: c.post(f"/api/users/{e.target.id}/unblock", json={}),
}


# Спецификация доступа (независимо от кода): право из permissions.json; ANY — любой вошедший;
# PENDING — доступно и до смены временного пароля. Меняется только осознанно, вместе с эндпоинтом.
ANY = None
SPEC: dict[tuple[str, str], tuple[str | None, bool]] = {
    ("GET", "/api/auth/me"): (ANY, True),
    ("POST", "/api/auth/change-password"): (ANY, True),
    ("GET", "/api/permissions"): (ANY, False),
    ("GET", "/api/projects"): (ANY, False),
    ("GET", "/api/projects/{project_id}"): (ANY, False),
    ("POST", "/api/projects"): ("project.create", False),
    ("GET", "/api/audit"): ("employees.manage", False),
    ("GET", "/api/users"): ("employees.manage", False),
    ("POST", "/api/users"): ("employees.manage", False),
    ("PATCH", "/api/users/{user_id}"): ("employees.manage", False),
    ("POST", "/api/users/{user_id}/reset-password"): ("employees.manage", False),
    ("POST", "/api/users/{user_id}/block"): ("employees.manage", False),
    ("POST", "/api/users/{user_id}/unblock"): ("employees.manage", False),
}


def test_declared_access_matches_spec() -> None:
    assert set(SPEC) == set(CASES)
    for key, (perm, pending) in SPEC.items():
        acc = _required(*key)
        assert (acc.perm, acc.allow_pending) == (perm, pending), f"{key}: в коде {acc}, по спецификации {perm}"


def _fill(path: str) -> str:
    return (path.replace("{user_id}", "00000000-0000-0000-0000-000000000001")
                .replace("{project_id}", "00000000-0000-0000-0000-000000000001"))


def test_every_route_declares_access() -> None:
    missing = [f"{m} {p}" for m, p, r in API_ROUTES if p.startswith("/api") and _access_of(r) is None]
    assert not missing, f"Эндпоинты без Access/Public: {missing}"


def test_public_routes_are_exactly_expected() -> None:
    public = {(m, p) for m, p, r in API_ROUTES if isinstance(_access_of(r), Public)}
    assert public == PUBLIC_ROUTES


def test_every_protected_route_has_case() -> None:
    protected = {(m, p) for m, p, r in API_ROUTES if isinstance(_access_of(r), Access)}
    assert protected == set(CASES), f"Нет кейса: {protected - set(CASES)}; лишние: {set(CASES) - protected}"


def _required(method: str, path: str) -> Access:
    route = next(r for m, p, r in API_ROUTES if m == method and p == path)
    acc = _access_of(route)
    assert isinstance(acc, Access)
    return acc


@pytest.mark.parametrize(("method", "path"), list(CASES), ids=[f"{m} {p}" for m, p in CASES])
@pytest.mark.parametrize("role", ROLES)
def test_role_matrix(ctx: Ctx, role: str, method: str, path: str) -> None:
    perm, _ = SPEC[(method, path)]
    allowed = perm is None or get_matrix().can(role, perm)
    env = Env(ctx, role)
    resp = CASES[(method, path)](ctx.login(env.user), env)
    expected = "2xx" if allowed else "403"
    ok = (200 <= resp.status_code < 300) if allowed else resp.status_code == 403
    assert ok, f"{role}: {method} {path} → {resp.status_code} (ожидалось {expected}): {resp.text}"


@pytest.mark.parametrize(("method", "path"), list(CASES))
def test_unauthenticated_gets_401(method: str, path: str) -> None:
    c = make_client()
    body: dict[str, Any] | None = {} if method != "GET" else None
    r = c.request(method, _fill(path), json=body)
    assert r.status_code == 401, r.text


@pytest.mark.parametrize(("method", "path"), list(CASES))
def test_pending_password_change_blocks_everything_except_allowed(ctx: Ctx, method: str, path: str) -> None:
    env = Env(ctx, "director")
    from app.db import get_sessionmaker
    from app.models import User

    with get_sessionmaker()() as db:
        u = db.get(User, env.user.id)
        assert u is not None
        u.must_change_password = True
        db.commit()
    c = ctx.login(env.user)
    r = CASES[(method, path)](c, env)
    if SPEC[(method, path)][1]:
        assert 200 <= r.status_code < 300, r.text
    else:
        assert r.status_code == 403 and r.json()["detail"] == "password_change_required", r.text

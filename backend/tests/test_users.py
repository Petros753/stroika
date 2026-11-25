from sqlalchemy import select

from app.cli import bootstrap
from app.db import get_sessionmaker
from app.models import AuditLog, User
from tests.conftest import PASSWORD, Ctx, make_client


def new_user(**kw: object) -> dict[str, object]:
    data: dict[str, object] = {"login": "sidorov", "full_name": "Сидоров Пётр", "position": "Прораб участка",
            "role": "foreman", "password": "Temp12345"}
    data.update(kw)
    return data


def test_director_creates_employee_who_logs_in_and_changes_password(ctx: Ctx):
    p1, p2 = ctx.project("ЖК Север"), ctx.project("Школа")
    d = ctx.login(ctx.user("director", login="boss"))
    r = d.post("/api/users", json=new_user(project_ids=[str(p1.id)]))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["must_change_password"] is True and body["project_ids"] == [str(p1.id)]

    emp = make_client()
    me = emp.post("/api/auth/login", json={"login": "Sidorov", "password": "Temp12345"}).json()
    assert me["user"]["must_change_password"] is True
    assert me["sections"] == ["projects", "cad", "execution", "procurement", "warehouse", "pto", "assistant"]
    assert emp.get("/api/projects").status_code == 403
    r = emp.post("/api/auth/change-password", json={"current_password": "Temp12345", "new_password": "Mypass2024"})
    assert r.status_code == 200
    assert [p["name"] for p in emp.get("/api/projects").json()] == ["ЖК Север"]
    assert emp.get(f"/api/projects/{p2.id}").status_code == 404
    assert emp.get("/api/users").status_code == 403


def test_create_validation(ctx: Ctx):
    d = ctx.login(ctx.user("director"))
    assert d.post("/api/users", json=new_user()).status_code == 201
    assert d.post("/api/users", json=new_user()).status_code == 409  # логин занят
    assert d.post("/api/users", json=new_user(login="SIDOROV")).status_code == 409
    assert d.post("/api/users", json=new_user(login="x1", role="admin")).status_code == 422  # admin не выдаётся
    assert d.post("/api/users", json=new_user(login="x2", role="king")).status_code == 422
    assert d.post("/api/users", json=new_user(login="ab")).status_code == 422
    assert d.post("/api/users", json=new_user(login="кириллица")).status_code == 422
    assert d.post("/api/users", json=new_user(login="x3", password="123")).status_code == 422
    assert d.post("/api/users", json=new_user(login="x4", full_name="  ")).status_code == 422
    r = d.post("/api/users", json=new_user(login="x5", project_ids=["00000000-0000-0000-0000-000000000009"]))
    assert r.status_code == 422


def test_update_role_and_projects(ctx: Ctx):
    p = ctx.project()
    boss = ctx.user("director")
    d = ctx.login(boss)
    emp = ctx.user("foreman")
    r = d.patch(f"/api/users/{emp.id}", json={"role": "pto", "project_ids": [str(p.id)], "full_name": "Новое ФИО"})
    assert r.status_code == 200
    assert r.json()["role"] == "pto" and r.json()["project_ids"] == [str(p.id)]
    assert d.patch(f"/api/users/{emp.id}", json={"role": "admin"}).status_code == 422
    assert d.patch(f"/api/users/{boss.id}", json={"role": "pm"}).status_code == 400  # своя роль
    assert d.patch(f"/api/users/{boss.id}", json={"position": "Генеральный директор"}).status_code == 200
    assert d.patch("/api/users/00000000-0000-0000-0000-000000000009", json={}).status_code == 404
    with get_sessionmaker()() as db:
        acts = list(db.scalars(select(AuditLog.action).order_by(AuditLog.id)))
    assert acts.count("user.role_changed") == 1 and "user.projects_changed" in acts and "user.updated" in acts


def test_role_change_applies_to_live_session(ctx: Ctx):
    d = ctx.login(ctx.user("director"))
    emp = ctx.user("pm")
    e = ctx.login(emp)
    assert "dashboard" in e.get("/api/auth/me").json()["sections"]
    d.patch(f"/api/users/{emp.id}", json={"role": "supply"})
    assert e.get("/api/auth/me").json()["sections"] == ["projects", "procurement", "warehouse", "assistant"]


def test_reset_password(ctx: Ctx):
    boss = ctx.user("director")
    d = ctx.login(boss)
    emp = ctx.user("pm")
    old_session = ctx.login(emp)
    r = d.post(f"/api/users/{emp.id}/reset-password", json={})
    assert r.status_code == 200
    temp = r.json()["temporary_password"]
    assert len(temp) >= 8
    assert old_session.get("/api/auth/me").status_code == 401
    assert make_client().post("/api/auth/login", json={"login": emp.login, "password": PASSWORD}).status_code == 401
    c = make_client()
    me = c.post("/api/auth/login", json={"login": emp.login, "password": temp}).json()
    assert me["user"]["must_change_password"] is True
    # заданный вручную временный пароль
    r = d.post(f"/api/users/{emp.id}/reset-password", json={"password": "Given12345"})
    assert r.json()["temporary_password"] == "Given12345"
    assert d.post(f"/api/users/{boss.id}/reset-password", json={}).status_code == 400


def test_block_unblock(ctx: Ctx):
    boss = ctx.user("director")
    d = ctx.login(boss)
    emp = ctx.user("pm")
    s = ctx.login(emp)
    r = d.post(f"/api/users/{emp.id}/block", json={})
    assert r.status_code == 200 and r.json()["is_active"] is False
    assert s.get("/api/auth/me").status_code == 401
    assert make_client().post("/api/auth/login", json={"login": emp.login, "password": PASSWORD}).status_code == 403
    assert d.post(f"/api/users/{emp.id}/unblock", json={}).json()["is_active"] is True
    assert ctx.login(emp).get("/api/auth/me").status_code == 200
    assert d.post(f"/api/users/{boss.id}/block", json={}).status_code == 400


def test_admin_hidden_from_director(ctx: Ctx):
    admin = ctx.user("admin", login="petr")
    d = ctx.login(ctx.user("director"))
    assert "petr" not in [u["login"] for u in d.get("/api/users").json()]
    assert d.patch(f"/api/users/{admin.id}", json={"full_name": "x"}).status_code == 404
    assert d.post(f"/api/users/{admin.id}/block", json={}).status_code == 404
    a = ctx.login(admin)
    assert "petr" in [u["login"] for u in a.get("/api/users").json()]


def test_audit_log_endpoint(ctx: Ctx):
    d = ctx.login(ctx.user("director", login="boss"))
    d.post("/api/users", json=new_user())
    rows = d.get("/api/audit").json()
    assert [r["action"] for r in rows] == ["user.created", "auth.login"]
    assert rows[0]["action_label"] == "Создан сотрудник"
    assert rows[0]["user_name"].startswith("Тест director")
    assert rows[0]["ip"] is None  # TestClient шлёт хост "testclient" — не IP
    assert len(d.get("/api/audit?limit=1").json()) == 1
    assert d.get("/api/audit?limit=0").status_code == 422


def test_projects_visibility(ctx: Ctx):
    a, b = ctx.project("А"), ctx.project("Б")
    fore = ctx.login(ctx.user("foreman", projects=[a]))
    acc = ctx.login(ctx.user("accountant"))
    assert [p["name"] for p in fore.get("/api/projects").json()] == ["А"]
    assert fore.get(f"/api/projects/{b.id}").status_code == 404
    assert fore.get(f"/api/projects/{a.id}").status_code == 200
    assert [p["name"] for p in acc.get("/api/projects").json()] == ["А", "Б"]
    pm = ctx.user("pm")
    # РП без project.create
    assert ctx.login(pm).post("/api/projects", json={"name": "В"}).status_code == 403


def test_bootstrap_director_once(capsys):
    assert bootstrap() == 0
    assert bootstrap() == 0
    with get_sessionmaker()() as db:
        directors = list(db.scalars(select(User).where(User.role == "director")))
    assert len(directors) == 1
    d = directors[0]
    assert d.login == "director" and d.full_name == "Карабасов Аслан" and d.must_change_password
    assert "уже есть" in capsys.readouterr().out

from sqlalchemy import select

from app.db import get_sessionmaker
from app.models import AuditLog
from tests.conftest import ORIGIN, PASSWORD, Ctx, make_client


def actions() -> list[str]:
    with get_sessionmaker()() as db:
        return list(db.scalars(select(AuditLog.action).order_by(AuditLog.id)))


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "db": "ok"}
    assert client.head("/api/health").status_code == 200  # curl -I при проверке на сервере


def test_login_me_logout(ctx: Ctx, client):
    u = ctx.user("pm", login="ivanov")
    r = client.post("/api/auth/login", json={"login": "  IVANOV ", "password": PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["login"] == "ivanov"
    assert "employees" not in body["sections"] and "projects" in body["sections"]
    assert body["all_projects"] is False
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert client.get("/api/auth/me").json()["user"]["id"] == str(u.id)
    assert client.post("/api/auth/logout", json={}).status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert actions() == ["auth.login", "auth.logout"]


def test_cookie_secure_flag(ctx: Ctx, monkeypatch):
    from app.config import get_settings

    ctx.user("pm", login="sec")
    monkeypatch.setattr(get_settings(), "cookie_secure", True)
    r = make_client().post("/api/auth/login", json={"login": "sec", "password": PASSWORD})
    assert "secure" in r.headers["set-cookie"].lower()


def test_wrong_password_and_unknown_login(ctx: Ctx, client):
    ctx.user("pm", login="petrov")
    r = client.post("/api/auth/login", json={"login": "petrov", "password": "wrong"})
    assert r.status_code == 401 and r.json()["detail"] == "Неверный логин или пароль"
    r = client.post("/api/auth/login", json={"login": "nobody", "password": "wrong"})
    assert r.status_code == 401 and r.json()["detail"] == "Неверный логин или пароль"
    assert actions() == ["auth.login_failed", "auth.login_failed"]


def test_login_validation(client):
    assert client.post("/api/auth/login", json={"login": "", "password": "x"}).status_code == 422
    assert client.post("/api/auth/login", json={"login": "a"}).status_code == 422
    assert client.post("/api/auth/login", json={"login": "a", "password": "x", "extra": 1}).status_code == 422


def test_blocked_user_cannot_login(ctx: Ctx, client):
    ctx.user("pm", login="blocked", active=False)
    r = client.post("/api/auth/login", json={"login": "blocked", "password": PASSWORD})
    assert r.status_code == 403


def test_rate_limit_5_failures_per_10_min(ctx: Ctx, client):
    ctx.user("pm", login="brute")
    for _ in range(5):
        assert client.post("/api/auth/login", json={"login": "brute", "password": "bad"}).status_code == 401
    # 6-я попытка блокируется даже с верным паролем
    r = client.post("/api/auth/login", json={"login": "brute", "password": PASSWORD})
    assert r.status_code == 429
    assert "auth.login_rate_limited" in actions()


def test_rate_limit_window_expires(ctx: Ctx, client):
    from sqlalchemy import text

    ctx.user("pm", login="brute2")
    for _ in range(5):
        client.post("/api/auth/login", json={"login": "brute2", "password": "bad"})
    with get_sessionmaker()() as db:
        db.execute(text("UPDATE login_attempts SET at = now() - interval '11 minutes'"))
        db.commit()
    assert client.post("/api/auth/login", json={"login": "brute2", "password": PASSWORD}).status_code == 200


def test_success_resets_failures(ctx: Ctx, client):
    ctx.user("pm", login="forgetful")
    for _ in range(4):
        client.post("/api/auth/login", json={"login": "forgetful", "password": "bad"})
    assert client.post("/api/auth/login", json={"login": "forgetful", "password": PASSWORD}).status_code == 200
    for _ in range(4):
        assert client.post("/api/auth/login", json={"login": "forgetful", "password": "bad"}).status_code == 401
    assert client.post("/api/auth/login", json={"login": "forgetful", "password": PASSWORD}).status_code == 200


def test_temp_password_flow(ctx: Ctx):
    u = ctx.user("foreman", login="novice", must_change=True)
    c = ctx.login(u)
    assert c.get("/api/auth/me").json()["user"]["must_change_password"] is True
    assert c.get("/api/projects").json()["detail"] == "password_change_required"
    # неверный текущий пароль
    r = c.post("/api/auth/change-password", json={"current_password": "bad", "new_password": "Newpass123"})
    assert r.status_code == 400
    # слабый новый
    r = c.post("/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "short"})
    assert r.status_code == 422
    r = c.post("/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "onlyletters"})
    assert r.status_code == 422
    # тот же пароль
    r = c.post("/api/auth/change-password", json={"current_password": PASSWORD, "new_password": PASSWORD})
    assert r.status_code == 400
    r = c.post("/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "Newpass123"})
    assert r.status_code == 200 and r.json()["user"]["must_change_password"] is False
    assert c.get("/api/projects").status_code == 200
    assert ctx.login(u, "Newpass123").get("/api/auth/me").status_code == 200


def test_password_change_invalidates_other_sessions(ctx: Ctx):
    u = ctx.user("pm", login="twosessions")
    a, b = ctx.login(u), ctx.login(u)
    r = a.post("/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "Another123"})
    assert r.status_code == 200
    assert a.get("/api/auth/me").status_code == 200
    assert b.get("/api/auth/me").status_code == 401


def test_tampered_token_rejected(ctx: Ctx, client):
    ctx.user("pm", login="tamper")
    client.post("/api/auth/login", json={"login": "tamper", "password": PASSWORD})
    token = client.cookies.get("stroyai_session")
    assert token
    client.cookies.set("stroyai_session", token[:-2] + "xx")
    assert client.get("/api/auth/me").status_code == 401


def test_origin_required_for_mutations(ctx: Ctx):
    from fastapi.testclient import TestClient

    from app.main import app

    ctx.user("pm", login="csrf")
    bare = TestClient(app, base_url=ORIGIN)
    r = bare.post("/api/auth/login", json={"login": "csrf", "password": PASSWORD})
    assert r.status_code == 403 and "Origin" in r.json()["detail"]
    r = bare.post("/api/auth/login", json={"login": "csrf", "password": PASSWORD},
                  headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    # GET без Origin допустим
    assert bare.get("/api/health").status_code == 200


def test_json_only_for_mutations(ctx: Ctx, client):
    ctx.user("pm", login="form")
    r = client.post("/api/auth/login", data={"login": "form", "password": PASSWORD})
    assert r.status_code == 415
    r = client.post("/api/auth/login", content=b'{"login":"form","password":"x"}',
                    headers={"Content-Type": "text/plain"})
    assert r.status_code == 415


def test_session_endpoint(ctx: Ctx, client):
    assert client.get("/api/auth/session").json() == {"me": None}
    u = ctx.user("supply", login="snab", must_change=True)
    client.post("/api/auth/login", json={"login": "snab", "password": PASSWORD})
    me = client.get("/api/auth/session").json()["me"]
    assert me["user"]["id"] == str(u.id) and me["user"]["must_change_password"] is True
    client.cookies.set("stroyai_session", "garbage")
    assert client.get("/api/auth/session").json() == {"me": None}

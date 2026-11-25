from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.routers import auth, misc, users
from app.security import PUBLIC

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}

app = FastAPI(title="СтройAI API", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)


@app.middleware("http")
async def csrf_guard(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    """Изменяющие запросы: только с разрешённого Origin и только JSON (защита от CSRF)."""
    if request.method in MUTATING and request.url.path.startswith("/api/"):
        origin = (request.headers.get("origin") or "").rstrip("/")
        if not origin or origin not in get_settings().origins:
            return JSONResponse({"detail": "Запрос отклонён: недопустимый источник (Origin)"}, status_code=403)
        ctype = request.headers.get("content-type", "").split(";")[0].strip().lower()
        if ctype != "application/json":
            return JSONResponse({"detail": "Ожидается Content-Type: application/json"}, status_code=415)
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


api = APIRouter(prefix="/api")


@api.api_route("/health", methods=["GET", "HEAD"], dependencies=[Depends(PUBLIC)], tags=["health"])
def health(db: Session = Depends(get_db)) -> JSONResponse:
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse({"status": "error", "db": "unavailable"}, status_code=503)
    return JSONResponse({"status": "ok", "db": "ok"})


api.include_router(auth.router)
api.include_router(users.router)
api.include_router(misc.router)
app.include_router(api)

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://stroyai:stroyai@localhost:5432/stroyai"
    secret_key: str = Field(min_length=32)
    # Secure-флаг cookie: true на сервере (HTTPS), false для локальных e2e по http
    cookie_secure: bool = True
    cookie_name: str = "stroyai_session"
    session_hours: int = 12
    # Разрешённые Origin для изменяющих запросов, через запятую: https://app.stroika.petr-ai.ru
    allowed_origins: str = ""
    permissions_path: Path = REPO_ROOT / "shared" / "permissions.json"

    login_max_failures: int = 5
    login_window_minutes: int = 10

    director_login: str = ""
    director_password: str = ""
    director_name: str = "Директор"

    @property
    def origins(self) -> set[str]:
        return {o.strip().rstrip("/") for o in self.allowed_origins.split(",") if o.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()

"""Матрица прав из shared/permissions.json (генерируется из frontend/src/domain/permissions.ts)."""

import json
from dataclasses import dataclass
from functools import lru_cache

from app.config import get_settings

# Роль admin — служебная: создаётся только командой CLI, в интерфейсе выдачи не показывается
SERVICE_ROLES = frozenset({"admin"})


@dataclass(frozen=True)
class Matrix:
    roles: dict[str, str]
    sections: dict[str, list[str]]
    permissions: dict[str, list[str]]
    all_projects_roles: frozenset[str]
    raw: dict[str, object]

    def can(self, role: str, perm: str) -> bool:
        return perm in self.permissions.get(role, [])

    @property
    def assignable_roles(self) -> list[str]:
        return [r for r in self.roles if r not in SERVICE_ROLES]


@lru_cache
def get_matrix() -> Matrix:
    raw = json.loads(get_settings().permissions_path.read_text(encoding="utf-8"))
    return Matrix(
        roles=raw["roles"],
        sections=raw["sections"],
        permissions=raw["permissions"],
        all_projects_roles=frozenset(raw["allProjectsRoles"]),
        raw=raw,
    )

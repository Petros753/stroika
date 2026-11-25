import re
import uuid
from datetime import datetime
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.permissions import get_matrix

LOGIN_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")


def _check_login(v: str) -> str:
    v = v.strip().lower()
    if not LOGIN_RE.match(v):
        raise ValueError("Логин: 3–64 символа, латинские буквы, цифры, точка, дефис, подчёркивание")
    return v


def _check_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Пароль должен быть не короче 8 символов")
    if not (any(c.isdigit() for c in v) and any(c.isalpha() for c in v)):
        raise ValueError("Пароль должен содержать буквы и цифры")
    return v


def _check_assignable_role(v: str) -> str:
    if v not in get_matrix().assignable_roles:
        raise ValueError("Недопустимая роль")
    return v


Login = Annotated[str, AfterValidator(_check_login)]
Password = Annotated[str, StringConstraints(max_length=128), AfterValidator(_check_password)]
AssignableRole = Annotated[str, AfterValidator(_check_assignable_role)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Text200 = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginIn(Strict):
    login: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=64)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class ChangePasswordIn(Strict):
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    new_password: Password


class ProjectRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    login: str
    full_name: str
    position: str
    role: str
    must_change_password: bool
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
    project_ids: list[uuid.UUID]


class MeOut(BaseModel):
    user: UserOut
    sections: list[str]
    permissions: list[str]
    all_projects: bool


class SessionOut(BaseModel):
    me: MeOut | None


class UserCreate(Strict):
    login: Login
    full_name: Name
    position: Text200 = ""
    role: AssignableRole
    password: Password
    project_ids: list[uuid.UUID] = Field(default_factory=list, max_length=500)


class UserUpdate(Strict):
    full_name: Name | None = None
    position: Text200 | None = None
    role: AssignableRole | None = None
    project_ids: list[uuid.UUID] | None = Field(default=None, max_length=500)


class ResetPasswordIn(Strict):
    password: Password | None = None


class ResetPasswordOut(BaseModel):
    temporary_password: str


class ProjectCreate(Strict):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    address: str
    created_at: datetime


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    at: datetime
    user_id: uuid.UUID | None
    user_name: str | None
    action: str
    action_label: str
    target_type: str | None
    target_id: str | None
    details: dict[str, Any]
    ip: str | None

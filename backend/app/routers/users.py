import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import audit
from app.db import get_db
from app.models import Project, User
from app.permissions import SERVICE_ROLES
from app.schemas import ResetPasswordIn, ResetPasswordOut, UserCreate, UserOut, UserUpdate
from app.security import Access, generate_temp_password, hash_password

router = APIRouter(prefix="/users", tags=["users"])

MANAGE = Access("employees.manage")


def user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id,
        login=u.login,
        full_name=u.full_name,
        position=u.position,
        role=u.role,
        must_change_password=u.must_change_password,
        is_active=u.is_active,
        last_login_at=u.last_login_at,
        created_at=u.created_at,
        project_ids=sorted((p.id for p in u.projects), key=str),
    )


def _load_projects(db: Session, ids: list[uuid.UUID]) -> list[Project]:
    unique = list(dict.fromkeys(ids))
    if not unique:
        return []
    found = list(db.scalars(select(Project).where(Project.id.in_(unique))))
    if len(found) != len(unique):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Указан несуществующий объект")
    return found


def _get_target(db: Session, user_id: uuid.UUID, actor: User) -> User:
    target = db.get(User, user_id)
    # Служебные учётные записи (admin) скрыты от всех, кроме администратора
    if target is None or (target.role in SERVICE_ROLES and actor.role not in SERVICE_ROLES):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сотрудник не найден")
    return target


@router.get("", response_model=list[UserOut])
def list_users(actor: User = Depends(MANAGE), db: Session = Depends(get_db)) -> list[UserOut]:
    q = select(User).order_by(User.is_active.desc(), User.full_name)
    if actor.role not in SERVICE_ROLES:
        q = q.where(User.role.not_in(SERVICE_ROLES))
    return [user_out(u) for u in db.scalars(q)]


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    data: UserCreate, request: Request, actor: User = Depends(MANAGE), db: Session = Depends(get_db)
) -> UserOut:
    if db.scalar(select(User.id).where(User.login == data.login)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Логин уже занят")
    user = User(
        login=data.login,
        full_name=data.full_name,
        position=data.position,
        role=data.role,
        password_hash=hash_password(data.password),
        must_change_password=True,
        is_active=True,
        token_version=0,
        projects=_load_projects(db, data.project_ids),
    )
    db.add(user)
    db.flush()
    audit(
        db,
        "user.created",
        user_id=actor.id,
        request=request,
        target_type="user",
        target_id=user.id,
        details={"login": user.login, "full_name": user.full_name, "role": user.role,
                 "project_ids": [str(p.id) for p in user.projects]},
    )
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    request: Request,
    actor: User = Depends(MANAGE),
    db: Session = Depends(get_db),
) -> UserOut:
    user = _get_target(db, user_id, actor)
    fields: dict[str, object] = {}
    if data.full_name is not None and data.full_name != user.full_name:
        fields["full_name"] = [user.full_name, data.full_name]
        user.full_name = data.full_name
    if data.position is not None and data.position != user.position:
        fields["position"] = [user.position, data.position]
        user.position = data.position
    if fields:
        audit(db, "user.updated", user_id=actor.id, request=request, target_type="user", target_id=user.id,
              details=fields)
    if data.role is not None and data.role != user.role:
        if user.id == actor.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя изменить собственную роль")
        audit(db, "user.role_changed", user_id=actor.id, request=request, target_type="user",
              target_id=user.id, details={"from": user.role, "to": data.role})
        user.role = data.role
    if data.project_ids is not None:
        new = _load_projects(db, data.project_ids)
        old_ids = {p.id for p in user.projects}
        new_ids = {p.id for p in new}
        if old_ids != new_ids:
            user.projects = new
            audit(db, "user.projects_changed", user_id=actor.id, request=request, target_type="user",
                  target_id=user.id,
                  details={"added": sorted(str(i) for i in new_ids - old_ids),
                           "removed": sorted(str(i) for i in old_ids - new_ids)})
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.post("/{user_id}/reset-password", response_model=ResetPasswordOut)
def reset_password(
    user_id: uuid.UUID,
    data: ResetPasswordIn,
    request: Request,
    actor: User = Depends(MANAGE),
    db: Session = Depends(get_db),
) -> ResetPasswordOut:
    user = _get_target(db, user_id, actor)
    if user.id == actor.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Свой пароль меняйте через «Сменить пароль»")
    temp = data.password or generate_temp_password()
    user.password_hash = hash_password(temp)
    user.must_change_password = True
    user.token_version += 1
    audit(db, "user.password_reset", user_id=actor.id, request=request, target_type="user", target_id=user.id)
    db.commit()
    return ResetPasswordOut(temporary_password=temp)


def _set_active(db: Session, request: Request, actor: User, user_id: uuid.UUID, active: bool) -> UserOut:
    user = _get_target(db, user_id, actor)
    if user.id == actor.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя заблокировать собственную учётную запись")
    if user.is_active != active:
        user.is_active = active
        user.token_version += 1
        audit(db, "user.unblocked" if active else "user.blocked", user_id=actor.id, request=request,
              target_type="user", target_id=user.id)
        db.commit()
        db.refresh(user)
    return user_out(user)


@router.post("/{user_id}/block", response_model=UserOut)
def block_user(
    user_id: uuid.UUID, request: Request, actor: User = Depends(MANAGE), db: Session = Depends(get_db)
) -> UserOut:
    return _set_active(db, request, actor, user_id, False)


@router.post("/{user_id}/unblock", response_model=UserOut)
def unblock_user(
    user_id: uuid.UUID, request: Request, actor: User = Depends(MANAGE), db: Session = Depends(get_db)
) -> UserOut:
    return _set_active(db, request, actor, user_id, True)

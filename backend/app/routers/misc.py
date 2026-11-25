import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.audit import ACTION_LABEL, audit
from app.db import get_db
from app.models import AuditLog, Project, User, user_projects
from app.permissions import get_matrix
from app.schemas import AuditOut, ProjectCreate, ProjectOut
from app.security import Access

router = APIRouter()


@router.get("/permissions")
def permissions_matrix(_: User = Depends(Access())) -> dict[str, object]:
    return get_matrix().raw


# ---- Объекты (минимум для назначения сотрудникам; полностью — этап 2) ----


def visible_projects_query(user: User) -> Select[tuple[Project]]:
    q = select(Project).order_by(Project.name)
    if user.role not in get_matrix().all_projects_roles:
        q = q.join(user_projects, user_projects.c.project_id == Project.id).where(
            user_projects.c.user_id == user.id
        )
    return q


@router.get("/projects", response_model=list[ProjectOut], tags=["projects"])
def list_projects(user: User = Depends(Access()), db: Session = Depends(get_db)) -> list[Project]:
    return list(db.scalars(visible_projects_query(user)))


@router.get("/projects/{project_id}", response_model=ProjectOut, tags=["projects"])
def get_project(project_id: uuid.UUID, user: User = Depends(Access()), db: Session = Depends(get_db)) -> Project:
    project = db.scalar(visible_projects_query(user).where(Project.id == project_id))
    if project is None:
        # Не раскрываем, существует ли чужой объект
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Объект не найден")
    return project


@router.post("/projects", response_model=ProjectOut, status_code=201, tags=["projects"])
def create_project(
    data: ProjectCreate,
    request: Request,
    user: User = Depends(Access("project.create")),
    db: Session = Depends(get_db),
) -> Project:
    project = Project(name=data.name, address=data.address)
    db.add(project)
    db.flush()
    if user.role not in get_matrix().all_projects_roles:
        user.projects.append(project)
    audit(db, "project.created", user_id=user.id, request=request, target_type="project",
          target_id=project.id, details={"name": project.name})
    db.commit()
    return project


# ---- Журнал действий ----


@router.get("/audit", response_model=list[AuditOut], tags=["audit"])
def audit_log(
    _: User = Depends(Access("employees.manage")),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    before_id: int | None = Query(None, ge=1),
    action: str | None = Query(None, max_length=64),
) -> list[AuditOut]:
    q = (
        select(AuditLog, User.full_name)
        .outerjoin(User, User.id == AuditLog.user_id)
        .order_by(AuditLog.id.desc())
        .limit(limit)
    )
    if before_id is not None:
        q = q.where(AuditLog.id < before_id)
    if action:
        q = q.where(AuditLog.action == action)
    return [
        AuditOut(
            id=row.id,
            at=row.at,
            user_id=row.user_id,
            user_name=name,
            action=row.action,
            action_label=ACTION_LABEL.get(row.action, row.action),
            target_type=row.target_type,
            target_id=row.target_id,
            details=row.details,
            ip=str(row.ip) if row.ip is not None else None,
        )
        for row, name in db.execute(q).all()
    ]

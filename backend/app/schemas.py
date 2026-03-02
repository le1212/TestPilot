from pydantic import BaseModel, PlainSerializer
from typing import Optional, Any, Annotated
from datetime import datetime, timezone


def _serialize_datetime_utc(dt: datetime | None) -> str | None:
    """序列化为 ISO 字符串并统一为 UTC（带 Z），避免前端时区错乱。"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


# 用于 API 输出的 datetime，序列化时带 Z 表示 UTC
DateTimeIsoUTC = Annotated[datetime, PlainSerializer(_serialize_datetime_utc, return_type=str | None)]


# ─── Project ───

class ProjectCreate(BaseModel):
    name: str
    description: str = ""

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class ProjectOut(BaseModel):
    id: int
    name: str
    description: str
    created_at: DateTimeIsoUTC
    updated_at: DateTimeIsoUTC
    case_count: int = 0
    created_by_id: Optional[int] = None
    member_ids: list[int] = []
    created_by_name: Optional[str] = None
    model_config = {"from_attributes": True}


# ─── TestCase ───

class TestCaseCreate(BaseModel):
    project_id: int
    group_id: Optional[int] = None
    name: str
    type: str = "api"
    priority: str = "medium"
    status: str = "draft"
    tags: list[str] = []
    description: str = ""
    config: dict[str, Any] = {}
    collaborator_ids: list[int] = []

class TestCaseUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    group_id: Optional[int] = None
    tags: Optional[list[str]] = None
    description: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    collaborator_ids: Optional[list[int]] = None
    default_environment_id: Optional[int] = None


class TestCaseBatchUpdate(BaseModel):
    case_ids: list[int]
    priority: Optional[str] = None
    status: Optional[str] = None
    group_id: Optional[int] = None
    description: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    collaborator_ids: Optional[list[int]] = None
    default_environment_id: Optional[int] = None

class TestCaseOut(BaseModel):
    id: int
    project_id: int
    project_name: Optional[str] = None
    group_id: Optional[int] = None
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    name: str
    type: str
    priority: str
    status: str
    tags: list[str]
    description: str
    config: dict[str, Any]
    collaborator_ids: list[int] = []
    default_environment_id: Optional[int] = None
    created_at: DateTimeIsoUTC
    updated_at: DateTimeIsoUTC
    model_config = {"from_attributes": True}


# ─── CaseGroup ───

class CaseGroupCreate(BaseModel):
    project_id: int
    name: str

class CaseGroupUpdate(BaseModel):
    name: Optional[str] = None
    collaborator_ids: Optional[list[int]] = None

class CaseGroupOut(BaseModel):
    id: int
    project_id: int
    name: str
    created_by_id: Optional[int] = None
    collaborator_ids: list[int] = []
    sort_order: int
    case_count: int = 0
    created_at: DateTimeIsoUTC
    updated_at: DateTimeIsoUTC
    model_config = {"from_attributes": True}


# ─── Environment ───

class EnvironmentCreate(BaseModel):
    project_id: int
    name: str
    base_url: str = ""
    variables: dict[str, str] = {}
    headers: dict[str, str] = {}
    description: str = ""

class EnvironmentUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    variables: Optional[dict[str, str]] = None
    headers: Optional[dict[str, str]] = None
    description: Optional[str] = None

class EnvironmentOut(BaseModel):
    id: int
    project_id: int
    project_name: Optional[str] = None
    name: str
    base_url: str
    variables: dict[str, str]
    headers: dict[str, str]
    description: str
    created_at: DateTimeIsoUTC
    updated_at: DateTimeIsoUTC
    model_config = {"from_attributes": True}


# ─── Execution ───

class ExecutionCreate(BaseModel):
    test_case_id: int
    environment_id: Optional[int] = None
    run_type: Optional[str] = None   # 执行时优先使用，不依赖数据库中的用例类型
    run_config: Optional[dict[str, Any]] = None

class ExecutionBatchCreate(BaseModel):
    test_case_ids: list[int]
    environment_id: Optional[int] = None

class ExecutionOut(BaseModel):
    id: int
    test_case_id: int
    environment_id: Optional[int]
    environment_name: Optional[str] = None
    project_name: Optional[str] = None
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    status: str
    result: dict[str, Any]
    logs: str
    duration_ms: int
    started_at: Optional[DateTimeIsoUTC]
    finished_at: Optional[DateTimeIsoUTC]
    created_at: DateTimeIsoUTC
    case_name: str = ""
    case_type: str = ""
    case_created_by_id: Optional[int] = None
    case_collaborator_ids: list[int] = []
    model_config = {"from_attributes": True}


class ExecutionListOut(BaseModel):
    data: list[ExecutionOut]
    total: int


# ─── Defect ───

class DefectCreate(BaseModel):
    project_id: int
    execution_id: Optional[int] = None
    test_case_id: Optional[int] = None
    title: str
    description: str = ""
    severity: str = "major"
    priority: str = "medium"
    status: str = "open"
    assignee: str = ""
    screenshots: list[str] = []
    steps_to_reproduce: str = ""
    expected_result: str = ""
    actual_result: str = ""

class DefectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assignee: Optional[str] = None
    screenshots: Optional[list[str]] = None
    steps_to_reproduce: Optional[str] = None
    expected_result: Optional[str] = None
    actual_result: Optional[str] = None
    jira_key: Optional[str] = None

class DefectBatchUpdate(BaseModel):
    defect_ids: list[int]
    status: Optional[str] = None
    severity: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None


class DefectOut(BaseModel):
    id: int
    project_id: int
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    execution_id: Optional[int]
    test_case_id: Optional[int]
    title: str
    description: str
    severity: str
    priority: str = "medium"
    status: str
    assignee: str
    screenshots: list[str]
    steps_to_reproduce: str
    expected_result: str
    actual_result: str
    jira_key: str = ""
    created_at: DateTimeIsoUTC
    updated_at: DateTimeIsoUTC
    case_name: str = ""
    project_name: str = ""
    model_config = {"from_attributes": True}


class DefectCommentCreate(BaseModel):
    content: str


class DefectCommentOut(BaseModel):
    id: int
    defect_id: int
    user_id: int
    user_display: str = ""
    content: str
    created_at: DateTimeIsoUTC
    model_config = {"from_attributes": True}


class DefectLogOut(BaseModel):
    id: int
    defect_id: int
    user_id: Optional[int] = None
    user_display: str = ""
    action_message: str
    created_at: DateTimeIsoUTC
    model_config = {"from_attributes": True}


# ─── TestReport ───

class ReportCreate(BaseModel):
    project_id: int
    name: str
    execution_ids: list[int] = []
    status_filter: Optional[str] = None  # 仅包含指定状态：passed / failed / error，为空表示全部

class ReportOut(BaseModel):
    id: int
    project_id: int
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    name: str
    summary: dict[str, Any]
    execution_ids: list[int]
    total: int
    passed: int
    failed: int
    error: int
    pass_rate: str
    duration_ms: int
    details: list[dict[str, Any]]
    created_at: DateTimeIsoUTC
    project_name: str = ""
    model_config = {"from_attributes": True}


# ─── Log ───

class LogEntry(BaseModel):
    id: int
    execution_id: int
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    project_name: Optional[str] = None
    case_name: str
    case_type: str
    status: str
    logs: str
    duration_ms: int
    created_at: DateTimeIsoUTC


# ─── Auth / User ───

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    token: str
    user: "UserOut"
    warnings: list[str] = []


class UserOut(BaseModel):
    id: int
    username: str
    real_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_admin: bool
    disabled: bool
    created_at: DateTimeIsoUTC
    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    """管理员新建：仅填姓名/邮箱/手机，系统生成9位登录账号与9位字母数字密码"""
    real_name: Optional[str] = None
    is_admin: bool = False
    email: Optional[str] = None
    phone: Optional[str] = None


class UserCreateResult(BaseModel):
    user: UserOut
    login_account: str
    initial_password: str


class UserUpdate(BaseModel):
    real_name: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None
    disabled: Optional[bool] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class ProfileUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None


class UserProfileOut(BaseModel):
    """供聊天中查看他人资料：基础信息+联系方式（空则前端占位），任意登录用户可获取"""
    id: int
    username: str
    real_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


TokenResponse.model_rebuild()


# ─── Notification ───

class NotificationOut(BaseModel):
    id: int
    user_id: Optional[int]
    title: str
    content: str
    type: str
    extra: dict[str, Any]
    created_at: DateTimeIsoUTC
    read: bool = False
    model_config = {"from_attributes": True}


# ─── Dashboard ───

class DashboardStats(BaseModel):
    total_projects: int
    total_cases: int
    total_executions: int
    pass_rate: float
    cases_by_type: dict[str, int]
    cases_by_priority: dict[str, int]
    recent_executions: list[ExecutionOut]
    execution_trend: list[dict[str, Any]]
    recent_cases: list[dict[str, Any]] = []
    pending_defects: list[dict[str, Any]] = []
    today_executions: list[dict[str, Any]] = []

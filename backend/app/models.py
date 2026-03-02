from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Enum as SAEnum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import enum


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)  # 登录账号
    real_name = Column(String(100), default="", nullable=True)  # 真实姓名
    password_hash = Column(String(255), nullable=False)
    email = Column(String(255), default="", nullable=True)
    phone = Column(String(50), default="", nullable=True)
    is_admin = Column(Boolean, default=False, nullable=False)
    disabled = Column(Boolean, default=False, nullable=False)
    reset_token = Column(String(64), nullable=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Notification(Base):
    """站内通知（user_id 为 null 表示全员）。"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String(500), nullable=False)
    content = Column(Text, default="")
    type = Column(String(50), default="system")
    extra = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class NotificationRead(Base):
    """用户已读记录。"""
    __tablename__ = "notification_reads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    notification_id = Column(Integer, ForeignKey("notifications.id"), nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), server_default=func.now())


class TestType(str, enum.Enum):
    API = "api"
    WEB = "web"
    APP = "app"
    MINIAPP = "miniapp"


class Priority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class CaseStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    DEPRECATED = "deprecated"


class ExecutionStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"
    CANCELLED = "cancelled"


class DefectSeverity(str, enum.Enum):
    BLOCKER = "blocker"
    CRITICAL = "critical"
    MAJOR = "major"
    MINOR = "minor"
    TRIVIAL = "trivial"


class DefectStatus(str, enum.Enum):
    OPEN = "open"                    # 待处理
    IN_PROGRESS = "in_progress"      # 处理中
    FIXED = "fixed"                  # 已修复（开发修复完成）
    PENDING_VERIFICATION = "pending_verification"  # 待验证（流转给测试人员验证）
    VERIFIED = "verified"            # 已验证
    CLOSED = "closed"                # 已关闭
    REJECTED = "rejected"            # 已拒绝


class Project(Base):
    """项目：创建人为负责人；仅负责人或管理员可编辑/删除；成员可查看与在项目下建用例。"""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # 负责人/创建人
    member_ids = Column(JSON, default=list)  # 成员用户 id 列表，可查看项目并在其下建用例
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    test_cases = relationship("TestCase", back_populates="project", cascade="all, delete-orphan")
    case_groups = relationship("CaseGroup", back_populates="project", cascade="all, delete-orphan")
    environments = relationship("Environment", back_populates="project", cascade="all, delete-orphan")


class CaseGroup(Base):
    """用例分组：归属项目，分组名可自定义；仅创建人、管理员、协作者可删除和在该分组下新建用例。"""
    __tablename__ = "case_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(200), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    collaborator_ids = Column(JSON, default=list)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="case_groups")
    test_cases = relationship("TestCase", back_populates="case_group", foreign_keys="TestCase.group_id")


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("case_groups.id"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String(500), nullable=False)
    type = Column(SAEnum(TestType), nullable=False, default=TestType.API)
    priority = Column(SAEnum(Priority), default=Priority.MEDIUM)
    status = Column(SAEnum(CaseStatus), default=CaseStatus.DRAFT)
    tags = Column(JSON, default=list)
    description = Column(Text, default="")
    config = Column(JSON, default=dict)
    collaborator_ids = Column(JSON, default=list)  # 协作者用户 id 列表，与创建人、管理员均可编辑
    default_environment_id = Column(Integer, ForeignKey("environments.id"), nullable=True)  # 编辑页默认选中的执行环境，保存后下次打开会回显
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="test_cases")
    case_group = relationship("CaseGroup", back_populates="test_cases", foreign_keys=[group_id])
    executions = relationship("TestExecution", back_populates="test_case", cascade="all, delete-orphan")


class Environment(Base):
    __tablename__ = "environments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(200), nullable=False)
    base_url = Column(String(500), default="")
    variables = Column(JSON, default=dict)
    headers = Column(JSON, default=dict)
    description = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="environments")


class TestExecution(Base):
    __tablename__ = "test_executions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    test_case_id = Column(Integer, ForeignKey("test_cases.id"), nullable=False, index=True)
    environment_id = Column(Integer, ForeignKey("environments.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(SAEnum(ExecutionStatus), default=ExecutionStatus.PENDING, index=True)
    result = Column(JSON, default=dict)
    logs = Column(Text, default="")
    duration_ms = Column(Integer, default=0)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    test_case = relationship("TestCase", back_populates="executions")
    environment = relationship("Environment")
    defects = relationship("Defect", back_populates="execution", cascade="all, delete-orphan")


class Defect(Base):
    __tablename__ = "defects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    execution_id = Column(Integer, ForeignKey("test_executions.id"), nullable=True)
    test_case_id = Column(Integer, ForeignKey("test_cases.id"), nullable=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, default="")
    severity = Column(SAEnum(DefectSeverity), default=DefectSeverity.MAJOR)
    priority = Column(String(20), default="medium")  # low/medium/high/critical，与 severity 独立
    status = Column(SAEnum(DefectStatus), default=DefectStatus.OPEN)
    assignee = Column(String(100), default="")
    screenshots = Column(JSON, default=list)
    steps_to_reproduce = Column(Text, default="")
    expected_result = Column(Text, default="")
    actual_result = Column(Text, default="")
    jira_key = Column(String(50), default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project = relationship("Project")
    execution = relationship("TestExecution", back_populates="defects")
    test_case = relationship("TestCase")


class AuditLog(Base):
    """操作审计日志：记录关键操作（删除项目/用例、修改权限、重置密码等）。"""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    target_type = Column(String(50), default="")
    target_id = Column(Integer, nullable=True)
    detail = Column(Text, default="")
    ip_address = Column(String(50), default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DefectComment(Base):
    """缺陷讨论区：评论。"""
    __tablename__ = "defect_comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    defect_id = Column(Integer, ForeignKey("defects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DefectLog(Base):
    """缺陷操作日志：什么时间谁进行了什么操作。"""
    __tablename__ = "defect_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    defect_id = Column(Integer, ForeignKey("defects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action_message = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SystemConfig(Base):
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, default="")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TestReport(Base):
    __tablename__ = "test_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String(500), nullable=False)
    summary = Column(JSON, default=dict)
    execution_ids = Column(JSON, default=list)
    total = Column(Integer, default=0)
    passed = Column(Integer, default=0)
    failed = Column(Integer, default=0)
    error = Column(Integer, default=0)
    pass_rate = Column(String(10), default="0")
    duration_ms = Column(Integer, default=0)
    details = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project")


# ──────────────── AI 答疑 ────────────────

class AIConversation(Base):
    """AI 答疑会话。"""
    __tablename__ = "ai_conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(500), default="新对话")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    messages = relationship("AIMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="AIMessage.created_at")


class AIMessage(Base):
    """AI 答疑消息。"""
    __tablename__ = "ai_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # user / assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("AIConversation", back_populates="messages")


# ──────────────── 即时通讯 ────────────────

class ChatRoomType(str, enum.Enum):
    PRIVATE = "private"
    GROUP = "group"
    BOT = "bot"


class ChatRoom(Base):
    """聊天房间：私聊、群聊、系统机器人。"""
    __tablename__ = "chat_rooms"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), default="")
    type = Column(SAEnum(ChatRoomType), nullable=False, default=ChatRoomType.PRIVATE)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    avatar = Column(String(500), default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    members = relationship("ChatRoomMember", back_populates="room", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="room", cascade="all, delete-orphan", order_by="ChatMessage.created_at")


class ChatRoomMember(Base):
    """聊天房间成员。"""
    __tablename__ = "chat_room_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(Integer, ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    last_read_message_id = Column(Integer, default=0, nullable=False)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    room = relationship("ChatRoom", back_populates="members")


class ChatMessage(Base):
    """聊天消息。"""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(Integer, ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    msg_type = Column(String(20), default="text")  # text / image / file / system
    reply_to_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True, index=True)  # 引用回复的消息 ID
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    room = relationship("ChatRoom", back_populates="messages")

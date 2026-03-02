from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event

from .config import DATABASE_URL

_is_sqlite = DATABASE_URL.startswith("sqlite")

_engine_kwargs: dict = {"echo": False}
if _is_sqlite:
    _engine_kwargs["connect_args"] = {"timeout": 30}

engine = create_async_engine(DATABASE_URL, **_engine_kwargs)

if _is_sqlite:
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


_COMPAT_MIGRATIONS: list[str] = [
    "ALTER TABLE defects ADD COLUMN jira_key VARCHAR(50) DEFAULT ''",
    "ALTER TABLE test_cases ADD COLUMN created_by_id INTEGER",
    "ALTER TABLE test_executions ADD COLUMN created_by_id INTEGER",
    "ALTER TABLE defects ADD COLUMN created_by_id INTEGER",
    "ALTER TABLE test_reports ADD COLUMN created_by_id INTEGER",
    "ALTER TABLE test_cases ADD COLUMN collaborator_ids TEXT DEFAULT '[]'",
    "ALTER TABLE test_cases ADD COLUMN default_environment_id INTEGER",
    "ALTER TABLE users ADD COLUMN email VARCHAR(255) DEFAULT ''",
    "ALTER TABLE users ADD COLUMN phone VARCHAR(255) DEFAULT ''",
    "ALTER TABLE users ADD COLUMN real_name VARCHAR(100)",
    "ALTER TABLE users ADD COLUMN reset_token VARCHAR(64)",
    "ALTER TABLE users ADD COLUMN reset_token_expires DATETIME",
    "ALTER TABLE test_cases ADD COLUMN group_id INTEGER",
    "ALTER TABLE projects ADD COLUMN created_by_id INTEGER",
    "ALTER TABLE projects ADD COLUMN member_ids TEXT",
    "UPDATE projects SET member_ids = '[]' WHERE member_ids IS NULL",
    "ALTER TABLE chat_room_members ADD COLUMN last_read_message_id INTEGER DEFAULT 0",
    "ALTER TABLE defects ADD COLUMN priority VARCHAR(20) DEFAULT 'medium'",
    "ALTER TABLE chat_messages ADD COLUMN reply_to_id INTEGER",
    "ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0",
]


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        def _run_compat_migrations(sync_conn):
            from sqlalchemy import text
            for sql in _COMPAT_MIGRATIONS:
                try:
                    sync_conn.execute(text(sql))
                except Exception:
                    pass
        await conn.run_sync(_run_compat_migrations)

    try:
        from .models import User
        from .password_utils import hash_password
        async with async_session() as session:
            from sqlalchemy import select
            r = await session.execute(select(User).limit(1))
            if r.scalar_one_or_none() is None:
                admin = User(
                    username="admin",
                    password_hash=hash_password("admin123"),
                    is_admin=True,
                    disabled=False,
                    token_version=1,
                )
                session.add(admin)
                await session.commit()
    except Exception:
        pass

"""
Create or reset admin user (username: admin, password: admin123).
Run from backend directory: python -m app.scripts.seed_admin
"""
import asyncio
import sys
import os

# ensure backend is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


async def main():
    from app.database import async_session
    from app.models import User
    from app.password_utils import hash_password
    from sqlalchemy import select

    async with async_session() as session:
        r = await session.execute(select(User).where(User.username == "admin"))
        user = r.scalar_one_or_none()
        if user:
            user.password_hash = hash_password("admin123")
            user.disabled = False
            user.is_admin = True
            await session.commit()
            print("OK: admin password reset to admin123")
        else:
            admin = User(
                username="admin",
                password_hash=hash_password("admin123"),
                is_admin=True,
                disabled=False,
            )
            session.add(admin)
            await session.commit()
            print("OK: admin user created (password: admin123)")
    return 0


if __name__ == "__main__":
    try:
        exit(asyncio.run(main()))
    except Exception as e:
        print("Error:", e, file=sys.stderr)
        exit(1)

# -*- coding: utf-8 -*-
"""
清除 TestPilot 项目数据：
- 删除数据库文件（testplatform.db 及 SQLite 相关文件）
- 清空 uploads、allure-reports、allure-results、screenshots
- 重新初始化空数据库并创建默认管理员 admin / admin123

使用前请先停止后端服务，再在 backend 目录执行：python clear_data.py
"""
import asyncio
import os
import shutil
import sys

# 脚本所在目录即 backend
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))


def remove_file(path: str) -> bool:
    """删除单个文件，忽略不存在。"""
    try:
        if os.path.isfile(path):
            os.remove(path)
            print(f"  已删除: {path}")
            return True
    except Exception as e:
        print(f"  删除失败 {path}: {e}")
    return False


def clear_dir(path: str, keep_dir: bool = True) -> int:
    """清空目录内容，可选保留目录本身。返回删除的文件/目录数。"""
    count = 0
    try:
        if not os.path.isdir(path):
            return 0
        for name in os.listdir(path):
            full = os.path.join(path, name)
            if os.path.isfile(full):
                os.remove(full)
                count += 1
                print(f"  已删除: {full}")
            else:
                shutil.rmtree(full, ignore_errors=True)
                count += 1
                print(f"  已删除目录: {full}")
    except Exception as e:
        print(f"  清空目录失败 {path}: {e}")
    return count


def main():
    print("正在清除项目数据…\n")

    # 1. 数据库文件（与 database.py 中默认路径一致：./testplatform.db 相对于 backend）
    db_base = os.path.join(BACKEND_DIR, "testplatform.db")
    for suffix in ("", "-journal", "-wal", "-shm"):
        remove_file(db_base + suffix)

    # 2. 上传文件目录
    uploads_dir = os.path.join(BACKEND_DIR, "uploads")
    if os.path.isdir(uploads_dir):
        print(f"清空目录: {uploads_dir}")
        clear_dir(uploads_dir)

    # 3. Allure 报告与结果
    for name in ("allure-reports", "allure-results"):
        d = os.path.join(BACKEND_DIR, name)
        if os.path.isdir(d):
            print(f"清空目录: {d}")
            clear_dir(d)

    # 4. 截图目录
    screenshots_dir = os.path.join(BACKEND_DIR, "screenshots")
    if os.path.isdir(screenshots_dir):
        print(f"清空目录: {screenshots_dir}")
        clear_dir(screenshots_dir)

    # 5. 重新初始化数据库（建表 + 默认 admin 用户）
    print("\n正在重新初始化数据库…")
    sys.path.insert(0, BACKEND_DIR)
    try:
        from app.database import init_db
        asyncio.run(init_db())
        print("数据库已重新初始化，默认账号：admin / admin123")
    except Exception as e:
        print(f"初始化数据库失败: {e}")
        print("请先停止后端服务后重试；若需仅清空数据不重建，可注释掉本脚本中 init_db 相关代码。")
        return 1

    print("\n项目数据已清除完毕。")
    return 0


if __name__ == "__main__":
    sys.exit(main())

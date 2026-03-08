"""待办事项管理服务"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from src.core.components.base.service import BaseService
from src.app.plugin_system.api.log_api import get_logger

from ..models import TodoItem, TodoStatus, EventPriority
from . import get_plugin_db

logger = get_logger("desktop_pet_scheduler")


class TodoService(BaseService):
    """待办事项管理服务"""

    service_name = "todo_service"
    service_description = "待办事项的增删改查与状态管理"
    version = "1.0.0"

    # ── 创建 ──────────────────────────────────────────────────

    async def create_todo(
        self,
        title: str,
        *,
        description: str = "",
        priority: str = EventPriority.NORMAL.value,
        due_date: str = "",
        tags: str = "",
        stream_id: str = "",
        user_id: str = "",
    ) -> TodoItem:
        """创建待办事项"""
        now = datetime.now().isoformat()
        data = {
            "title": title,
            "description": description,
            "status": TodoStatus.PENDING.value,
            "priority": priority,
            "due_date": due_date,
            "tags": tags,
            "stream_id": stream_id,
            "user_id": user_id,
            "created_at": now,
            "updated_at": now,
            "completed_at": "",
            "is_deleted": False,
        }
        db = get_plugin_db()
        row = await db.crud(TodoItem).create(data)
        logger.info(f"待办已创建: {title}")
        return row

    # ── 查询 ──────────────────────────────────────────────────

    async def get_todo(self, todo_id: int) -> Optional[TodoItem]:
        """通过 ID 获取待办事项"""
        db = get_plugin_db()
        return await db.crud(TodoItem).get(id=todo_id)

    async def list_todos(
        self,
        stream_id: str = "",
        user_id: str = "",
        status: str = "",
        priority: str = "",
        skip: int = 0,
        limit: int = 100,
    ) -> list[TodoItem]:
        """列出待办事项，支持状态和优先级过滤"""
        kwargs: dict = {"is_deleted": False}
        if stream_id:
            kwargs["stream_id"] = stream_id
        if user_id:
            kwargs["user_id"] = user_id
        if status:
            kwargs["status"] = status
        if priority:
            kwargs["priority"] = priority

        db = get_plugin_db()
        return await db.crud(TodoItem).get_multi(skip=skip, limit=limit, **kwargs)

    async def list_pending(self, stream_id: str = "", user_id: str = "") -> list[TodoItem]:
        """列出所有未完成的待办"""
        return await self.list_todos(
            stream_id=stream_id, user_id=user_id, status=TodoStatus.PENDING.value
        )

    async def list_overdue(self, stream_id: str = "", user_id: str = "") -> list[TodoItem]:
        """列出已过期未完成的待办"""
        pending = await self.list_pending(stream_id=stream_id, user_id=user_id)
        today = datetime.now().strftime("%Y-%m-%d")
        return [
            t for t in pending
            if t.due_date and t.due_date[:10] < today
        ]

    async def search_todos(self, keyword: str, stream_id: str = "") -> list[TodoItem]:
        """按关键词搜索待办"""
        kwargs: dict = {"is_deleted": False}
        if stream_id:
            kwargs["stream_id"] = stream_id

        db = get_plugin_db()
        items = await db.crud(TodoItem).get_multi(limit=500, **kwargs)
        keyword_lower = keyword.lower()
        return [
            t for t in items
            if keyword_lower in (t.title or "").lower()
            or keyword_lower in (t.description or "").lower()
        ]

    # ── 状态变更 ──────────────────────────────────────────────

    async def toggle_todo(self, todo_id: int) -> Optional[TodoItem]:
        """切换待办完成状态：pending <-> done"""
        todo = await self.get_todo(todo_id)
        if not todo:
            return None

        now = datetime.now().isoformat()
        if todo.status == TodoStatus.DONE.value:
            new_status = TodoStatus.PENDING.value
            completed_at = ""
        else:
            new_status = TodoStatus.DONE.value
            completed_at = now

        db = get_plugin_db()
        row = await db.crud(TodoItem).update(id=todo_id, obj_in={
            "status": new_status,
            "completed_at": completed_at,
            "updated_at": now,
        })
        if row:
            action = "已完成" if new_status == TodoStatus.DONE.value else "重新打开"
            logger.info(f"待办{action}: id={todo_id}")
        return row

    async def set_status(self, todo_id: int, status: str) -> Optional[TodoItem]:
        """设置待办状态"""
        now = datetime.now().isoformat()
        fields: dict = {"status": status, "updated_at": now}
        if status == TodoStatus.DONE.value:
            fields["completed_at"] = now
        db = get_plugin_db()
        return await db.crud(TodoItem).update(id=todo_id, obj_in=fields)

    # ── 更新 ──────────────────────────────────────────────────

    async def update_todo(self, todo_id: int, **fields) -> Optional[TodoItem]:
        """更新待办字段"""
        fields["updated_at"] = datetime.now().isoformat()
        db = get_plugin_db()
        return await db.crud(TodoItem).update(id=todo_id, obj_in=fields)

    # ── 删除 ──────────────────────────────────────────────────

    async def delete_todo(self, todo_id: int) -> bool:
        """软删除待办"""
        db = get_plugin_db()
        row = await db.crud(TodoItem).update(id=todo_id, obj_in={
            "is_deleted": True,
            "updated_at": datetime.now().isoformat(),
        })
        return row is not None

    # ── 统计 ──────────────────────────────────────────────────

    async def get_stats(self, stream_id: str = "", user_id: str = "") -> dict:
        """获取待办统计数据"""
        all_todos = await self.list_todos(stream_id=stream_id, user_id=user_id)
        pending = sum(1 for t in all_todos if t.status == TodoStatus.PENDING.value)
        in_progress = sum(1 for t in all_todos if t.status == TodoStatus.IN_PROGRESS.value)
        done = sum(1 for t in all_todos if t.status == TodoStatus.DONE.value)
        cancelled = sum(1 for t in all_todos if t.status == TodoStatus.CANCELLED.value)
        overdue = len(await self.list_overdue(stream_id=stream_id, user_id=user_id))

        return {
            "total": len(all_todos),
            "pending": pending,
            "in_progress": in_progress,
            "done": done,
            "cancelled": cancelled,
            "overdue": overdue,
            "completion_rate": f"{done / len(all_todos) * 100:.1f}%" if all_todos else "0%",
        }

    # ── 格式化 ────────────────────────────────────────────────

    @staticmethod
    def format_todo_list(todos: list[TodoItem], title: str = "待办列表") -> str:
        """格式化待办列表为可读文本"""
        if not todos:
            return f"-- {title} --\n暂无待办事项"
        lines = [f"-- {title} ({len(todos)} 项) --"]
        for i, t in enumerate(todos, 1):
            lines.append(f"  {i}. (id:{t.id}) {t.format_display()}")
        return "\n".join(lines)

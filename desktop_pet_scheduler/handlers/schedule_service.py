"""日程管理服务"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from src.core.components.base.service import BaseService
from src.app.plugin_system.api.log_api import get_logger

from ..models import ScheduleEvent, RepeatType, EventPriority
from . import get_plugin_db

logger = get_logger("desktop_pet_scheduler")


class ScheduleService(BaseService):
    """日程管理服务 - 提供日程 CRUD 及查询能力"""

    service_name = "schedule_service"
    service_description = "日程事件的增删改查与提醒调度"
    version = "1.0.0"

    # ── 创建 ──────────────────────────────────────────────────

    async def create_event(
        self,
        title: str,
        start_time: str,
        *,
        end_time: str = "",
        description: str = "",
        all_day: bool = False,
        repeat_type: str = RepeatType.NONE.value,
        priority: str = EventPriority.NORMAL.value,
        tags: str = "",
        reminder_minutes: int = 15,
        location: str = "",
        stream_id: str = "",
        user_id: str = "",
    ) -> ScheduleEvent:
        """创建一个新的日程事件"""
        now = datetime.now().isoformat()
        data = {
            "title": title,
            "description": description,
            "start_time": start_time,
            "end_time": end_time or start_time,
            "all_day": all_day,
            "repeat_type": repeat_type,
            "priority": priority,
            "tags": tags,
            "location": location,
            "reminder_minutes": reminder_minutes,
            "stream_id": stream_id,
            "user_id": user_id,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }
        db = get_plugin_db()
        row = await db.crud(ScheduleEvent).create(data)
        logger.info(f"日程已创建: {title} ({start_time})")
        return row

    # ── 查询 ──────────────────────────────────────────────────

    async def get_event(self, event_id: int) -> Optional[ScheduleEvent]:
        """通过 ID 获取单个日程"""
        db = get_plugin_db()
        return await db.crud(ScheduleEvent).get(id=event_id)

    async def list_events(
        self,
        stream_id: str = "",
        user_id: str = "",
        date: str = "",
        priority: str = "",
        skip: int = 0,
        limit: int = 50,
    ) -> list[ScheduleEvent]:
        """列出日程事件，支持按日期、优先级过滤"""
        kwargs: dict = {"is_deleted": False}
        if stream_id:
            kwargs["stream_id"] = stream_id
        if user_id:
            kwargs["user_id"] = user_id
        if priority:
            kwargs["priority"] = priority

        db = get_plugin_db()
        items = await db.crud(ScheduleEvent).get_multi(skip=skip, limit=limit, **kwargs)

        # 如果指定了日期，做内存过滤（按 start_time 的日期部分匹配）
        if date and items:
            items = [e for e in items if e.start_time and e.start_time[:10] == date[:10]]

        return items

    async def get_today_events(self, stream_id: str = "", user_id: str = "") -> list[ScheduleEvent]:
        """获取今日日程"""
        today = datetime.now().strftime("%Y-%m-%d")
        return await self.list_events(stream_id=stream_id, user_id=user_id, date=today)

    async def get_upcoming_events(
        self, minutes: int = 30, stream_id: str = "", user_id: str = ""
    ) -> list[ScheduleEvent]:
        """获取即将到来的日程（未来 N 分钟内）"""
        now = datetime.now()
        cutoff = now + timedelta(minutes=minutes)
        all_today = await self.get_today_events(stream_id=stream_id, user_id=user_id)

        upcoming = []
        for event in all_today:
            try:
                event_time = datetime.fromisoformat(event.start_time)
                if now <= event_time <= cutoff:
                    upcoming.append(event)
            except (ValueError, TypeError):
                continue

        return upcoming

    async def search_events(self, keyword: str, stream_id: str = "") -> list[ScheduleEvent]:
        """按关键词搜索日程（标题 / 描述）"""
        kwargs: dict = {"is_deleted": False}
        if stream_id:
            kwargs["stream_id"] = stream_id

        db = get_plugin_db()
        items = await db.crud(ScheduleEvent).get_multi(limit=500, **kwargs)
        keyword_lower = keyword.lower()
        return [
            e for e in items
            if keyword_lower in (e.title or "").lower()
            or keyword_lower in (e.description or "").lower()
        ]

    # ── 更新 ──────────────────────────────────────────────────

    async def update_event(self, event_id: int, **fields) -> Optional[ScheduleEvent]:
        """更新日程字段"""
        fields["updated_at"] = datetime.now().isoformat()
        db = get_plugin_db()
        row = await db.crud(ScheduleEvent).update(id=event_id, obj_in=fields)
        if row:
            logger.info(f"日程已更新: id={event_id}")
        return row

    # ── 删除 ──────────────────────────────────────────────────

    async def delete_event(self, event_id: int) -> bool:
        """软删除日程"""
        db = get_plugin_db()
        row = await db.crud(ScheduleEvent).update(id=event_id, obj_in={
            "is_deleted": True,
            "updated_at": datetime.now().isoformat(),
        })
        if row:
            logger.info(f"日程已删除: id={event_id}")
            return True
        return False

    # ── 统计 ──────────────────────────────────────────────────

    async def count_events(self, stream_id: str = "", user_id: str = "") -> int:
        """统计日程总数"""
        events = await self.list_events(stream_id=stream_id, user_id=user_id, limit=10000)
        return len(events)

    # ── 格式化 ────────────────────────────────────────────────

    @staticmethod
    def format_event_list(events: list[ScheduleEvent], title: str = "日程列表") -> str:
        """将事件列表格式化为可读文本"""
        if not events:
            return f"-- {title} --\n暂无日程"
        lines = [f"-- {title} ({len(events)} 项) --"]
        for i, e in enumerate(events, 1):
            lines.append(f"  {i}. {e.format_display()}")
        return "\n".join(lines)

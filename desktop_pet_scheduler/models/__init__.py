"""桌宠日程表 - 数据模型定义

使用 SQLAlchemy 2.0 Mapped 风格定义 ORM 模型，
配合 PluginDatabase 实现插件独立的 SQLite 持久化。
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Boolean, Integer, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Mapped, mapped_column

# 插件专用 Base，与主数据库隔离
Base = declarative_base()


# ─── 枚举 ─────────────────────────────────────────────────────


class RepeatType(str, Enum):
    """重复类型"""
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class EventPriority(str, Enum):
    """事件优先级"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class TodoStatus(str, Enum):
    """待办状态"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"


# ─── 日程相关模型 ─────────────────────────────────────────────


class ScheduleEvent(Base):
    """日程事件数据模型（SQLAlchemy ORM）"""

    __tablename__ = "schedule_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    start_time: Mapped[str] = mapped_column(Text, nullable=False, default="")
    end_time: Mapped[str] = mapped_column(Text, nullable=False, default="")
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    repeat_type: Mapped[str] = mapped_column(Text, nullable=False, default=RepeatType.NONE.value)
    priority: Mapped[str] = mapped_column(Text, nullable=False, default=EventPriority.NORMAL.value)
    tags: Mapped[str] = mapped_column(Text, nullable=False, default="")
    location: Mapped[str] = mapped_column(Text, nullable=False, default="")
    reminder_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    stream_id: Mapped[str] = mapped_column(Text, nullable=False, default="", index=True)
    user_id: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def to_dict(self) -> dict:
        """转为前端期望的格式（tags 为列表）"""
        tags_list = [t.strip() for t in self.tags.split(",") if t.strip()] if self.tags else []
        return {
            "id": str(self.id),
            "title": self.title,
            "description": self.description,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "all_day": self.all_day,
            "repeat_type": self.repeat_type,
            "priority": self.priority,
            "tags": tags_list,
            "remind_before_minutes": self.reminder_minutes,
            "location": self.location,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "is_deleted": self.is_deleted,
        }

    def format_display(self) -> str:
        """格式化为可读的展示文本"""
        priority_icons = {
            "low": "[低]",
            "normal": "[中]",
            "high": "[高]",
            "urgent": "[紧急]",
        }
        icon = priority_icons.get(self.priority, "[中]")
        time_str = self.start_time[:16] if self.start_time else "未设定时间"
        if self.all_day:
            time_str = self.start_time[:10] + " 全天" if self.start_time else "全天"
        tags_str = f" #{self.tags.replace(',', ' #')}" if self.tags else ""
        return f"{icon} {self.title} | {time_str}{tags_str}"


# ─── 待办事项模型 ─────────────────────────────────────────────


class TodoItem(Base):
    """待办事项数据模型（SQLAlchemy ORM）"""

    __tablename__ = "todo_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(Text, nullable=False, default=TodoStatus.PENDING.value)
    priority: Mapped[str] = mapped_column(Text, nullable=False, default=EventPriority.NORMAL.value)
    due_date: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tags: Mapped[str] = mapped_column(Text, nullable=False, default="")
    stream_id: Mapped[str] = mapped_column(Text, nullable=False, default="", index=True)
    user_id: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, default="")
    completed_at: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def to_dict(self) -> dict:
        """转为前端期望的格式（tags 为列表）"""
        tags_list = [t.strip() for t in self.tags.split(",") if t.strip()] if self.tags else []
        return {
            "id": str(self.id),
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "priority": self.priority,
            "due_date": self.due_date,
            "tags": tags_list,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "completed_at": self.completed_at,
            "is_deleted": self.is_deleted,
        }

    def format_display(self) -> str:
        """格式化为可读的展示文本"""
        status_icons = {
            "pending": "[ ]",
            "in_progress": "[~]",
            "done": "[x]",
            "cancelled": "[-]",
        }
        priority_marks = {
            "low": "",
            "normal": "*",
            "high": "**",
            "urgent": "!!!",
        }
        icon = status_icons.get(self.status, "[ ]")
        mark = priority_marks.get(self.priority, "")
        due_str = f" (截止: {self.due_date[:10]})" if self.due_date else ""
        return f"{icon} {mark}{self.title}{due_str}"


# ─── Live2D 模型配置（非 DB 模型，仅内存态） ──────────────────


class Live2DModel:
    """Live2D 模型配置"""

    def __init__(
        self,
        model_id: str = "",
        name: str = "",
        model_path: str = "",
        model_json: str = "",
        preview_image: str = "",
        description: str = "",
        motions: Optional[dict] = None,
        expressions: Optional[list[str]] = None,
        expression_defs: Optional[list[dict]] = None,
        is_active: bool = False,
    ):
        self.model_id = model_id
        self.name = name
        self.model_path = model_path  # 模型根目录路径
        self.model_json = model_json  # model3.json 文件名
        self.preview_image = preview_image
        self.description = description
        self.motions = motions or {}  # {"idle": [...], "tap": [...], ...}
        self.expressions = expressions or []
        self.expression_defs = expression_defs or []  # [{"Name": ..., "File": ...}, ...]
        self.is_active = is_active

    def to_dict(self) -> dict:
        return {
            "model_id": self.model_id,
            "name": self.name,
            "model_path": self.model_path,
            "model_json": self.model_json,
            "preview_image": self.preview_image,
            "description": self.description,
            "motions": self.motions,
            "expressions": self.expressions,
            "expression_defs": self.expression_defs,
            "is_active": self.is_active,
        }

    def to_api_dict(self) -> dict:
        """返回前端期望的字段格式"""
        motion_names = []
        if isinstance(self.motions, dict):
            for group in self.motions.values():
                if isinstance(group, list):
                    for m in group:
                        if isinstance(m, dict) and "File" in m:
                            motion_names.append(m["File"])
                        elif isinstance(m, str):
                            motion_names.append(m)
        # 构建可通过 HTTP 访问的 URL
        model_url = f"/api/pet-scheduler/live2d/assets/{self.model_id}/{self.model_json}"
        preview_url = ""
        if self.preview_image:
            import os
            preview_filename = os.path.basename(self.preview_image)
            preview_url = f"/api/pet-scheduler/live2d/assets/{self.model_id}/{preview_filename}"

        return {
            "id": self.model_id,
            "name": self.name,
            "path": self.model_path,
            "model_file": model_url,
            "preview_image": preview_url,
            "motions": motion_names,
            "expressions": self.expressions,
            "expression_defs": self.expression_defs,
            "description": self.description,
        }

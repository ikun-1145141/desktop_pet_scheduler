"""桌宠日程表 - Neo-MoFox 插件入口

集日程管理、待办事项、Live2D 桌宠、智能对话于一体的插件。
"""

from __future__ import annotations

from src.core.components.base import BasePlugin
from src.core.components.loader import register_plugin
from src.app.plugin_system.api.log_api import get_logger

# ── 配置 ──────────────────────────────────────────────────────
from .config import PetSchedulerConfig

# ── 服务层 ────────────────────────────────────────────────────
from .handlers.schedule_service import ScheduleService
from .handlers.todo_service import TodoService
from .handlers.live2d_service import Live2DService

# ── Action 组件 ──────────────────────────────────────────────
from .components.schedule import CreateScheduleAction, SendScheduleListAction
from .components.todo import CreateTodoAction, SendTodoListAction, ToggleTodoAction

# ── Tool 组件 ────────────────────────────────────────────────
from .components.schedule import QueryScheduleTool
from .components.todo import QueryTodoTool
from .components.live2d import Live2DStatusTool

# ── Command 组件 ─────────────────────────────────────────────
from .components.commands import ScheduleCommand, TodoCommand, PetCommand

# ── Chatter 组件 ─────────────────────────────────────────────
from .components.chatter import PetChatter

# ── EventHandler 组件 ────────────────────────────────────────
from .components.events import ReminderHandler, StartupHandler

# ── Router 组件 ──────────────────────────────────────────────
from .components.router import PetApiRouter

logger = get_logger("desktop_pet_scheduler")


@register_plugin
class DesktopPetSchedulerPlugin(BasePlugin):
    """桌宠日程表插件 - 你的桌面宠物日程管理助手"""

    plugin_name = "desktop_pet_scheduler"
    plugin_description = "集日程管理、待办事项、Live2D 桌宠、智能对话于一体的 Neo-MoFox 插件"
    plugin_version = "1.0.0"

    configs = [PetSchedulerConfig]

    def get_components(self) -> list[type]:
        return [
            # 服务层
            ScheduleService,
            TodoService,
            Live2DService,
            # Actions
            CreateScheduleAction,
            SendScheduleListAction,
            CreateTodoAction,
            SendTodoListAction,
            ToggleTodoAction,
            # Tools
            QueryScheduleTool,
            QueryTodoTool,
            Live2DStatusTool,
            # Commands
            ScheduleCommand,
            TodoCommand,
            PetCommand,
            # Chatter
            PetChatter,
            # Event handlers
            ReminderHandler,
            StartupHandler,
            # Router
            PetApiRouter,
        ]

    async def on_plugin_loaded(self) -> None:
        # ── 初始化插件独立数据库 ──
        from src.app.plugin_system.api.storage_api import PluginDatabase
        from .models import Base, ScheduleEvent, TodoItem
        from .handlers import set_plugin_db

        db = PluginDatabase(
            "data/desktop_pet_scheduler/data.db",
            [ScheduleEvent, TodoItem],
        )
        await db.initialize()
        set_plugin_db(db)

        logger.info(f"桌宠日程表 v{self.plugin_version} 已加载")
        logger.info(
            "组件清单: "
            "3 Service, 5 Action, 3 Tool, 3 Command, "
            "1 Chatter, 2 EventHandler, 1 Router"
        )

    async def on_plugin_unloaded(self) -> None:
        from .handlers import _plugin_db

        if _plugin_db is not None:
            await _plugin_db.close()
            logger.info("桌宠日程表数据库已关闭")

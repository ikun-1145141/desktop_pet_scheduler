"""事件处理器 - 日程提醒与启动初始化"""

from __future__ import annotations

from typing import Any, cast

from src.core.components.base.event_handler import BaseEventHandler
from src.core.components.types import EventType
from src.core.managers import get_service_manager
from src.app.plugin_system.api.send_api import send_text
from src.app.plugin_system.api.log_api import get_logger
from src.kernel.event import EventDecision

from ..config import PetSchedulerConfig

logger = get_logger("desktop_pet_scheduler")


class ReminderHandler(BaseEventHandler):
    """日程提醒处理器 - 在消息到达时检查是否有即将到来的日程需要提醒"""

    handler_name = "reminder_handler"
    handler_description = "检查即将到来的日程并发送提醒"
    weight = 1  # 低权重，不影响其他处理器
    intercept_message = False
    init_subscribe = [EventType.ON_MESSAGE_RECEIVED]

    async def execute(
        self, event_name: str, params: dict[str, Any]
    ) -> tuple[EventDecision, dict[str, Any]]:
        config = cast(PetSchedulerConfig, self.plugin.config)
        if not config.reminder.enabled:
            return EventDecision.PASS, params

        # 获取消息的 stream_id（message 可能是 Message 对象或 dict）
        message = params.get("message")
        if message is None:
            return EventDecision.PASS, params
        stream_id = (
            message.get("stream_id", "") if isinstance(message, dict)
            else getattr(message, "stream_id", "")
        )
        if not stream_id:
            return EventDecision.PASS, params

        # 检查即将到来的日程
        sm = get_service_manager()
        svc = sm.get_service(
            f"{self.plugin.plugin_name}:service:schedule_service"
        )
        if not svc:
            return EventDecision.PASS, params

        try:
            upcoming = await svc.get_upcoming_events(
                minutes=config.reminder.default_minutes_before,
                stream_id=stream_id,
            )

            if upcoming:
                lines = [f"-- 日程提醒（{len(upcoming)} 项即将开始）--"]
                for event in upcoming:
                    lines.append(f"  > {event.format_display()}")
                reminder_text = "\n".join(lines)
                await send_text(reminder_text, stream_id)
                logger.info(f"已发送 {len(upcoming)} 条日程提醒到 {stream_id[:8]}...")

        except Exception as e:
            logger.warning(f"日程提醒检查失败: {e}")

        return EventDecision.SUCCESS, params  # 不拦截消息


class StartupHandler(BaseEventHandler):
    """启动处理器 - 插件加载完成后执行初始化"""

    handler_name = "startup_handler"
    handler_description = "插件加载后扫描 Live2D 模型并初始化"
    weight = 0
    init_subscribe = [EventType.ON_ALL_PLUGIN_LOADED]

    async def execute(
        self, event_name: str, params: dict[str, Any]
    ) -> tuple[EventDecision, dict[str, Any]]:
        logger.info("桌宠日程表插件正在初始化...")

        # 扫描 Live2D 模型
        config = cast(PetSchedulerConfig, self.plugin.config)
        sm = get_service_manager()
        live2d_svc = sm.get_service(
            f"{self.plugin.plugin_name}:service:live2d_service"
        )
        if live2d_svc:
            try:
                models_dir = config.pet.live2d_models_dir or ""
                models = await live2d_svc.scan_models(models_dir)
                logger.info(f"已加载 {len(models)} 个 Live2D 模型")
            except Exception as e:
                logger.warning(f"Live2D 模型扫描失败: {e}")

        logger.info("桌宠日程表插件初始化完成")
        return EventDecision.SUCCESS, params

"""日程相关的 Action 和 Tool 组件"""

from __future__ import annotations

from typing import Annotated

from src.core.components.base.action import BaseAction
from src.core.components.base.tool import BaseTool
from src.app.plugin_system.api.send_api import send_text
from src.core.managers import get_service_manager
from src.app.plugin_system.api.log_api import get_logger

logger = get_logger("desktop_pet_scheduler")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Actions（执行操作，有副作用）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class CreateScheduleAction(BaseAction):
    """创建新的日程事件"""

    action_name = "create_schedule"
    action_description = (
        "创建一个日程事件。需要标题和开始时间，"
        "可选设置结束时间、优先级(low/normal/high/urgent)、"
        "是否全天、重复类型(none/daily/weekly/monthly/yearly)、标签和提前提醒分钟数。"
    )
    primary_action = False

    async def execute(
        self,
        title: Annotated[str, "日程标题"],
        start_time: Annotated[str, "开始时间，ISO 格式如 2026-02-28T14:00:00"],
        end_time: Annotated[str, "结束时间，ISO 格式，不填则与开始时间相同"] = "",
        description: Annotated[str, "日程描述/备注"] = "",
        priority: Annotated[str, "优先级: low / normal / high / urgent"] = "normal",
        all_day: Annotated[bool, "是否为全天事件"] = False,
        repeat_type: Annotated[str, "重复类型: none / daily / weekly / monthly / yearly"] = "none",
        tags: Annotated[str, "逗号分隔的标签，如: 工作,会议"] = "",
        reminder_minutes: Annotated[int, "提前提醒的分钟数，0 表示不提醒"] = 15,
    ) -> tuple[bool, str]:
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:schedule_service")
        if not svc:
            return False, "日程服务不可用"

        try:
            event = await svc.create_event(
                title=title,
                start_time=start_time,
                end_time=end_time,
                description=description,
                priority=priority,
                all_day=all_day,
                repeat_type=repeat_type,
                tags=tags,
                reminder_minutes=reminder_minutes,
                stream_id=self.chat_stream.stream_id,
            )
            result_text = f"日程已创建: {event.format_display()}"
            await send_text(result_text, self.chat_stream.stream_id)
            return True, result_text
        except Exception as e:
            logger.error(f"创建日程失败: {e}")
            return False, f"创建日程失败: {str(e)}"


class SendScheduleListAction(BaseAction):
    """发送日程列表给用户"""

    action_name = "send_schedule_list"
    action_description = "查询并发送日程列表给用户，可按日期或关键词筛选"
    primary_action = True

    async def execute(
        self,
        date: Annotated[str, "要查询的日期，格式 YYYY-MM-DD，不填则查询今天"] = "",
        keyword: Annotated[str, "搜索关键词，不填则列出全部"] = "",
    ) -> tuple[bool, str]:
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:schedule_service")
        if not svc:
            return False, "日程服务不可用"

        try:
            if keyword:
                events = await svc.search_events(keyword, stream_id=self.chat_stream.stream_id)
                title = f"搜索结果: {keyword}"
            elif date:
                events = await svc.list_events(stream_id=self.chat_stream.stream_id, date=date)
                title = f"{date} 的日程"
            else:
                events = await svc.get_today_events(stream_id=self.chat_stream.stream_id)
                title = "今日日程"

            text = svc.format_event_list(events, title)
            await send_text(text, self.chat_stream.stream_id)
            return True, text
        except Exception as e:
            logger.error(f"查询日程失败: {e}")
            return False, f"查询日程失败: {str(e)}"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Tools（查询信息，无副作用）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class QueryScheduleTool(BaseTool):
    """查询日程信息供 LLM 参考"""

    tool_name = "query_schedule"
    tool_description = (
        "查询日程信息，返回结构化数据。可按日期、关键词查询，"
        "也可获取即将到来的日程。用于 LLM 在回复前了解用户的日程安排。"
    )

    async def execute(
        self,
        query_type: Annotated[
            str,
            "查询类型: today(今日日程) / date(指定日期) / upcoming(即将到来) / search(关键词搜索) / stats(统计)"
        ] = "today",
        date: Annotated[str, "日期，格式 YYYY-MM-DD（query_type=date 时使用）"] = "",
        keyword: Annotated[str, "搜索关键词（query_type=search 时使用）"] = "",
        upcoming_minutes: Annotated[int, "查询未来多少分钟内的日程（query_type=upcoming 时使用）"] = 30,
        stream_id: Annotated[str, "聊天流 ID，用于过滤当前用户的日程"] = "",
    ) -> tuple[bool, dict]:
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:schedule_service")
        if not svc:
            return False, {"error": "日程服务不可用"}

        try:
            if query_type == "today":
                events = await svc.get_today_events(stream_id=stream_id)
                return True, {
                    "type": "today",
                    "count": len(events),
                    "events": [e.to_dict() for e in events],
                }
            elif query_type == "date" and date:
                events = await svc.list_events(stream_id=stream_id, date=date)
                return True, {
                    "type": "date",
                    "date": date,
                    "count": len(events),
                    "events": [e.to_dict() for e in events],
                }
            elif query_type == "upcoming":
                events = await svc.get_upcoming_events(
                    minutes=upcoming_minutes, stream_id=stream_id
                )
                return True, {
                    "type": "upcoming",
                    "minutes": upcoming_minutes,
                    "count": len(events),
                    "events": [e.to_dict() for e in events],
                }
            elif query_type == "search" and keyword:
                events = await svc.search_events(keyword, stream_id=stream_id)
                return True, {
                    "type": "search",
                    "keyword": keyword,
                    "count": len(events),
                    "events": [e.to_dict() for e in events],
                }
            elif query_type == "stats":
                count = await svc.count_events(stream_id=stream_id)
                today = await svc.get_today_events(stream_id=stream_id)
                return True, {
                    "type": "stats",
                    "total_events": count,
                    "today_events": len(today),
                }
            else:
                return False, {"error": f"不支持的查询类型: {query_type}"}

        except Exception as e:
            logger.error(f"查询日程失败: {e}")
            return False, {"error": str(e)}

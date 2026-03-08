"""待办事项相关的 Action 和 Tool 组件"""

from __future__ import annotations

from typing import Annotated

from src.core.components.base.action import BaseAction
from src.core.components.base.tool import BaseTool
from src.app.plugin_system.api.send_api import send_text
from src.core.managers import get_service_manager
from src.app.plugin_system.api.log_api import get_logger

logger = get_logger("desktop_pet_scheduler")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Actions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class CreateTodoAction(BaseAction):
    """创建新的待办事项"""

    action_name = "create_todo"
    action_description = (
        "创建一个待办事项。只需标题即可，可选设置描述、优先级(low/normal/high/urgent)、"
        "截止日期和标签。"
    )
    primary_action = False

    async def execute(
        self,
        title: Annotated[str, "待办事项标题"],
        description: Annotated[str, "详细描述/备注"] = "",
        priority: Annotated[str, "优先级: low / normal / high / urgent"] = "normal",
        due_date: Annotated[str, "截止日期，ISO 格式如 2026-03-01"] = "",
        tags: Annotated[str, "逗号分隔的标签，如: 工作,紧急"] = "",
    ) -> tuple[bool, str]:
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:todo_service")
        if not svc:
            return False, "待办服务不可用"

        try:
            todo = await svc.create_todo(
                title=title,
                description=description,
                priority=priority,
                due_date=due_date,
                tags=tags,
                stream_id=self.chat_stream.stream_id,
            )
            result_text = f"待办已创建: {todo.format_display()}"
            await send_text(result_text, self.chat_stream.stream_id)
            return True, result_text
        except Exception as e:
            logger.error(f"创建待办失败: {e}")
            return False, f"创建待办失败: {str(e)}"


class SendTodoListAction(BaseAction):
    """发送待办列表给用户"""

    action_name = "send_todo_list"
    action_description = "查询并发送待办事项列表，可按状态或关键词筛选"
    primary_action = True

    async def execute(
        self,
        status: Annotated[str, "筛选状态: pending / in_progress / done / cancelled / all"] = "pending",
        keyword: Annotated[str, "搜索关键词，不填则列出全部"] = "",
    ) -> tuple[bool, str]:
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:todo_service")
        if not svc:
            return False, "待办服务不可用"

        try:
            stream_id = self.chat_stream.stream_id

            if keyword:
                todos = await svc.search_todos(keyword, stream_id=stream_id)
                title = f"搜索结果: {keyword}"
            elif status == "all":
                todos = await svc.list_todos(stream_id=stream_id)
                title = "全部待办"
            else:
                todos = await svc.list_todos(stream_id=stream_id, status=status)
                status_labels = {
                    "pending": "待处理",
                    "in_progress": "进行中",
                    "done": "已完成",
                    "cancelled": "已取消",
                }
                title = f"{status_labels.get(status, status)} 待办"

            text = svc.format_todo_list(todos, title)
            await send_text(text, self.chat_stream.stream_id)
            return True, text
        except Exception as e:
            logger.error(f"查询待办失败: {e}")
            return False, f"查询待办失败: {str(e)}"


class ToggleTodoAction(BaseAction):
    """切换待办事项完成状态"""

    action_name = "toggle_todo"
    action_description = "切换指定待办事项的完成状态（未完成 <-> 已完成），需要提供待办 ID"
    primary_action = False

    async def execute(
        self,
        todo_id: Annotated[int, "待办事项的数字 ID"],
    ) -> tuple[bool, str]:
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:todo_service")
        if not svc:
            return False, "待办服务不可用"

        try:
            todo = await svc.toggle_todo(todo_id)
            if not todo:
                return False, f"未找到 ID 为 {todo_id} 的待办事项"

            status_text = "已完成" if todo.status == "done" else "重新打开"
            result_text = f"待办 #{todo_id} {status_text}: {todo.title}"
            await send_text(result_text, self.chat_stream.stream_id)
            return True, result_text
        except Exception as e:
            logger.error(f"切换待办状态失败: {e}")
            return False, f"操作失败: {str(e)}"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Tools
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class QueryTodoTool(BaseTool):
    """查询待办信息供 LLM 参考"""

    tool_name = "query_todo"
    tool_description = (
        "查询待办事项信息，返回结构化数据。"
        "可按状态筛选、搜索关键词、获取统计信息或查看逾期待办。"
    )

    async def execute(
        self,
        query_type: Annotated[
            str,
            "查询类型: pending(未完成) / all(全部) / overdue(逾期) / search(搜索) / stats(统计)"
        ] = "pending",
        keyword: Annotated[str, "搜索关键词（query_type=search 时使用）"] = "",
        stream_id: Annotated[str, "聊天流 ID，用于过滤当前用户的待办"] = "",
    ) -> tuple[bool, dict]:
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:todo_service")
        if not svc:
            return False, {"error": "待办服务不可用"}

        try:
            if query_type == "pending":
                todos = await svc.list_pending(stream_id=stream_id)
                return True, {
                    "type": "pending",
                    "count": len(todos),
                    "todos": [t.to_dict() for t in todos],
                }
            elif query_type == "all":
                todos = await svc.list_todos(stream_id=stream_id)
                return True, {
                    "type": "all",
                    "count": len(todos),
                    "todos": [t.to_dict() for t in todos],
                }
            elif query_type == "overdue":
                todos = await svc.list_overdue(stream_id=stream_id)
                return True, {
                    "type": "overdue",
                    "count": len(todos),
                    "todos": [t.to_dict() for t in todos],
                }
            elif query_type == "search" and keyword:
                todos = await svc.search_todos(keyword, stream_id=stream_id)
                return True, {
                    "type": "search",
                    "keyword": keyword,
                    "count": len(todos),
                    "todos": [t.to_dict() for t in todos],
                }
            elif query_type == "stats":
                stats = await svc.get_stats(stream_id=stream_id)
                return True, {"type": "stats", **stats}
            else:
                return False, {"error": f"不支持的查询类型: {query_type}"}

        except Exception as e:
            logger.error(f"查询待办失败: {e}")
            return False, {"error": str(e)}

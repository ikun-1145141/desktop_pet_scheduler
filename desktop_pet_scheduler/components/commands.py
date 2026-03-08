"""命令组件 - 提供 /schedule, /todo, /pet 命令"""

from __future__ import annotations

from datetime import datetime

from src.core.components.base.command import BaseCommand, cmd_route
from src.app.plugin_system.api.send_api import send_text
from src.core.managers import get_service_manager
from src.app.plugin_system.api.log_api import get_logger

logger = get_logger("desktop_pet_scheduler")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  /schedule 命令
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ScheduleCommand(BaseCommand):
    """日程管理命令"""

    command_name = "schedule"
    command_description = "日程管理: /schedule today | add <标题> <时间> | delete <id> | search <关键词>"
    command_prefix = "/"

    @cmd_route("today")
    async def handle_today(self) -> tuple[bool, str]:
        """查看今日日程"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:schedule_service")
        if not svc:
            return False, "日程服务不可用"

        events = await svc.get_today_events(stream_id=self.stream_id)
        text = svc.format_event_list(events, "今日日程")
        await send_text(text, self.stream_id)
        return True, text

    @cmd_route("list")
    async def handle_list(self, date: str = "") -> tuple[bool, str]:
        """查看指定日期的日程"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:schedule_service")
        if not svc:
            return False, "日程服务不可用"

        if not date:
            date = datetime.now().strftime("%Y-%m-%d")

        events = await svc.list_events(stream_id=self.stream_id, date=date)
        text = svc.format_event_list(events, f"{date} 的日程")
        await send_text(text, self.stream_id)
        return True, text

    @cmd_route("add")
    async def handle_add(self, title: str, start_time: str = "") -> tuple[bool, str]:
        """添加日程: /schedule add <标题> [开始时间]"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:schedule_service")
        if not svc:
            return False, "日程服务不可用"

        if not start_time:
            start_time = datetime.now().isoformat()

        event = await svc.create_event(
            title=title,
            start_time=start_time,
            stream_id=self.stream_id,
        )
        text = f"日程已创建: {event.format_display()}"
        await send_text(text, self.stream_id)
        return True, text

    @cmd_route("delete")
    async def handle_delete(self, event_id: int) -> tuple[bool, str]:
        """删除日程: /schedule delete <id>"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:schedule_service")
        if not svc:
            return False, "日程服务不可用"

        success = await svc.delete_event(event_id)
        if success:
            text = f"日程 #{event_id} 已删除"
            await send_text(text, self.stream_id)
            return True, text
        return False, f"未找到日程 #{event_id}"

    @cmd_route("search")
    async def handle_search(self, keyword: str) -> tuple[bool, str]:
        """搜索日程: /schedule search <关键词>"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:schedule_service")
        if not svc:
            return False, "日程服务不可用"

        events = await svc.search_events(keyword, stream_id=self.stream_id)
        text = svc.format_event_list(events, f"搜索: {keyword}")
        await send_text(text, self.stream_id)
        return True, text


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  /todo 命令
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class TodoCommand(BaseCommand):
    """待办事项管理命令"""

    command_name = "todo"
    command_description = "待办管理: /todo list | add <标题> | done <id> | delete <id> | stats"
    command_prefix = "/"

    @cmd_route("list")
    async def handle_list(self, status: str = "pending") -> tuple[bool, str]:
        """列出待办: /todo list [状态]"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:todo_service")
        if not svc:
            return False, "待办服务不可用"

        todos = await svc.list_todos(stream_id=self.stream_id, status=status)
        status_labels = {
            "pending": "待处理",
            "in_progress": "进行中",
            "done": "已完成",
            "cancelled": "已取消",
            "all": "全部",
        }
        text = svc.format_todo_list(todos, f"{status_labels.get(status, status)} 待办")
        await send_text(text, self.stream_id)
        return True, text

    @cmd_route("add")
    async def handle_add(self, title: str, priority: str = "normal") -> tuple[bool, str]:
        """添加待办: /todo add <标题> [优先级]"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:todo_service")
        if not svc:
            return False, "待办服务不可用"

        todo = await svc.create_todo(
            title=title,
            priority=priority,
            stream_id=self.stream_id,
        )
        text = f"待办已创建: {todo.format_display()}"
        await send_text(text, self.stream_id)
        return True, text

    @cmd_route("done")
    async def handle_done(self, todo_id: int) -> tuple[bool, str]:
        """完成待办: /todo done <id>"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:todo_service")
        if not svc:
            return False, "待办服务不可用"

        todo = await svc.toggle_todo(todo_id)
        if not todo:
            return False, f"未找到待办 #{todo_id}"

        status_text = "已完成" if todo.status == "done" else "重新打开"
        text = f"待办 #{todo_id} {status_text}: {todo.title}"
        await send_text(text, self.stream_id)
        return True, text

    @cmd_route("delete")
    async def handle_delete(self, todo_id: int) -> tuple[bool, str]:
        """删除待办: /todo delete <id>"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:todo_service")
        if not svc:
            return False, "待办服务不可用"

        success = await svc.delete_todo(todo_id)
        if success:
            text = f"待办 #{todo_id} 已删除"
            await send_text(text, self.stream_id)
            return True, text
        return False, f"未找到待办 #{todo_id}"

    @cmd_route("stats")
    async def handle_stats(self) -> tuple[bool, str]:
        """待办统计: /todo stats"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:todo_service")
        if not svc:
            return False, "待办服务不可用"

        stats = await svc.get_stats(stream_id=self.stream_id)
        text = (
            f"-- 待办统计 --\n"
            f"  总计: {stats['total']}\n"
            f"  待处理: {stats['pending']}\n"
            f"  进行中: {stats['in_progress']}\n"
            f"  已完成: {stats['done']}\n"
            f"  已取消: {stats['cancelled']}\n"
            f"  已逾期: {stats['overdue']}\n"
            f"  完成率: {stats['completion_rate']}"
        )
        await send_text(text, self.stream_id)
        return True, text

    @cmd_route("search")
    async def handle_search(self, keyword: str) -> tuple[bool, str]:
        """搜索待办: /todo search <关键词>"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:todo_service")
        if not svc:
            return False, "待办服务不可用"

        todos = await svc.search_todos(keyword, stream_id=self.stream_id)
        text = svc.format_todo_list(todos, f"搜索: {keyword}")
        await send_text(text, self.stream_id)
        return True, text


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  /pet 命令
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class PetCommand(BaseCommand):
    """桌宠管理命令"""

    command_name = "pet"
    command_description = "桌宠管理: /pet status | models | switch <id> | motion <组> | expression <名>"
    command_prefix = "/"

    @cmd_route("status")
    async def handle_status(self) -> tuple[bool, str]:
        """查看桌宠状态"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:live2d_service")
        if not svc:
            return False, "Live2D 服务不可用"

        model = await svc.get_active_model()
        if not model:
            text = "当前没有激活的 Live2D 模型"
        else:
            motion_count = sum(len(v) for v in model.motions.values())
            text = (
                f"-- 桌宠状态 --\n"
                f"  模型: {model.name}\n"
                f"  ID: {model.model_id}\n"
                f"  动作组: {len(model.motions)} ({motion_count} 个动作)\n"
                f"  表情: {len(model.expressions)} 个\n"
                f"  描述: {model.description or '无'}"
            )
        await send_text(text, self.stream_id)
        return True, text

    @cmd_route("models")
    async def handle_models(self) -> tuple[bool, str]:
        """列出所有模型"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:live2d_service")
        if not svc:
            return False, "Live2D 服务不可用"

        models = await svc.list_models()
        text = svc.format_model_list(models)
        await send_text(text, self.stream_id)
        return True, text

    @cmd_route("switch")
    async def handle_switch(self, model_id: str) -> tuple[bool, str]:
        """切换模型: /pet switch <model_id>"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:live2d_service")
        if not svc:
            return False, "Live2D 服务不可用"

        success = await svc.set_active_model(model_id)
        if success:
            model = await svc.get_active_model()
            text = f"已切换为: {model.name if model else model_id}"
        else:
            text = f"切换失败: 未找到模型 {model_id}"
        await send_text(text, self.stream_id)
        return success, text

    @cmd_route("scan")
    async def handle_scan(self) -> tuple[bool, str]:
        """重新扫描模型目录"""
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:live2d_service")
        if not svc:
            return False, "Live2D 服务不可用"

        models = await svc.scan_models()
        text = f"扫描完成，发现 {len(models)} 个 Live2D 模型"
        await send_text(text, self.stream_id)
        return True, text

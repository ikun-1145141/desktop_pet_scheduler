"""桌宠对话器 - 基于 LLM 的智能对话，融合日程与待办上下文"""

from __future__ import annotations

from datetime import datetime
from typing import AsyncGenerator, cast

from src.core.components.base.chatter import BaseChatter, Wait, Success, Failure, Stop
from src.app.plugin_system.api.send_api import send_text
from src.app.plugin_system.api.log_api import get_logger
from src.core.managers import get_service_manager
from src.kernel.llm import LLMPayload, ROLE, Text

from ..config import PetSchedulerConfig

logger = get_logger("desktop_pet_scheduler")


class PetChatter(BaseChatter):
    """桌宠对话器 - 将日程/待办上下文注入 LLM，实现有日程感知能力的对话"""

    chatter_name = "pet_chatter"
    chatter_description = "桌宠智能对话，能理解日程和待办事项上下文"

    async def execute(self) -> AsyncGenerator[Wait | Success | Failure | Stop, None]:
        # 获取未读消息
        unread_json, unread_messages = await self.fetch_unreads()
        if not unread_messages:
            yield Wait()
            return

        # 读取配置
        config = cast(PetSchedulerConfig, self.plugin.config)
        pet_name = config.pet.pet_name
        personality = config.pet.personality

        # 构建日程/待办上下文摘要
        context_summary = await self._build_context_summary()

        # 构建系统 prompt
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M (%A)")
        system_prompt = (
            f"{personality}\n\n"
            f"你的名字是「{pet_name}」。当前时间: {now_str}\n\n"
            f"以下是用户当前的日程和待办概况，你可以在回复中引用这些信息:\n"
            f"{context_summary}\n\n"
            f"当用户想要创建、查询、修改或删除日程/待办时，请使用对应的工具。"
            f"回复时保持简洁、友好、有个性。"
        )

        # 使用 BaseChatter 内置方法创建 LLM 请求
        req = self.create_request(task="actor", request_name="pet_chatter")
        req.add_payload(LLMPayload(ROLE.SYSTEM, Text(system_prompt)))
        req.add_payload(LLMPayload(ROLE.USER, Text(unread_json)))

        # 注入可用工具（Action + Tool），返回工具注册表
        registry = await self.inject_usables(req)

        yield Wait()

        # 获取触发消息（用于 run_tool_call）
        trigger_msg = unread_messages[-1] if unread_messages else None

        # 发送请求，支持多轮工具调用
        max_tool_rounds = 3
        resp = None
        for round_idx in range(max_tool_rounds):
            resp = await req.send(stream=False)

            # 如果有工具调用，使用 BaseChatter 内置的 run_tool_call 处理
            if resp.call_list:
                for tc in resp.call_list:
                    try:
                        await self.run_tool_call(tc, resp, registry, trigger_msg)
                    except Exception as e:
                        logger.error(f"工具调用失败: {tc.name} -> {e}")
                continue  # 继续下一轮，让 LLM 根据工具结果生成回复
            else:
                break  # 没有工具调用，LLM 直接给出了回复

        if resp is None:
            yield Failure("LLM 请求失败")
            return

        answer = (resp.message or "").strip()
        if not answer:
            yield Failure("LLM 返回为空")
            return

        ok = await send_text(answer, self.stream_id)
        if not ok:
            yield Failure("消息发送失败")
            return

        await self.flush_unreads(unread_messages)
        yield Success("对话完成")

    async def _build_context_summary(self) -> str:
        """构建日程和待办的上下文摘要"""
        lines: list[str] = []

        # 获取日程服务
        sm = get_service_manager()
        schedule_svc = sm.get_service(
            f"{self.plugin.plugin_name}:service:schedule_service"
        )
        if schedule_svc:
            try:
                today_events = await schedule_svc.get_today_events()
                if today_events:
                    lines.append(f"[今日日程] 共 {len(today_events)} 项:")
                    for e in today_events[:5]:
                        lines.append(f"  - {e.format_display()}")
                    if len(today_events) > 5:
                        lines.append(f"  ...还有 {len(today_events) - 5} 项")
                else:
                    lines.append("[今日日程] 暂无")
            except Exception as e:
                logger.warning(f"获取今日日程失败: {e}")

        # 获取待办服务
        todo_svc = sm.get_service(
            f"{self.plugin.plugin_name}:service:todo_service"
        )
        if todo_svc:
            try:
                pending = await todo_svc.list_pending()
                if pending:
                    lines.append(f"[待办事项] 共 {len(pending)} 项未完成:")
                    for t in pending[:5]:
                        lines.append(f"  - {t.format_display()}")
                    if len(pending) > 5:
                        lines.append(f"  ...还有 {len(pending) - 5} 项")
                else:
                    lines.append("[待办事项] 全部完成")

                overdue = await todo_svc.list_overdue()
                if overdue:
                    lines.append(f"[已逾期] {len(overdue)} 项待办已过期!")
            except Exception as e:
                logger.warning(f"获取待办摘要失败: {e}")

        return "\n".join(lines) if lines else "暂无日程和待办数据"

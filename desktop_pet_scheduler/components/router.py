"""HTTP API 路由 - 为前端 WebView 提供 RESTful 接口"""

from typing import cast

from src.core.components.base.router import BaseRouter
from src.core.managers import get_service_manager
from src.app.plugin_system.api.log_api import get_logger

from ..config import PetSchedulerConfig

logger = get_logger("desktop_pet_scheduler")


class PetApiRouter(BaseRouter):
    """桌宠日程表 HTTP API"""

    router_name = "pet_api"
    router_description = "桌宠日程表的 RESTful API，供前端 WebView 调用"
    custom_route_path = "/api/pet-scheduler"
    cors_origins = ["*"]

    def register_endpoints(self) -> None:
        from fastapi import HTTPException
        from pydantic import BaseModel
        from typing import Optional

        # Live2D service 是内存状态型，需要缓存实例
        _live2d_svc_cache = {}

        def _get_live2d_svc():
            if "inst" not in _live2d_svc_cache:
                svc = get_service_manager().get_service(
                    f"{self.plugin.plugin_name}:service:live2d_service"
                )
                if svc:
                    _live2d_svc_cache["inst"] = svc
                    _live2d_svc_cache["needs_scan"] = True
                return svc
            return _live2d_svc_cache["inst"]

        async def _ensure_scanned():
            """确保 live2d service 至少做过一次磁盘扫描"""
            svc = _get_live2d_svc()
            if svc and _live2d_svc_cache.get("needs_scan"):
                config = cast(PetSchedulerConfig, self.plugin.config)
                models_dir = config.pet.live2d_models_dir or ""
                await svc.scan_models(models_dir)
                _live2d_svc_cache["needs_scan"] = False
            return svc

        # ── 请求模型 ──────────────────────────────────────

        class CreateEventRequest(BaseModel):
            title: str
            start_time: str
            end_time: Optional[str] = ""
            description: Optional[str] = ""
            all_day: bool = False
            repeat_type: str = "none"
            priority: str = "normal"
            tags: Optional[list[str]] = None
            remind_before_minutes: int = 15
            location: Optional[str] = ""

        class CreateTodoRequest(BaseModel):
            title: str
            description: Optional[str] = ""
            priority: str = "normal"
            due_date: Optional[str] = ""
            tags: Optional[list[str]] = None

        class UpdateTodoRequest(BaseModel):
            title: Optional[str] = None
            description: Optional[str] = None
            priority: Optional[str] = None
            due_date: Optional[str] = None
            status: Optional[str] = None

        def _tags_to_str(tags: list[str] | None) -> str:
            """将前端传来的 tags 列表转为逗号分隔字符串供数据库存储"""
            if not tags:
                return ""
            return ",".join(t.strip() for t in tags if t.strip())

        def _ok(data=None, **extra):
            """构建统一的成功响应格式"""
            resp = {"success": True}
            if data is not None:
                resp["data"] = data
            resp.update(extra)
            return resp

        # ── 日程 API ─────────────────────────────────────

        @self.app.get("/schedules")
        async def list_schedules(date: str = "", keyword: str = ""):
            svc = get_service_manager().get_service(
                f"{self.plugin.plugin_name}:service:schedule_service"
            )
            if not svc:
                raise HTTPException(503, "日程服务不可用")

            if keyword:
                events = await svc.search_events(keyword)
            elif date:
                events = await svc.list_events(date=date)
            else:
                events = await svc.get_today_events()

            return _ok([e.to_dict() for e in events])

        @self.app.post("/schedules")
        async def create_schedule(req: CreateEventRequest):
            svc = get_service_manager().get_service(
                f"{self.plugin.plugin_name}:service:schedule_service"
            )
            if not svc:
                raise HTTPException(503, "日程服务不可用")

            event = await svc.create_event(
                title=req.title,
                start_time=req.start_time,
                end_time=req.end_time or "",
                description=req.description or "",
                all_day=req.all_day,
                repeat_type=req.repeat_type,
                priority=req.priority,
                tags=_tags_to_str(req.tags),
                reminder_minutes=req.remind_before_minutes,
                location=req.location or "",
            )
            return _ok(event.to_dict())

        @self.app.delete("/schedules")
        async def delete_schedule(id: str = ""):
            svc = get_service_manager().get_service(
                f"{self.plugin.plugin_name}:service:schedule_service"
            )
            if not svc:
                raise HTTPException(503, "日程服务不可用")
            if not id:
                raise HTTPException(400, "缺少 id 参数")

            try:
                event_id = int(id)
            except ValueError:
                raise HTTPException(400, f"无效的 id: {id}")

            ok = await svc.delete_event(event_id)
            if not ok:
                raise HTTPException(404, f"日程 #{event_id} 不存在")
            return _ok()

        # ── 待办 API ─────────────────────────────────────

        @self.app.get("/todos")
        async def list_todos(status: str = "pending", keyword: str = ""):
            svc = get_service_manager().get_service(
                f"{self.plugin.plugin_name}:service:todo_service"
            )
            if not svc:
                raise HTTPException(503, "待办服务不可用")

            if keyword:
                todos = await svc.search_todos(keyword)
            else:
                kw = {}
                if status != "all":
                    kw["status"] = status
                todos = await svc.list_todos(**kw)

            return _ok([t.to_dict() for t in todos])

        @self.app.post("/todos")
        async def create_todo(req: CreateTodoRequest):
            svc = get_service_manager().get_service(
                f"{self.plugin.plugin_name}:service:todo_service"
            )
            if not svc:
                raise HTTPException(503, "待办服务不可用")

            todo = await svc.create_todo(
                title=req.title,
                description=req.description or "",
                priority=req.priority,
                due_date=req.due_date or "",
                tags=_tags_to_str(req.tags),
            )
            return _ok(todo.to_dict())

        @self.app.patch("/todos/toggle")
        async def toggle_todo(id: str = ""):
            svc = get_service_manager().get_service(
                f"{self.plugin.plugin_name}:service:todo_service"
            )
            if not svc:
                raise HTTPException(503, "待办服务不可用")
            if not id:
                raise HTTPException(400, "缺少 id 参数")

            try:
                todo_id = int(id)
            except ValueError:
                raise HTTPException(400, f"无效的 id: {id}")

            todo = await svc.toggle_todo(todo_id)
            if not todo:
                raise HTTPException(404, f"待办 #{todo_id} 不存在")
            return _ok(todo.to_dict())

        @self.app.delete("/todos")
        async def delete_todo(id: str = ""):
            svc = get_service_manager().get_service(
                f"{self.plugin.plugin_name}:service:todo_service"
            )
            if not svc:
                raise HTTPException(503, "待办服务不可用")
            if not id:
                raise HTTPException(400, "缺少 id 参数")

            try:
                todo_id = int(id)
            except ValueError:
                raise HTTPException(400, f"无效的 id: {id}")

            ok = await svc.delete_todo(todo_id)
            if not ok:
                raise HTTPException(404, f"待办 #{todo_id} 不存在")
            return _ok()

        @self.app.get("/todos/stats")
        async def todo_stats():
            svc = get_service_manager().get_service(
                f"{self.plugin.plugin_name}:service:todo_service"
            )
            if not svc:
                raise HTTPException(503, "待办服务不可用")

            stats = await svc.get_stats()
            return _ok(stats)

        # ── Live2D API ───────────────────────────────────

        @self.app.get("/live2d/models")
        async def live2d_models():
            svc = await _ensure_scanned()
            if not svc:
                raise HTTPException(503, "Live2D 服务不可用")

            models = await svc.list_models()
            return {"data": [m.to_api_dict() for m in models]}

        @self.app.get("/live2d/active")
        async def live2d_active():
            svc = await _ensure_scanned()
            if not svc:
                raise HTTPException(503, "Live2D 服务不可用")

            model = await svc.get_active_model()
            if not model:
                return {"data": None}
            return {"data": model.to_api_dict()}

        @self.app.post("/live2d/switch/{model_id}")
        async def live2d_switch(model_id: str):
            svc = await _ensure_scanned()
            if not svc:
                raise HTTPException(503, "Live2D 服务不可用")

            ok = await svc.set_active_model(model_id)
            if not ok:
                raise HTTPException(404, f"模型 {model_id} 不存在")
            model = await svc.get_active_model()
            return {"data": model.to_api_dict() if model else None}

        @self.app.post("/live2d/scan")
        async def live2d_scan():
            svc = _get_live2d_svc()
            if not svc:
                raise HTTPException(503, "Live2D 服务不可用")

            config = cast(PetSchedulerConfig, self.plugin.config)
            models_dir = config.pet.live2d_models_dir or ""
            models = await svc.scan_models(models_dir)
            _live2d_svc_cache["needs_scan"] = False
            return {"data": [m.to_api_dict() for m in models]}

        # ── Live2D 静态文件服务 ──────────────────────────
        from fastapi.responses import FileResponse
        from pathlib import Path as _Path

        @self.app.get("/live2d/assets/{model_id:path}")
        async def live2d_asset(model_id: str):
            """提供 Live2D 模型文件（model3.json、纹理、动作等）的 HTTP 访问"""
            svc = await _ensure_scanned()
            if not svc:
                raise HTTPException(503, "Live2D 服务不可用")

            # model_id 格式: "蓝音/mizuki.model3.json" 或 "蓝音/textures/xxx.png"
            parts = model_id.split("/", 1)
            if len(parts) < 2:
                raise HTTPException(400, "路径格式应为 {model_id}/{file_path}")

            mid, file_path = parts
            model = await svc.get_model(mid)
            if not model:
                raise HTTPException(404, f"模型 {mid} 不存在")

            file_full = _Path(model.model_path) / file_path
            if not file_full.exists() or not file_full.is_file():
                raise HTTPException(404, f"文件不存在: {file_path}")

            # 安全检查：确保文件在模型目录内
            try:
                file_full.resolve().relative_to(_Path(model.model_path).resolve())
            except ValueError:
                raise HTTPException(403, "禁止访问模型目录外的文件")

            # 猜测 MIME 类型
            suffix = file_full.suffix.lower()
            media_types = {
                ".json": "application/json",
                ".moc3": "application/octet-stream",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".webp": "image/webp",
                ".motion3.json": "application/json",
                ".exp3.json": "application/json",
            }
            media_type = media_types.get(suffix, "application/octet-stream")

            return FileResponse(str(file_full), media_type=media_type)

        # ── 健康检查 ──────────────────────────────────────

        @self.app.get("/health")
        async def health():
            return {
                "status": "ok",
                "plugin": "desktop_pet_scheduler",
                "version": "1.0.0",
            }

        # ── 聊天工具定义 ───────────────────────────────────

        class CreateTodoTool:
            """LLM 可调用的创建待办工具"""

            @classmethod
            def to_schema(cls) -> dict:
                return {
                    "type": "function",
                    "function": {
                        "name": "create_todo",
                        "description": "为用户创建一个新的待办事项。当用户提到需要记住做某事、添加待办、任务等时调用此工具。",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "title": {
                                    "type": "string",
                                    "description": "待办事项的标题，简洁描述要做的事。",
                                },
                                "description": {
                                    "type": "string",
                                    "description": "待办事项的详细描述（可选）。",
                                },
                                "priority": {
                                    "type": "string",
                                    "enum": ["low", "normal", "high", "urgent"],
                                    "description": "优先级，默认 normal。",
                                },
                                "due_date": {
                                    "type": "string",
                                    "description": "截止日期，ISO 格式如 2025-01-20T18:00:00（可选）。",
                                },
                                "tags": {
                                    "type": "string",
                                    "description": "逗号分隔的标签，如 '工作,重要'（可选）。",
                                },
                            },
                            "required": ["title"],
                        },
                    },
                }

        class CreateScheduleTool:
            """LLM 可调用的创建日程工具"""

            @classmethod
            def to_schema(cls) -> dict:
                return {
                    "type": "function",
                    "function": {
                        "name": "create_schedule",
                        "description": "为用户创建一个新的日程事件。当用户提到需要安排时间、约会、会议、提醒某个时间做某事时调用此工具。",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "title": {
                                    "type": "string",
                                    "description": "日程标题，简洁描述事件。",
                                },
                                "start_time": {
                                    "type": "string",
                                    "description": "开始时间，ISO 格式如 2025-01-20T14:00:00。必须根据当前时间推算具体日期。",
                                },
                                "end_time": {
                                    "type": "string",
                                    "description": "结束时间，ISO 格式（可选，默认与开始时间相同）。",
                                },
                                "description": {
                                    "type": "string",
                                    "description": "日程的详细描述（可选）。",
                                },
                                "location": {
                                    "type": "string",
                                    "description": "地点（可选）。",
                                },
                                "all_day": {
                                    "type": "boolean",
                                    "description": "是否全天事件，默认 false。",
                                },
                                "priority": {
                                    "type": "string",
                                    "enum": ["low", "normal", "high", "urgent"],
                                    "description": "优先级，默认 normal。",
                                },
                                "tags": {
                                    "type": "string",
                                    "description": "逗号分隔的标签（可选）。",
                                },
                                "reminder_minutes": {
                                    "type": "integer",
                                    "description": "提前提醒的分钟数，默认 15。",
                                },
                            },
                            "required": ["title", "start_time"],
                        },
                    },
                }

        # ── 工具执行器 ────────────────────────────────────

        async def _execute_tool_call(
            call_name: str,
            args: dict,
            schedule_svc,
            todo_svc,
        ) -> dict:
            """执行单个工具调用，返回结果字典"""
            if call_name == "create_todo" and todo_svc:
                todo = await todo_svc.create_todo(
                    title=args.get("title", ""),
                    description=args.get("description", ""),
                    priority=args.get("priority", "normal"),
                    due_date=args.get("due_date", ""),
                    tags=args.get("tags", ""),
                )
                return {
                    "success": True,
                    "type": "create_todo",
                    "message": f"已创建待办「{todo.title}」",
                    "data": todo.to_dict(),
                }

            if call_name == "create_schedule" and schedule_svc:
                event = await schedule_svc.create_event(
                    title=args.get("title", ""),
                    start_time=args.get("start_time", ""),
                    end_time=args.get("end_time", ""),
                    description=args.get("description", ""),
                    location=args.get("location", ""),
                    all_day=args.get("all_day", False),
                    priority=args.get("priority", "normal"),
                    tags=args.get("tags", ""),
                    reminder_minutes=args.get("reminder_minutes", 15),
                )
                return {
                    "success": True,
                    "type": "create_schedule",
                    "message": f"已创建日程「{event.title}」({event.start_time})",
                    "data": event.to_dict(),
                }

            return {"success": False, "message": f"未知工具: {call_name}"}

        # ── 聊天 API ─────────────────────────────────────

        class ChatRequest(BaseModel):
            message: str
            stream_id: str = ""

        @self.app.post("/chat")
        async def chat(body: ChatRequest):
            from src.app.plugin_system.api.llm_api import (
                get_model_set_by_task,
                create_llm_request,
            )
            from src.kernel.llm import LLMPayload, ROLE, Text
            from src.kernel.llm.payload import ToolResult
            from src.core.config import get_core_config
            from datetime import datetime
            import json

            # 使用全局人设配置
            core_cfg = get_core_config()
            p = core_cfg.personality
            pet_name = p.nickname
            identity = p.identity
            personality_core = p.personality_core
            personality_side = p.personality_side
            reply_style = p.reply_style
            background_story = p.background_story

            # 组装人格描述
            personality_parts: list[str] = []
            if identity:
                personality_parts.append(f"你的身份是：{identity}。")
            if personality_core:
                personality_parts.append(f"核心性格：{personality_core}。")
            if personality_side:
                personality_parts.append(f"性格补充：{personality_side}。")
            if reply_style:
                personality_parts.append(f"表达风格：{reply_style}。")
            if background_story:
                personality_parts.append(f"背景故事：{background_story}")
            personality = " ".join(personality_parts) if personality_parts else "你是一个友好的助手。"

            # 获取服务
            sm = get_service_manager()
            schedule_svc = sm.get_service(
                f"{self.plugin.plugin_name}:service:schedule_service"
            )
            todo_svc = sm.get_service(
                f"{self.plugin.plugin_name}:service:todo_service"
            )

            # 构建日程/待办上下文
            context_lines: list[str] = []
            if schedule_svc:
                try:
                    today_events = await schedule_svc.get_today_events()
                    if today_events:
                        context_lines.append(
                            f"[今日日程] 共 {len(today_events)} 项:"
                        )
                        for e in today_events[:5]:
                            context_lines.append(f"  - {e.format_display()}")
                    else:
                        context_lines.append("[今日日程] 暂无")
                except Exception as e:
                    logger.warning(f"获取今日日程失败: {e}")

            if todo_svc:
                try:
                    pending = await todo_svc.list_pending()
                    if pending:
                        context_lines.append(
                            f"[待办事项] 共 {len(pending)} 项未完成:"
                        )
                        for t in pending[:5]:
                            context_lines.append(f"  - {t.format_display()}")
                    else:
                        context_lines.append("[待办事项] 全部完成")
                except Exception as e:
                    logger.warning(f"获取待办摘要失败: {e}")

            context_summary = (
                "\n".join(context_lines) if context_lines else "暂无日程和待办数据"
            )
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M (%A)")

            system_prompt = (
                f"{personality}\n\n"
                f"你的名字是「{pet_name}」。当前时间: {now_str}\n\n"
                f"以下是用户当前的日程和待办概况，你可以在回复中引用这些信息:\n"
                f"{context_summary}\n\n"
                f"你拥有工具可以帮用户创建待办和日程。"
                f"当用户想要添加待办事项或安排日程时，请调用对应的工具。\n"
                f"回复时保持简洁、友好、有个性。"
            )

            actions: list[dict] = []  # 记录执行的操作

            try:
                model_set = get_model_set_by_task("actor")
                llm_req = create_llm_request(model_set, request_name="pet_api_chat")
                llm_req.add_payload(LLMPayload(ROLE.SYSTEM, Text(system_prompt)))
                llm_req.add_payload(LLMPayload(ROLE.USER, Text(body.message)))

                # 注册工具
                llm_req.add_payload(
                    LLMPayload(ROLE.TOOL, [CreateTodoTool, CreateScheduleTool])  # type: ignore[arg-type]
                )

                # 工具调用循环（最多 3 轮，防止无限循环）
                resp = await llm_req.send(stream=False)
                reply_text = await resp

                for _round in range(3):
                    if not resp.call_list:
                        break  # 没有工具调用，结束循环

                    # 执行所有工具调用
                    for call in resp.call_list:
                        call_args = call.args if isinstance(call.args, dict) else {}
                        logger.info(f"LLM 调用工具 {call.name}，参数: {call_args}")

                        try:
                            result = await _execute_tool_call(
                                call.name, call_args, schedule_svc, todo_svc
                            )
                            actions.append(result)

                            # 将工具结果反馈给 LLM
                            resp.add_payload(
                                LLMPayload(
                                    ROLE.TOOL_RESULT,
                                    ToolResult(  # type: ignore[arg-type]
                                        value=json.dumps(result, ensure_ascii=False),
                                        call_id=call.id,
                                        name=call.name,
                                    ),
                                )
                            )
                        except Exception as tool_err:
                            logger.error(f"工具 {call.name} 执行失败: {tool_err}")
                            error_result = {
                                "success": False,
                                "message": f"执行失败: {tool_err}",
                            }
                            actions.append(error_result)
                            resp.add_payload(
                                LLMPayload(
                                    ROLE.TOOL_RESULT,
                                    ToolResult(  # type: ignore[arg-type]
                                        value=json.dumps(error_result, ensure_ascii=False),
                                        call_id=call.id,
                                        name=call.name,
                                    ),
                                )
                            )

                    # 将工具结果发回 LLM 获取最终回复
                    resp = await resp.send(stream=False)
                    reply_text = await resp

                reply = (reply_text or "").strip()
                if not reply:
                    # 如果 LLM 没有给出文本回复但执行了操作，生成默认回复
                    if actions:
                        action_msgs = [a.get("message", "") for a in actions if a.get("success")]
                        reply = "好的，" + "；".join(action_msgs) + "！" if action_msgs else "已完成操作！"
                    else:
                        reply = "嗯…我好像没想好要说什么。"

            except Exception as e:
                logger.error(f"聊天 LLM 请求失败: {e}")
                reply = (
                    f"抱歉，我现在没法回复你😿\n"
                    f"请检查 config/model.toml 是否配置了 LLM 模型和 API Key。\n"
                    f"错误信息: {e}"
                )

            return {
                "reply": reply,
                "actions": [a for a in actions if a.get("success")],
            }

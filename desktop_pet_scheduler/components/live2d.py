"""Live2D 相关组件"""

from __future__ import annotations

from typing import Annotated

from src.core.components.base.tool import BaseTool
from src.core.managers import get_service_manager
from src.app.plugin_system.api.log_api import get_logger

logger = get_logger("desktop_pet_scheduler")


class Live2DStatusTool(BaseTool):
    """查询 Live2D 模型状态"""

    tool_name = "live2d_status"
    tool_description = (
        "查询当前 Live2D 桌宠的状态信息，包括已加载的模型列表、"
        "当前激活模型、可用动作组和表情。也可切换模型或触发动作/表情。"
    )

    async def execute(
        self,
        action: Annotated[
            str,
            "操作类型: status(查看状态) / list(列出模型) / switch(切换模型) / motion(触发动作) / expression(触发表情)"
        ] = "status",
        model_id: Annotated[str, "模型 ID（action=switch 时使用）"] = "",
        motion_group: Annotated[str, "动作组名称（action=motion 时使用）"] = "",
        motion_index: Annotated[int, "动作索引（action=motion 时使用）"] = 0,
        expression_name: Annotated[str, "表情名称（action=expression 时使用）"] = "",
    ) -> tuple[bool, dict]:
        svc = get_service_manager().get_service(f"{self.plugin.plugin_name}:service:live2d_service")
        if not svc:
            return False, {"error": "Live2D 服务不可用"}

        try:
            if action == "status":
                active = await svc.get_active_model()
                if not active:
                    return True, {"active_model": None, "message": "暂无激活的 Live2D 模型"}
                return True, {
                    "active_model": active.to_dict(),
                    "motion_groups": list(active.motions.keys()),
                    "expressions": active.expressions,
                }

            elif action == "list":
                models = await svc.list_models()
                return True, {
                    "models": [m.to_dict() for m in models],
                    "count": len(models),
                }

            elif action == "switch" and model_id:
                success = await svc.set_active_model(model_id)
                if success:
                    model = await svc.get_active_model()
                    return True, {"switched_to": model.to_dict() if model else model_id}
                return False, {"error": f"切换模型失败: {model_id}"}

            elif action == "motion" and motion_group:
                result = await svc.trigger_motion(motion_group, motion_index)
                return result.get("success", False), result

            elif action == "expression" and expression_name:
                result = await svc.trigger_expression(expression_name)
                return result.get("success", False), result

            else:
                return False, {"error": f"不支持的操作: {action}"}

        except Exception as e:
            logger.error(f"Live2D 操作失败: {e}")
            return False, {"error": str(e)}

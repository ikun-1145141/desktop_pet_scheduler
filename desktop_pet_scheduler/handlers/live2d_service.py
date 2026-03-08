"""Live2D 模型管理服务"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from src.core.components.base.service import BaseService
from src.app.plugin_system.api.log_api import get_logger

from ..models import Live2DModel

logger = get_logger("desktop_pet_scheduler")

# 插件内 assets 目录
ASSETS_DIR = Path(__file__).parent.parent / "assets" / "live2d"


class Live2DService(BaseService):
    """Live2D 模型管理服务 - 扫描、加载、切换模型"""

    service_name = "live2d_service"
    service_description = "Live2D 模型的扫描、加载与切换管理"
    version = "1.0.0"

    def __init__(self, plugin) -> None:
        super().__init__(plugin)
        self._models: dict[str, Live2DModel] = {}
        self._active_model_id: str = ""

    # ── 扫描与加载 ────────────────────────────────────────────

    async def scan_models(self, models_dir: str = "") -> list[Live2DModel]:
        """扫描指定目录下的 Live2D 模型

        每个子目录应包含:
          - *.model3.json (Cubism 3/4 模型入口)
          - manifest.json (可选，插件自定义元数据)
        """
        base_dir = Path(models_dir) if models_dir else ASSETS_DIR
        if not base_dir.exists():
            logger.warning(f"Live2D 模型目录不存在: {base_dir}")
            return []

        discovered: list[Live2DModel] = []

        for entry in sorted(base_dir.iterdir()):
            if not entry.is_dir():
                continue

            model = await self._load_model_from_dir(entry)
            if model:
                self._models[model.model_id] = model
                discovered.append(model)
                logger.info(f"发现 Live2D 模型: {model.name} ({model.model_id})")

        # 如果当前没有激活模型且有可用模型，激活第一个
        if not self._active_model_id and discovered:
            await self.set_active_model(discovered[0].model_id)

        return discovered

    async def _load_model_from_dir(self, model_dir: Path) -> Optional[Live2DModel]:
        """从目录加载单个 Live2D 模型"""
        # 查找 model3.json 文件
        model_json_files = list(model_dir.glob("*.model3.json"))
        if not model_json_files:
            return None

        model_json_file = model_json_files[0]
        model_id = model_dir.name

        # 尝试读取 manifest.json（插件自定义元数据）
        manifest_path = model_dir / "manifest.json"
        manifest: dict = {}
        if manifest_path.exists():
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
            except (json.JSONDecodeError, OSError) as e:
                logger.warning(f"读取 manifest.json 失败: {manifest_path} -> {e}")

        # 解析 model3.json 提取 motions 和 expressions
        motions: dict = {}
        expressions: list[str] = []
        try:
            with open(model_json_file, "r", encoding="utf-8") as f:
                model_data = json.load(f)

            # 提取動作组信息
            file_refs = model_data.get("FileReferences", {})
            raw_motions = file_refs.get("Motions", {})
            for group_name, motion_list in raw_motions.items():
                motions[group_name] = [
                    m.get("File", "") for m in motion_list if isinstance(m, dict)
                ]

            # 提取表情信息（名称列表 + 完整定义）
            raw_expressions = file_refs.get("Expressions", [])
            expressions = [
                e.get("Name", e.get("File", ""))
                for e in raw_expressions
                if isinstance(e, dict)
            ]
            expression_defs = [
                {"Name": e.get("Name", ""), "File": e.get("File", "")}
                for e in raw_expressions
                if isinstance(e, dict)
            ]
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"解析 model3.json 失败: {model_json_file} -> {e}")

        # 查找预览图（支持多种常见命名）
        preview_image = ""
        for name in ("preview", "icon", "thumbnail", "thumb", "cover"):
            for ext in (".png", ".jpg", ".webp"):
                preview_path = model_dir / f"{name}{ext}"
                if preview_path.exists():
                    preview_image = str(preview_path)
                    break
            if preview_image:
                break

        return Live2DModel(
            model_id=model_id,
            name=manifest.get("name", model_id),
            model_path=str(model_dir),
            model_json=model_json_file.name,
            preview_image=preview_image,
            description=manifest.get("description", ""),
            motions=motions,
            expressions=expressions,
            expression_defs=expression_defs,
            is_active=False,
        )

    # ── 模型管理 ──────────────────────────────────────────────

    async def get_model(self, model_id: str) -> Optional[Live2DModel]:
        """获取指定模型"""
        return self._models.get(model_id)

    async def list_models(self) -> list[Live2DModel]:
        """列出所有已加载模型"""
        return list(self._models.values())

    async def set_active_model(self, model_id: str) -> bool:
        """设置当前激活的模型"""
        if model_id not in self._models:
            logger.warning(f"模型不存在: {model_id}")
            return False

        # 取消之前的激活
        for m in self._models.values():
            m.is_active = False

        self._models[model_id].is_active = True
        self._active_model_id = model_id
        logger.info(f"已切换 Live2D 模型: {self._models[model_id].name}")
        return True

    async def get_active_model(self) -> Optional[Live2DModel]:
        """获取当前激活的模型"""
        if self._active_model_id:
            return self._models.get(self._active_model_id)
        return None

    # ── 模型信息查询 ──────────────────────────────────────────

    async def get_model_info(self, model_id: str = "") -> dict:
        """获取模型详细信息（不指定 id 则返回当前激活模型）"""
        target_id = model_id or self._active_model_id
        model = self._models.get(target_id)
        if not model:
            return {"error": "未找到模型", "available_models": list(self._models.keys())}

        return {
            **model.to_dict(),
            "motion_groups": list(model.motions.keys()),
            "motion_count": sum(len(v) for v in model.motions.values()),
            "expression_count": len(model.expressions),
        }

    async def trigger_motion(self, group: str, index: int = 0) -> dict:
        """触发指定动作组的动作"""
        model = await self.get_active_model()
        if not model:
            return {"success": False, "error": "暂无激活的 Live2D 模型"}

        if group not in model.motions:
            return {
                "success": False,
                "error": f"动作组 '{group}' 不存在",
                "available_groups": list(model.motions.keys()),
            }

        motion_files = model.motions[group]
        if index >= len(motion_files):
            index = 0

        return {
            "success": True,
            "model_id": model.model_id,
            "group": group,
            "index": index,
            "file": motion_files[index] if motion_files else "",
        }

    async def trigger_expression(self, expression_name: str) -> dict:
        """触发指定表情"""
        model = await self.get_active_model()
        if not model:
            return {"success": False, "error": "暂无激活的 Live2D 模型"}

        if expression_name not in model.expressions:
            return {
                "success": False,
                "error": f"表情 '{expression_name}' 不存在",
                "available": model.expressions,
            }

        return {
            "success": True,
            "model_id": model.model_id,
            "expression": expression_name,
        }

    # ── 格式化 ────────────────────────────────────────────────

    @staticmethod
    def format_model_list(models: list[Live2DModel]) -> str:
        """格式化模型列表为可读文本"""
        if not models:
            return "-- Live2D 模型 --\n暂未加载任何模型"
        lines = ["-- Live2D 模型列表 --"]
        for m in models:
            active = " [当前]" if m.is_active else ""
            motion_count = sum(len(v) for v in m.motions.values())
            lines.append(
                f"  - {m.name}{active} | "
                f"动作组: {len(m.motions)} | "
                f"表情: {len(m.expressions)} | "
                f"id: {m.model_id}"
            )
        return "\n".join(lines)

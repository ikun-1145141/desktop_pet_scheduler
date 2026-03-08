"""handlers 模块初始化

提供插件数据库的全局访问点。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.app.plugin_system.api.storage_api import PluginDatabase

_plugin_db: "PluginDatabase | None" = None


def get_plugin_db() -> "PluginDatabase":
    """获取本插件的 PluginDatabase 实例。

    Raises:
        RuntimeError: 如果数据库尚未初始化
    """
    if _plugin_db is None:
        raise RuntimeError(
            "desktop_pet_scheduler 的数据库尚未初始化，"
            "请确保插件已正常加载（on_plugin_loaded）"
        )
    return _plugin_db


def set_plugin_db(db: "PluginDatabase") -> None:
    """由插件入口在 on_plugin_loaded 中调用，注入 PluginDatabase 实例。"""
    global _plugin_db
    _plugin_db = db

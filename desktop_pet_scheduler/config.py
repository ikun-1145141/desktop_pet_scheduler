"""桌宠日程表 - 插件配置定义"""

from __future__ import annotations

from src.core.components.base.config import BaseConfig, config_section, Field, SectionBase


class PetSchedulerConfig(BaseConfig):
    """桌宠日程表配置"""

    config_name = "config"
    config_description = "桌宠日程表插件配置文件"

    @config_section("pet")
    class PetSection(SectionBase):
        """桌宠设置"""
        pet_name: str = Field(default="小墨", description="桌宠名称")
        personality: str = Field(
            default="你是一个可爱、活泼、偶尔毒舌的桌宠助手，擅长帮用户管理日程和待办事项。说话风格简洁有趣。",
            description="桌宠人格设定（系统 prompt）",
        )
        live2d_models_dir: str = Field(
            default="",
            description="Live2D 模型目录路径，留空则使用插件内置 assets/live2d",
        )

    @config_section("reminder")
    class ReminderSection(SectionBase):
        """提醒设置"""
        enabled: bool = Field(default=True, description="是否启用日程提醒")
        default_minutes_before: int = Field(default=15, description="默认提前提醒分钟数")
        check_interval_seconds: int = Field(default=60, description="提醒检查间隔（秒）")

    @config_section("display")
    class DisplaySection(SectionBase):
        """显示设置"""
        show_daily_summary: bool = Field(default=True, description="每日首次对话时展示今日日程摘要")
        max_list_items: int = Field(default=20, description="列表展示的最大条目数")
        date_format: str = Field(default="%Y-%m-%d %H:%M", description="日期时间显示格式")

    @config_section("api")
    class ApiSection(SectionBase):
        """API 设置"""
        cors_origins: list[str] = Field(
            default_factory=lambda: ["*"],
            description="CORS 允许的来源列表",
        )
        enable_api: bool = Field(default=True, description="是否启用 HTTP API")

    pet: PetSection = Field(default_factory=PetSection)
    reminder: ReminderSection = Field(default_factory=ReminderSection)
    display: DisplaySection = Field(default_factory=DisplaySection)
    api: ApiSection = Field(default_factory=ApiSection)

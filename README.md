# 桌宠日程表 (Desktop Pet Scheduler)

一款基于 **Neo-MoFox 插件系统** 构建的桌面宠物日程管理应用。以 Neo-MoFox 为运行时宿主，通过 Live2D 桌宠与你对话互动，帮你管理日程和待办事项。

本项目同时提供独立的 **WebView 前端**（TypeScript + Material 3 Expressive）用于桌面端展示。

---

## 功能特性

- **Neo-MoFox 插件** — 作为 Neo-MoFox 插件运行，复用框架的 LLM 对话、事件系统、数据持久化等能力
- **Live2D 桌宠** — 集成 Live2D Cubism SDK，加载 .moc3 模型，支持表情/动作/物理模拟
- **日程管理** — 完整的日程事件 CRUD，支持重复事件、优先级、标签分类、提前提醒
- **待办事项** — 独立的待办列表，支持状态流转(待处理/进行中/已完成/已取消)、逾期检测
- **智能对话** — 基于 LLM 的桌宠对话器，感知日程和待办上下文，理解自然语言指令
- **命令系统** — `/schedule`、`/todo`、`/pet` 命令，无需 LLM 即可快速操作
- **HTTP API** — RESTful 接口供前端 WebView 或第三方应用调用
- **Material 3 Expressive 前端** — 基于 Lit + Vite 的 WebView UI，支持动态主题色和深色模式
- **数据持久化** — 通过 Neo-MoFox 数据库 API 存储，隐私安全

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 运行时宿主 | Neo-MoFox | 插件框架，提供 LLM/事件/数据库/消息等能力 |
| 后端核心 | Python 3.11+ | 业务逻辑、数据管理 |
| 前端框架 | TypeScript + Lit | 组件化 UI 开发（WebView 端） |
| UI 设计 | Material 3 Expressive | Google 最新设计语言 |
| Live2D | Cubism SDK for Web | 2D 模型渲染与动画驱动 |
| 构建工具 | Vite | 前端资源打包 |
| 包管理 | uv | Python 项目与依赖管理 |

## 快速开始

### 环境要求

- Neo-MoFox 主框架已安装且能正常运行
- Python >= 3.11
- uv >= 0.6

### 安装插件

将 `plugins/desktop_pet_scheduler/` 目录整体复制到 Neo-MoFox 的 `plugins/` 目录下：

```bash
# 假设 Neo-MoFox 在 ~/neo-mofox
cp -r plugins/desktop_pet_scheduler ~/neo-mofox/plugins/
```

然后启动 Neo-MoFox，框架会自动加载插件：

```bash
cd ~/neo-mofox
uv run main.py
```

### 前端开发（可选）

如果需要开发 WebView 前端界面：

```bash
cd frontend
npm install
npm run dev
```

## 插件组件清单

本插件注册了以下 Neo-MoFox 组件：

| 类型 | 名称 | 说明 |
|------|------|------|
| **Service** | `schedule_service` | 日程事件 CRUD 与查询 |
| **Service** | `todo_service` | 待办事项 CRUD 与状态管理 |
| **Service** | `live2d_service` | Live2D 模型扫描、加载、切换 |
| **Action** | `create_schedule` | LLM 调用：创建日程 |
| **Action** | `send_schedule_list` | LLM 调用：发送日程列表 |
| **Action** | `create_todo` | LLM 调用：创建待办 |
| **Action** | `send_todo_list` | LLM 调用：发送待办列表 |
| **Action** | `toggle_todo` | LLM 调用：切换待办完成状态 |
| **Tool** | `query_schedule` | LLM 查询：日程信息 |
| **Tool** | `query_todo` | LLM 查询：待办信息 |
| **Tool** | `live2d_status` | LLM 查询：Live2D 模型状态与控制 |
| **Command** | `/schedule` | 日程管理命令 |
| **Command** | `/todo` | 待办管理命令 |
| **Command** | `/pet` | 桌宠 Live2D 管理命令 |
| **Chatter** | `pet_chatter` | 智能对话器（日程/待办上下文感知） |
| **EventHandler** | `reminder_handler` | 日程到期提醒 |
| **EventHandler** | `startup_handler` | 启动时初始化 Live2D 模型 |
| **Router** | `pet_api` | HTTP RESTful API（`/api/pet-scheduler/*`） |
| **Config** | `config` | TOML 配置文件 |

### 命令用法

```
/schedule today                     -- 查看今日日程
/schedule add <标题> [时间]          -- 添加日程
/schedule delete <id>               -- 删除日程
/schedule search <关键词>            -- 搜索日程

/todo list [状态]                   -- 列出待办（pending/done/all）
/todo add <标题> [优先级]            -- 添加待办
/todo done <id>                     -- 完成/重开待办
/todo delete <id>                   -- 删除待办
/todo stats                         -- 待办统计

/pet status                         -- 查看桌宠状态
/pet models                         -- 列出 Live2D 模型
/pet switch <model_id>              -- 切换模型
/pet scan                           -- 重新扫描模型目录
```

### HTTP API

插件挂载在 `/api/pet-scheduler` 路径下，主要端点：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/schedules` | 查询日程列表 |
| `POST` | `/schedules` | 创建日程 |
| `DELETE` | `/schedules/{id}` | 删除日程 |
| `GET` | `/todos` | 查询待办列表 |
| `POST` | `/todos` | 创建待办 |
| `PATCH` | `/todos/{id}` | 更新待办 |
| `POST` | `/todos/{id}/toggle` | 切换待办状态 |
| `DELETE` | `/todos/{id}` | 删除待办 |
| `GET` | `/todos/stats` | 待办统计 |
| `GET` | `/live2d/models` | 列出 Live2D 模型 |
| `GET` | `/live2d/active` | 获取当前激活模型 |
| `POST` | `/live2d/switch/{id}` | 切换模型 |
| `POST` | `/live2d/scan` | 重新扫描模型 |
| `GET` | `/health` | 健康检查 |

## 项目结构

```
桌宠日程表/
├── README.md
│
├── plugins/
│   └── desktop_pet_scheduler/         # Neo-MoFox 插件
│       ├── manifest.json              # 插件元数据
│       ├── plugin.py                  # 插件入口（注册所有组件）
│       ├── config.py                  # TOML 配置定义
│       │
│       ├── models/                    # 数据模型
│       │   └── __init__.py            # ScheduleEvent / TodoItem / Live2DModel
│       │
│       ├── handlers/                  # 服务层（业务逻辑）
│       │   ├── __init__.py
│       │   ├── schedule_service.py    # 日程 CRUD 服务
│       │   ├── todo_service.py        # 待办 CRUD 服务
│       │   └── live2d_service.py      # Live2D 模型管理服务
│       │
│       ├── components/                # Neo-MoFox 组件
│       │   ├── __init__.py
│       │   ├── schedule.py            # 日程 Action + Tool
│       │   ├── todo.py                # 待办 Action + Tool
│       │   ├── live2d.py              # Live2D Tool
│       │   ├── commands.py            # /schedule, /todo, /pet 命令
│       │   ├── chatter.py             # 桌宠智能对话器
│       │   ├── events.py              # 事件处理器（提醒、启动）
│       │   └── router.py             # HTTP API 路由
│       │
│       └── assets/                    # 插件资源
│           └── live2d/                # Live2D 模型存放目录
│
├── frontend/                          # WebView 前端
│   ├── package.json                   # npm 依赖（Lit / Material Web / pixi.js / pixi-live2d-display）
│   ├── tsconfig.json
│   ├── vite.config.ts                 # Vite 配置 + API 代理
│   ├── index.html                     # 入口 HTML
│   └── src/
│       ├── main.ts                    # 应用入口
│       ├── env.d.ts                   # 类型声明 + Live2D 模块声明
│       ├── types.ts                   # 前后端共享数据结构
│       ├── styles/
│       │   ├── theme.css              # Material 3 Expressive 设计令牌 + 全局重置
│       │   └── shared.ts             # Lit 共享样式（排版/形状/表面/运动）
│       ├── api/
│       │   └── client.ts             # REST API 客户端（日程/待办/Live2D）
│       └── components/
│           ├── pet-app.ts             # 主应用壳 + Navigation Rail + 路由
│           ├── live2d-viewer.ts       # Live2D 渲染器（pixi.js + pixi-live2d-display）
│           ├── schedule-view.ts       # 日程视图（日期导航/事件列表/新建对话框）
│           ├── todo-panel.ts          # 待办面板（快速添加/筛选/勾选/统计）
│           ├── chat-bubble.ts         # 对话气泡（消息流/打字指示器/发送栏）
│           └── settings-page.ts       # 设置页（模型切换/偏好开关/关于信息）
│
└── docs/
    └── architecture.md                # 架构设计文档
```

## 开发指南

### 架构概览

```
用户消息 → Neo-MoFox 框架
    |
    ├── EventHandler (reminder_handler) → 检查即将到来的日程，发送提醒
    ├── Command (/schedule, /todo, /pet) → 直接命令处理
    └── Chatter (pet_chatter) → LLM 对话
            ├── Action (create_schedule, create_todo, ...) → 执行操作
            └── Tool (query_schedule, query_todo, live2d_status) → 查询信息

Service 层 (schedule_service / todo_service / live2d_service)
    └── Neo-MoFox Database API → 数据持久化

Router (pet_api) → /api/pet-scheduler/* → 前端 WebView
```

### 添加 Live2D 模型

1. 在 `plugins/desktop_pet_scheduler/assets/live2d/` 下创建新目录
2. 放入 `.moc3` 模型文件、纹理、动作和表情资源
3. 可选编写 `manifest.json` 自定义名称和描述
4. 使用 `/pet scan` 命令或重启框架，模型会被自动发现

### 配置文件

首次加载后自动生成在 `config/plugins/desktop_pet_scheduler/config.toml`：

```toml
[pet]
pet_name = "小墨"
personality = "你是一个可爱、活泼、偶尔毒舌的桌宠助手..."
live2d_models_dir = ""

[reminder]
enabled = true
default_minutes_before = 15
check_interval_seconds = 60

[display]
show_daily_summary = true
max_list_items = 20
date_format = "%Y-%m-%d %H:%M"

[api]
cors_origins = ["*"]
enable_api = true
```

## 许可证

AGPL-3.0 License

本项目使用 [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html) 开源协议。Live2D Cubism SDK 的使用需遵循其[独立许可条款](https://www.live2d.com/en/sdk/license/)。

## 贡献

欢迎提交 Issue 和 Pull Request。请先阅读 [架构设计文档](docs/architecture.md) 了解项目整体设计。

# 桌宠日程表 Desktop Pet Scheduler

基于 **Neo-MoFox** 插件系统 + **Electron** 的 Live2D 桌面宠物日程管理应用。

桌宠悬浮在桌面上，通过 LLM 对话帮你管理日程和待办事项，支持表情切换、眼神追踪、缩放拖拽等交互。

---

## 功能

- **Live2D 桌宠** — 加载 .moc3 模型，支持表情 / 动作 / 水印遮盖 / 眼神追踪鼠标
- **日程管理** — 日程 CRUD，重复事件、优先级、标签分类、到期提醒
- **待办事项** — 状态流转（待处理 / 进行中 / 已完成 / 已取消）、逾期检测
- **LLM 对话** — 桌宠感知日程和待办上下文，支持自然语言创建日程 / 待办（Function Calling）
- **命令系统** — `/schedule`、`/todo`、`/pet` 快速操作
- **Electron 桌面端** — 透明无边框悬浮窗、系统托盘、窗口置顶 / 缩放 / 拖拽
- **Material 3 Expressive** — Lit Web Components 管理面板，深色模式

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | [Neo-MoFox](https://github.com/MoFox-Studio/Neo-MoFox) — 插件框架，提供 LLM / 事件 / 数据库 |
| 后端 | Python 3.11+, FastAPI, SQLAlchemy 2.0 |
| 前端 | TypeScript, Lit 3, Vite 6 |
| 桌面 | Electron 33 |
| Live2D | pixi.js 7 + pixi-live2d-display 0.4 |
| UI | Material 3 Expressive Design |

## 快速开始

### 环境要求

- Neo-MoFox 主框架已安装
- Python ≥ 3.11，uv ≥ 0.6
- Node.js ≥ 18

### 1. 安装插件

```bash
# 将插件复制到 Neo-MoFox 的 plugins 目录
cp -r plugins/desktop_pet_scheduler <neo-mofox>/plugins/
```

### 2. 启动后端

```bash
cd <neo-mofox>
uv run main.py
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev          # Vite dev server (浏览器预览)
npm run dev:electron # Electron 桌面端
```

### 4. 添加 Live2D 模型

将 `.moc3` 模型目录放入 `plugins/desktop_pet_scheduler/assets/live2d/`，然后在设置页点击"扫描模型"或使用 `/pet scan` 命令。

## 项目结构

```
桌宠日程表/
├── plugins/desktop_pet_scheduler/     # Neo-MoFox 插件（后端）
│   ├── manifest.json                  # 插件元数据
│   ├── plugin.py                      # 入口，注册所有组件
│   ├── config.py                      # TOML 配置定义
│   ├── models/                        # 数据模型 (SQLAlchemy)
│   ├── handlers/                      # Service 层 (日程/待办/Live2D)
│   └── components/                    # Neo-MoFox 组件
│       ├── schedule.py                #   日程 Action + Tool
│       ├── todo.py                    #   待办 Action + Tool
│       ├── commands.py                #   /schedule /todo /pet 命令
│       ├── chatter.py                 #   LLM 对话器 (Function Calling)
│       ├── events.py                  #   事件处理 (提醒/启动)
│       └── router.py                  #   HTTP API 路由
│
├── frontend/                          # Electron + Lit 前端
│   ├── electron/
│   │   ├── main.ts                    # Electron 主进程 (窗口/托盘/IPC)
│   │   └── preload.ts                 # IPC 桥接
│   └── src/
│       ├── api/client.ts              # REST API 客户端
│       └── components/
│           ├── pet-overlay.ts         # 桌宠悬浮窗 (拖拽/缩放/菜单)
│           ├── live2d-viewer.ts       # Live2D 渲染 (pixi.js)
│           ├── panel-shell.ts         # 管理面板壳 + Navigation Rail
│           ├── schedule-view.ts       # 日程视图
│           ├── todo-panel.ts          # 待办面板
│           ├── chat-bubble.ts         # 对话气泡
│           └── settings-page.ts       # 设置页
│
└── docs/                              # 文档
```

## 命令

```
/schedule today                     查看今日日程
/schedule add <标题> [时间]          添加日程
/schedule delete <id>               删除日程
/schedule search <关键词>            搜索日程

/todo list [状态]                   列出待办 (pending/done/all)
/todo add <标题> [优先级]            添加待办
/todo done <id>                     完成/重开待办
/todo delete <id>                   删除待办

/pet status                         查看桌宠状态
/pet models                         列出 Live2D 模型
/pet switch <model_id>              切换模型
/pet scan                           重新扫描模型
```

## HTTP API

挂载于 `/api/pet-scheduler`：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/schedules` | 查询日程 |
| POST | `/schedules` | 创建日程 |
| DELETE | `/schedules/{id}` | 删除日程 |
| GET | `/todos` | 查询待办 |
| POST | `/todos` | 创建待办 |
| PATCH | `/todos/{id}` | 更新待办 |
| POST | `/todos/{id}/toggle` | 切换状态 |
| DELETE | `/todos/{id}` | 删除待办 |
| GET | `/live2d/models` | 模型列表 |
| GET | `/live2d/active` | 当前模型 |
| POST | `/live2d/switch/{id}` | 切换模型 |
| POST | `/live2d/scan` | 扫描模型 |
| POST | `/chat` | LLM 对话 (支持 Function Calling) |

## 配置

首次加载自动生成 `config/plugins/desktop_pet_scheduler/config.toml`：

```toml
[pet]
pet_name = "小墨"
personality = "你是一个可爱、活泼、偶尔毒舌的桌宠助手..."
live2d_models_dir = ""

[reminder]
enabled = true
default_minutes_before = 15
check_interval_seconds = 60
```

## 许可证

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)

Live2D Cubism SDK 的使用需遵循其[独立许可条款](https://www.live2d.com/en/sdk/license/)。

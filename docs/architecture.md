# 桌宠日程表 - 架构设计文档

## 1. 总体架构

本项目是一个 **Neo-MoFox 插件**，以 Neo-MoFox 为运行时宿主，复用其 LLM 调用、事件总线、数据持久化、消息收发等基础能力，在此之上实现日程管理、待办事项、Live2D 桌宠和智能对话功能。

### 架构层次

```
+------------------------------------------------------------------+
|                        用户交互层                                  |
|  自然语言对话 | /schedule /todo /pet 命令 | HTTP API | WebView 前端 |
+------------------------------------------------------------------+
         |               |                    |              |
+------------------------------------------------------------------+
|                     Neo-MoFox 组件层                               |
|  Chatter | Action | Tool | Command | EventHandler | Router        |
+------------------------------------------------------------------+
         |               |                    |
+------------------------------------------------------------------+
|                       服务层 (Service)                             |
|  ScheduleService  |  TodoService  |  Live2DService                |
+------------------------------------------------------------------+
         |               |
+------------------------------------------------------------------+
|                       数据层                                       |
|  Neo-MoFox Database API  |  文件系统 (Live2D 模型资源)             |
+------------------------------------------------------------------+
         |
+------------------------------------------------------------------+
|                    Neo-MoFox 框架层                                |
|  LLM API | Event API | Send API | Database API | Log API         |
+------------------------------------------------------------------+
```

## 2. 组件设计

### 2.1 数据模型 (models/)

| 模型 | 用途 |
|------|------|
| `ScheduleEvent` | 日程事件：标题、时间、重复类型、优先级、标签、提醒 |
| `TodoItem` | 待办事项：标题、状态流转、优先级、截止日期 |
| `Live2DModel` | Live2D 模型元数据：路径、动作组、表情列表 |

### 2.2 服务层 (handlers/)

**ScheduleService** -- 日程 CRUD
- `create_event()` / `update_event()` / `delete_event()`
- `get_today_events()` / `get_upcoming_events()` / `search_events()`
- 软删除机制 (is_deleted 标记)

**TodoService** -- 待办 CRUD + 状态管理
- `create_todo()` / `toggle_todo()` / `set_status()`
- `list_pending()` / `list_overdue()` / `get_stats()`
- 状态流转: pending -> in_progress -> done / cancelled

**Live2DService** -- Live2D 模型管理
- `scan_models()` -- 扫描目录，解析 model3.json 提取动作/表情
- `set_active_model()` / `get_active_model()`
- `trigger_motion()` / `trigger_expression()`
- 支持自定义 manifest.json 补充元数据

### 2.3 LLM 交互组件 (components/)

**Actions（执行操作）：**
- `create_schedule` -- 创建日程，LLM 解析自然语言时间和参数
- `send_schedule_list` -- 主动作，查询并发送日程列表
- `create_todo` -- 创建待办
- `send_todo_list` -- 主动作，查询并发送待办列表
- `toggle_todo` -- 切换待办完成状态

**Tools（信息查询）：**
- `query_schedule` -- 返回结构化日程数据供 LLM 推理
- `query_todo` -- 返回结构化待办数据
- `live2d_status` -- Live2D 模型状态查询与控制

### 2.4 对话器 (Chatter)

`PetChatter` -- 桌宠智能对话核心

工作流程:
1. 获取未读消息
2. 读取配置中的桌宠人格设定
3. 构建日程/待办上下文摘要注入 system prompt
4. 注册所有可用 Action/Tool 为 LLM 工具
5. 多轮工具调用循环 (最多 3 轮)
6. 发送最终回复

### 2.5 命令 (Command)

| 命令 | 子命令 |
|------|--------|
| `/schedule` | today, list, add, delete, search |
| `/todo` | list, add, done, delete, stats, search |
| `/pet` | status, models, switch, scan |

### 2.6 事件处理器 (EventHandler)

- `reminder_handler` -- 消息到达时检查即将开始的日程，自动发送提醒
- `startup_handler` -- 框架启动后扫描 Live2D 模型目录完成初始化

### 2.7 HTTP 路由 (Router)

挂载路径: `/api/pet-scheduler`

提供完整的 RESTful API:
- `/schedules` -- 日程 CRUD
- `/todos` -- 待办 CRUD + 状态切换 + 统计
- `/live2d/*` -- 模型列表/激活/切换/扫描
- `/health` -- 健康检查

CORS 白名单通过配置文件控制。

## 3. 数据流

### 3.1 自然语言创建日程

```
用户: "帮我明天下午三点安排一个会议"
  -> PetChatter 收到消息
  -> 构建 system prompt (注入今日日程/待办上下文)
  -> LLM 推理，决定调用 create_schedule Action
  -> Action 调用 ScheduleService.create_event()
  -> Database API 持久化
  -> Action 通过 send_text 回复用户
  -> LLM 生成最终确认回复
```

### 3.2 日程提醒

```
任意消息到达
  -> ReminderHandler.execute()
  -> ScheduleService.get_upcoming_events(15min)
  -> 有即将开始的日程 -> send_text 发送提醒
  -> 不拦截消息，继续正常处理链
```

### 3.3 前端交互 (规划中)

```
WebView 前端 (Material 3 Expressive)
  -> fetch /api/pet-scheduler/schedules
  -> fetch /api/pet-scheduler/live2d/active
  -> 渲染 Live2D 模型 + 日程/待办界面
```

## 4. 配置系统

配置文件: `config/plugins/desktop_pet_scheduler/config.toml`

| 配置节 | 关键字段 | 说明 |
|--------|----------|------|
| [pet] | pet_name, personality, live2d_models_dir | 桌宠名称、人格设定、模型目录 |
| [reminder] | enabled, default_minutes_before | 提醒开关与提前时间 |
| [display] | max_list_items, date_format | 展示相关 |
| [api] | cors_origins, enable_api | HTTP API 控制 |

## 5. Live2D 集成方案

### 模型目录结构

```
assets/live2d/
  +-- my_model/
      +-- my_model.model3.json    <- Cubism 3/4 入口文件 (必需)
      +-- my_model.moc3
      +-- textures/
      +-- motions/
      +-- expressions/
      +-- preview.png             <- 预览图 (可选)
      +-- manifest.json           <- 插件自定义元数据 (可选)
```

### 加载流程

1. `StartupHandler` 触发 -> `Live2DService.scan_models()`
2. 遍历模型目录，查找 `*.model3.json`
3. 解析 FileReferences 提取 Motions / Expressions
4. 读取可选 manifest.json 补充名称/描述
5. 注册到内存模型表，激活第一个模型
6. 前端通过 `/api/pet-scheduler/live2d/*` 获取模型信息进行渲染

## 6. 前端规划 (Material 3 Expressive)

前端采用 TypeScript + Lit + Vite 构建，使用 Material 3 Expressive 设计语言。

### 核心页面

- **桌宠主界面** -- Live2D 模型渲染 + 对话气泡
- **日程视图** -- 日历 + 时间轴展示
- **待办面板** -- 可拖拽排序的待办卡片列表
- **设置页** -- 桌宠个性化、提醒配置、模型切换

### 与后端通信

前端通过 HTTP API (`/api/pet-scheduler/*`) 与插件交互，无需额外的 WebSocket 或 pywebview bridge。

## 7. 许可证

- 项目整体: AGPL-3.0
- Live2D Cubism SDK: 需遵循其独立许可条款

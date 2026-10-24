# Code Style

本文件是项目的详细代码规范说明。  
`AGENTS.md` 与 `CLAUDE.md` 中的 `Code Style` 章节只保留摘要，详细规则统一以本文件为准。

## General

- 默认使用 TypeScript，保持类型显式、边界清晰、命名可读。
- 优先小模块、单一职责、明确依赖方向，避免把页面、状态、接口、工具函数混写在同一文件。
- 复杂逻辑优先拆成可复用的函数、hooks、store action、adapter 或 shared component。
- 出错时优先显式抛错或返回明确错误信息，不要用静默兜底掩盖问题。
- 新增或调整目录结构时，要同步更新 `README.md`、`AGENTS.md`、`CLAUDE.md` 中的相关说明。

## Frontend

- 页面/业务模块放在 `src/features/*`，按功能域拆分，不按“所有组件都堆一个目录”组织。
- 当 feature 内单个组件继续膨胀时，允许在该 feature 内继续下钻子目录，例如 `components/input-bar/*`、`components/prompt-library-drawer/*`、`components/search-bar/*`、`components/size-picker/*`、`components/task-grid/*`、`components/task-card/*`、`components/settings-modal/*`、`components/square/*`、`components/detail-modal/*`、`components/image-edit-modal/*`、`components/lightbox/*`，把容器、分区组件、常量、hooks 和工具拆开；单字段徽章、单字段表单这类过细文件应收回所属容器。
- 通用组件放在 `src/shared/components`，只有跨模块复用的组件才进入 shared。
- 应用级骨架和顶层编排放在 `src/app` 或 `src/App.tsx`，不要把业务细节塞进根组件。
- 接口调用统一收敛到 `src/lib/api` 或独立 api adapter，UI 组件不要直接承载复杂协议兼容逻辑；协议测试优先跟随 `src/lib/api/__tests__`。
- Zustand 状态与任务工作流放在 `src/store/*`，基础状态优先拆到 `src/store/slices/*`，运行时与任务编排继续拆到独立模块。
- IndexedDB 访问统一收敛到 `src/lib/db/*`，按 `schema / tasks / images` 拆分，不要回退到单文件巨型 DB 模块。
- 表单、弹窗、卡片、列表、右键菜单等组件要注意进一步拆分，避免再次出现超大 TSX 文件。
- 组件优先通过 props、hooks、shared utility 复用，避免复制粘贴同类逻辑。
- 复杂实现可以保留薄的 re-export 入口，但真实实现文件应移动到职责更清晰的子目录里。

## Backend

- 当前仓库以前端为主；若后续引入后端，目录和职责必须分层明确。
- 图片分享广场第一版后端实现放在 `workers/square-api/*`，但前端只能依赖 `/api/v1` 协议与 adapter，不要把 Worker、D1、R2 细节泄漏进 UI 组件。
- 后端至少区分实体类、接口定义、服务层、数据访问层、数据库连接/配置层。
- 路由层只做请求接收和响应组装，不直接堆业务逻辑与数据库细节。
- 数据库访问、事务、第三方服务调用不要散落在控制器或实体类中。

## Naming

- 文件名、导出名、目录名应与职责一致，避免 `utils2`、`newStore` 这类临时命名。
- React 组件使用 PascalCase。
- hooks 使用 `useXxx` 命名。
- 纯工具模块、状态模块、协议模块按领域语义命名，例如 `runtime.ts`、`responses.ts`、`taskStoreUtils.ts`。

## File Size And Splitting

- 当文件开始同时承担多种职责时，应立即拆分，不等到数千行再处理。
- 组件文件过大时，优先提取：
  - 子组件
  - 自定义 hooks
  - 纯函数工具
  - 事件处理逻辑
  - 类型定义
- 协议层、状态层、导入导出层、缓存层应天然分开，避免互相反向侵入。

## Imports And Dependencies

- 依赖方向尽量稳定：`features -> shared/lib/store`，避免 shared 反向依赖 feature。
- re-export 入口文件可以保留，但不要把真实实现继续堆回入口。
- 新增共享能力时，优先判断它是否真的是 shared；不要为了“复用”把业务特化代码错误地下沉。

## Documentation

- 新增常用命令、关键目录、协作约束时，更新 `README.md`。
- 更新协作规范时，必须同时更新根目录 `AGENTS.md` 与 `CLAUDE.md`，并保证两者完全一致。

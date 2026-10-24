# Project

`GPT Image Playground` 是一个面向 OpenAI / GPT Image 工作流的本地优先图片生成与编辑工作台。  
当前仓库以前端为主，技术栈为 `React 19 + TypeScript + Vite + Zustand`，核心能力包括图片生成与编辑、任务画廊、图片分享广场、本地持久化、供应商配置、协议兼容与导入导出。

领域语言与关键概念定义见 [CONTEXT.md](./CONTEXT.md)。

# Code Style

本文件只保留代码规范摘要，详细规则统一见 [docs/code-style.md](./docs/code-style.md)。

- 使用 TypeScript，保持类型边界清晰、命名明确、职责单一。
- 优先按功能和领域拆分模块，避免巨型文件和重复实现。
- 前端的页面、状态、接口适配、共享组件要分层组织。
- 出错时优先显式报错，不要用静默兜底掩盖问题。

# Commands

常用命令如下：

```bash
npm install
npm run dev
npm run build
npm run test
npm run test:watch
npm run preview
```

补充说明：

- 当前 `package.json` 已提供 `test` 与 `test:watch`，基于 `vitest`。
- `npm run build` 会执行 `tsc -b && vite build`。

# Architecture

当前推荐按以下结构理解项目：

```text
.
├─ AGENTS.md
├─ CLAUDE.md
├─ docs/
│  ├─ code-style.md
│  └─ images/
├─ public/
├─ workers/
│  └─ square-api/               图片分享广场 API 的 Cloudflare Worker 第一版实现
├─ src/
│  ├─ app/                      应用级骨架组件
│  ├─ features/                 按功能拆分的业务 UI 模块
│  │  ├─ gallery/
│  │  │  └─ components/
│  │  │     ├─ task-card/       任务卡片按预览、操作区、状态层、hook 拆分，单字段徽章不再单独成文件
│  │  │     └─ task-grid/       任务网格继续按容器 / 工具条 / 网格体 / 框选 hook 拆分
│  │  ├─ input/
│  │  │  └─ components/
│  │  │     ├─ input-bar/       输入面板按提示词 / 参考图 / 芯片参数 / 本地状态 hook 拆分，单字段表单不再单独成文件
│  │  │     ├─ prompt-library-drawer/ 提示词库继续按头部 / 保存表单 / 列表拆分
│  │  │     ├─ search-bar/      搜索栏继续按分类轨道 / 筛选 / 状态 hook / 移动端摘要拆分
│  │  │     └─ size-picker/     尺寸选择器继续按标签区 / 模式面板 / 共享常量拆分
│  │  ├─ settings/
│  │  │  └─ components/
│  │  │     └─ settings-modal/  设置抽屉按供应商 / 凭据 / 请求策略 / 数据管理分区拆分，单字段组件不再单独成文件
│  │  ├─ square/                图片分享广场，按页面 / 卡片 / 分享弹窗 / API adapter / manifest 构建拆分
│  │  └─ viewer/
│  │     └─ components/
│  │        ├─ detail-modal/    详情弹窗继续按预览区 / 信息区 / 图片状态 hook 拆分
│  │        ├─ image-edit-modal/ 局部编辑弹窗继续按画布区 / 侧栏 / 选区 hook / 状态 hook 拆分
│  │        └─ lightbox/        大图查看继续按状态导航 / 缩放手势 / 视图壳层拆分
│  ├─ hooks/                    自定义 hooks
│  ├─ lib/                      基础能力与适配层
│  │  ├─ api/                   Images / Responses 协议实现
│  │  ├─ capabilities/          模型目录、官方字段兼容与参数收口
│  │  ├─ db/                    IndexedDB schema / tasks / images 访问拆分
│  │  ├─ devProxy.ts            本地代理辅助
│  │  └─ size.ts                尺寸计算与规整
│  ├─ shared/
│  │  └─ components/            通用组件
│  ├─ store/                    Zustand 状态、切片、任务工作流、导入导出等实现
│  │  └─ slices/                provider / inputDraft / task / viewer / dialog 基础切片
│  ├─ App.tsx                   应用根组件
│  ├─ main.tsx                  入口
│  ├─ store.ts                  Store 统一导出入口
│  └─ types.ts                  全局类型定义
├─ package.json
└─ README.md
```

架构约束：

- `src/features/*` 放业务模块。
- 复杂 feature 允许继续下钻子目录，例如 `components/input-bar/*`、`components/prompt-library-drawer/*`、`components/search-bar/*`、`components/size-picker/*`、`components/task-grid/*`、`components/task-card/*`、`components/settings-modal/*`、`components/square/*`、`components/detail-modal/*`、`components/image-edit-modal/*`、`components/lightbox/*`。
- `src/shared/components` 只放跨模块复用的通用组件。
- `src/store/*` 放状态、任务编排、缓存、导入导出等逻辑实现；基础状态优先收敛到 `src/store/slices/*`。
- `src/lib/api/*` 放协议适配、请求编排、流式解析与相关测试；`src/lib/api.ts` 仅作为统一导出入口。
- `src/lib/db/*` 放 IndexedDB schema、task 读写、image 读写与迁移逻辑；不要再把整套 DB 细节堆回单文件。
- `workers/square-api/*` 放图片分享广场 API 的 Worker 实现；前端只能依赖 `/api/v1` 协议与 adapter，不能反向依赖 Worker、D1 或 R2 细节。

# Important Notes

- 与用户沟通默认使用中文。
- 同目录下若同时存在 `AGENTS.md` 与 `CLAUDE.md`，两者内容必须保持一致；修改其一时必须同步修改另一份。
- 前后端代码职责以及目录结构需要合理分层。
- 后端若后续接入，需重点做好实体类、接口定义、服务层、数据访问层、数据库连接与配置层的分层，避免把业务逻辑、路由逻辑和数据库细节混写。
- 前端需重点做好页面层、功能模块层、api 适配层、store 层、shared 组件层的分层，避免把 UI、状态和协议细节堆在同一文件。
- 不论前端还是后端，都必须注意组件、模块和函数的拆分与复用，特别是前端；不要把全部内容写到一个文件里。
- 目录结构发生明显调整时，要同步更新 `README.md`、`docs/code-style.md`、`AGENTS.md` 与 `CLAUDE.md`。

# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 项目概述

TestFlow 是一个企业级自动化测试平台，具备AI驱动的批量更新功能。基于 React 18 + TypeScript 前端和 Node.js + Express 后端构建，集成 Playwright 进行浏览器自动化和 MCP（模型上下文协议）进行AI驱动的测试执行。

## 核心命令

### 开发环境
```bash
# 一键启动（推荐）
node scripts/start.js

# 开发模式（前端+后端）
npm run dev

# 仅启动前端（端口5173）
npm run dev:frontend

# 仅启动后端（端口3001）
npm run dev:server

# 可视化模式（调试时浏览器可见）
npm run dev-visible
npm run server-visible
```

### 数据库操作
```bash
# 应用迁移
npx prisma migrate dev

# 生成 Prisma 客户端
npx prisma generate

# 重置数据库
npx prisma migrate reset
```

### 测试与质量检查
```bash
npm run lint
npm test
```

### 构建与部署
```bash
npm run build
npm run preview
```

## 架构概览

### 核心组件
- **前端**: React 18 + TypeScript + Tailwind CSS (src/)
- **后端**: Express API + WebSocket (server/)
- **数据库**: MySQL + Prisma ORM (prisma/)
- **AI引擎**: MCP客户端 + AI解析器，用于自然语言测试处理
- **测试执行**: Playwright 集成，用于浏览器自动化

### 关键数据流
1. **测试管理**: test_cases → test_suites → test_runs
2. **AI批量更新**: bulk_edit_sessions → case_patch_proposals → case_versions
3. **执行流程**: testExecution.ts → mcpClient.ts → Playwright → WebSocket 更新

### 关键服务
- `server/services/testExecution.ts` - 核心测试执行编排
- `server/services/aiBulkUpdateService.ts` - AI批量修改逻辑
- `server/services/mcpClient.ts` - MCP协议与AI模型集成
- `server/services/websocket.ts` - 实时状态更新

## 项目结构

### 前端 (`src/`)
- `components/` - React UI组件，包括 AIBulkUpdateModal.tsx
- `pages/` - 主要应用页面（TestCases.tsx, TestRuns.tsx）
- `services/` - API客户端和前端服务
- `types/test.ts` - 核心 TypeScript 类型定义

### 后端 (`server/`)
- `routes/` - Express API端点（test.ts, aiBulkUpdate.ts）
- `services/` - 业务逻辑和集成
- `types/` - 后端类型定义

### 数据库
- MySQL 数据库，具备支持测试管理和AI批量更新的完整架构
- 关键表：test_cases, test_suites, bulk_edit_sessions, case_patch_proposals
- AI专用枚举：proposal_risk_level, proposal_apply_status

## 核心功能

### AI批量更新系统
- 使用AI模型处理自然语言变更描述
- 基于JSON补丁的修改，支持版本控制
- 风险评估和选择性应用
- 基于会话的工作流程，支持提案审核

### 测试执行
- MCP驱动的 Playwright 自动化
- 实时 WebSocket 状态更新
- 截图和产物收集
- 基于套件的批量执行

## 开发注意事项

### 环境变量
- `DATABASE_URL` - MySQL 连接字符串
- `AI_MODEL_PROVIDER` - anthropic/openai
- `PLAYWRIGHT_HEADLESS` - 浏览器可见性设置
- 端口配置：前端（5173），后端（3001）

### 需要修复的重要Bug
在 AIBulkUpdateModal.tsx 中，用户对AI提案的编辑存储在前端状态（`editedContents`）中，但在应用时从未传输到后端。后端应用的是数据库中的原始AI建议，而非用户修改。

### 代码约定
- 启用 TypeScript 严格模式
- 使用 Tailwind CSS 进行样式设计，配合自定义组件
- 使用 Prisma 进行数据库访问，配合生成的类型
- Express 使用 async/await 模式，具备适当的错误处理
- 使用 ws 库进行 WebSocket 实时更新

### 测试
- Jest 用于单元测试
- Playwright 用于浏览器自动化测试
- 截图对比和产物收集
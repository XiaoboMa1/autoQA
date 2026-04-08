# 根目录清理方案

## 📊 当前问题分析

根目录有 **100+** 个文件，包含大量临时文件、测试脚本和文档，导致：
- ❌ 项目结构混乱，难以找到关键文件
- ❌ 新成员不清楚哪些文件是重要的
- ❌ Git仓库体积臃肿

---

## 🗂️ 文件分类

### ✅ 保留 - 配置文件 (18个)
```
package.json              - NPM配置
package-lock.json         - 依赖锁定
vite.config.ts           - Vite构建配置
tsconfig.json            - TypeScript配置
tsconfig.app.json        - 应用TS配置
tsconfig.node.json       - Node TS配置
tailwind.config.js       - Tailwind CSS配置
postcss.config.js        - PostCSS配置
playwright.config.js     - Playwright测试配置
jest.config.js           - Jest测试配置
jest.setup.js            - Jest设置
global-setup.js          - 全局设置
eslint.config.js         - ESLint配置
index.html               - 入口HTML
.gitignore               - Git忽略规则
.env (如果存在)          - 环境变量
README.md                - 项目说明
CLAUDE.md                - Claude Code指南
```

### ✅ 保留 - 文档 (2个)
```
TYPOGRAPHY_GUIDE.md      - 字体使用规范
CHANGES.md               - 更新日志
```

### 📁 移动到 docs/ - 技术文档 (15个)
```
AI_CONFIG_OPTIMIZATION.md
FRONTEND_OPTIMIZATION_SUMMARY.md
KNOWN_ISSUES.md
MANAGEMENT_API_IMPLEMENTATION_SUMMARY.md
MCP_DEPLOYMENT_GUIDE.md
MCP_PARAMETER_FORMAT_FIX_README.md
MCP_TASK_MANAGER_DEMO_SUMMARY.md
project-tech-summary.md
scroll-usage-examples.md
snapshot-optimization-analysis.md
TEST_EXECUTION_PERFORMANCE_OPTIMIZATION.md
autoQA_ENHANCEMENT_PROGRESS.md
autoQA系统功能介绍文档.md
UI_OPTIMIZATION_GUIDE.md
Axure自动生成测试用例-需求文档-V2.0-最终版.md
```

### 🗑️ 删除 - 临时测试文件 (20+个)
```
check-frontend-config.html
check-labels.cjs
check-output.txt
check-parsed-elements.cjs
correct-task-demo.js
create-test-admin.js
debug-execution.log
deep-system-analysis.js
demo-task-manager.js
find-notes.cjs
mcp-client-enhanced.js
real-task-demo.js
simple-task-demo.js
start-server.js
test-axure-optimization.js
test-axure-parse.js
test-cors.html
test-db-tables.js
test-frontend-token.html
test-long-text-extract.cjs
test-mjpeg.js
test-rag-integration.js
test-requirement-output.md
test-suite-demo.html
test-user-api.js
test-window-maximize.js
testfile.txt
```

### 🗑️ 删除 - 临时优化脚本 (5个)
```
browser-session-optimization.ts
deployment.config.js
performance-optimization-patch.ts
update_stream_service.py
d:AI_mvpai_testprojectserverservicestestCaseExecutionService.ts
```

### 🗑️ 删除 - 配置文件备份 (3个)
```
defaultProfile.windows
mcp-config.json
screenshot-config.json
```

### 🗑️ 删除 - SQL脚本 (1个)
```
fix-test-case-data.sql
```

### ⚠️ 已有.gitignore规则的目录（不需要手动处理）
```
node_modules/
dist/
artifacts/
logs/
temp/
uploads/
screenshots/
temp-screenshots/
playwright-report/
test-results/
```

---

## 🎯 清理操作

### 第1步: 创建docs目录结构
```bash
mkdir docs/tech-docs
mkdir docs/archived
```

### 第2步: 移动技术文档
移动15个技术文档到 `docs/tech-docs/`

### 第3步: 删除临时文件
删除所有测试脚本、临时文件

### 第4步: 更新.gitignore
添加排除规则避免未来再次出现

### 第5步: 清理特殊文件
- nul 文件（Windows临时文件）
- FONT_OPTIMIZATION_REPORT.md（已删除）

---

## 📋 清理后的根目录结构

```
project/
├── 📁 node_modules/          # 依赖（gitignore）
├── 📁 dist/                  # 构建产物（gitignore）
├── 📁 public/                # 静态资源
├── 📁 src/                   # 源代码
├── 📁 server/                # 后端代码
├── 📁 prisma/                # 数据库
├── 📁 scripts/               # 构建脚本
├── 📁 tests/                 # 测试文件
├── 📁 docs/                  # 📌 文档目录
│   ├── tech-docs/            # 技术文档
│   └── archived/             # 归档文档
├── 📁 lib/                   # 库文件
├── 📁 migrations/            # 数据库迁移
├── 📁 tasks/                 # 任务定义
├── 📁 bmad/                  # BMAD相关
├── 📄 package.json           # ✅ NPM配置
├── 📄 vite.config.ts         # ✅ Vite配置
├── 📄 tsconfig.json          # ✅ TS配置
├── 📄 tailwind.config.js     # ✅ Tailwind配置
├── 📄 playwright.config.js   # ✅ Playwright配置
├── 📄 jest.config.js         # ✅ Jest配置
├── 📄 eslint.config.js       # ✅ ESLint配置
├── 📄 index.html             # ✅ 入口HTML
├── 📄 .gitignore             # ✅ Git忽略
├── 📄 README.md              # ✅ 项目说明
├── 📄 CLAUDE.md              # ✅ AI助手指南
├── 📄 TYPOGRAPHY_GUIDE.md    # ✅ 字体规范
└── 📄 CHANGES.md             # ✅ 更新日志
```

**预期效果**: 根目录从 100+ 个文件减少到 **20个左右** 的文件 ✨

---

## 🔒 防止再次混乱

### 更新 .gitignore
```gitignore
# 测试和临时文件
test-*.js
test-*.cjs
test-*.html
*-demo.js
*-test.js
check-*.js
check-*.cjs
debug-*.js
demo-*.js
simple-*.js

# 临时优化脚本
*-optimization.ts
*-patch.ts
update_*.py

# 临时配置文件
defaultProfile.*
*-config.json
!package.json
!tsconfig*.json
!vite.config.ts
!playwright.config.js
!jest.config.js
!eslint.config.js
!tailwind.config.js
!postcss.config.js

# SQL脚本（除了migrations）
*.sql

# 文本测试文件
testfile.txt
check-output.txt
```

### 团队规范
1. ✅ 所有临时测试脚本放到 `tests/temp/` 或 `scripts/temp/`
2. ✅ 所有文档放到 `docs/` 目录
3. ✅ 不要在根目录创建临时文件
4. ✅ 使用 `.gitignore` 自动排除临时文件

---

**准备执行清理？** 建议先备份重要文件！

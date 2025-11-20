# 📦 安装指南

本文档提供 TestFlow 的详细安装步骤和配置说明。

---

## 📋 系统要求

### 基础环境

| 组件 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18.0.0 | JavaScript 运行时 |
| NPM | >= 8.0.0 | 包管理器 |
| MySQL | >= 8.0 | 数据库 (推荐) |
| Qdrant | >= 1.12 | 向量数据库 (可选,用于 RAG) |
| 操作系统 | Windows 10+ / macOS 10.15+ / Linux | - |
| 内存 | >= 8GB | 推荐 16GB+ (启用 RAG 建议 12GB+) |
| 磁盘 | >= 20GB | 可用空间 (启用 RAG 建议 30GB+) |

### 推荐配置 (10 人团队)

- **CPU**: 8 vCPU
- **内存**: 16GB RAM
- **存储**: SSD 100GB+
- **网络**: 稳定的内网环境
- **数据库**: MySQL 8.0 (utf8mb4 字符集)

---

## 🚀 安装方式

### 方式一: 一键启动 (推荐)

```bash
# 克隆项目
git clone https://github.com/testflow/testflow.git
cd testflow

# 一键启动 (自动安装依赖、配置环境、启动服务)
node scripts/start.js
```

### 方式二: 手动安装

#### 1. 安装依赖

```bash
npm install
```

#### 2. 安装 Playwright 浏览器

```bash
npx playwright install chromium
```

#### 3. 配置数据库

编辑 `.env` 文件:

```bash
DATABASE_URL="mysql://username:password@localhost:3306/testflow"
```

应用数据库迁移:

```bash
npx prisma migrate deploy
npx prisma generate
```

#### 4. 启动服务

```bash
# 同时启动前后端
npm run dev

# 或分别启动
npm run dev:frontend  # 前端 (端口 5173)
npm run dev:server    # 后端 (端口 3001)
```

---

## ⚙️ 环境变量配置

### 基础配置 (.env)

```bash
# ========== 数据库配置 ==========
DATABASE_URL="mysql://username:password@localhost:3306/testflow"

# ========== 应用配置 ==========
NODE_ENV=development               # 环境: development / production
PORT=3001                          # 后端端口
VITE_PORT=5173                     # 前端端口

# ========== JWT 认证 ==========
JWT_SECRET=your_jwt_secret_key_here_change_in_production
JWT_EXPIRES_IN=7d                  # Token 过期时间

# ========== Playwright 配置 ==========
PLAYWRIGHT_HEADLESS=true           # 无头模式: true / false
PLAYWRIGHT_BROWSER=chromium        # 浏览器: chromium / firefox / webkit

# ========== 测试执行配置 ==========
TEST_TIMEOUT=600000                # 测试超时: 10 分钟
MAX_CONCURRENT_TESTS=6             # 最大并发数
```

### AI 模型配置

```bash
# ========== AI 模型配置 ==========
# TestFlow 支持 4 种 AI 模型,可在前端设置页面一键切换

# OpenRouter 配置 (支持 GPT-4o, DeepSeek, Claude)
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_MODEL=openai/gpt-4o        # 默认模型
DEFAULT_TEMPERATURE=0.3
DEFAULT_MAX_TOKENS=4000

# 本地 Gemini API 配置 (可选)
GEMINI_LOCAL_BASE_URL=http://localhost:3000/v1
GEMINI_LOCAL_API_KEY=your_local_api_key_here

# 代理配置 (可选)
HTTP_PROXY=http://127.0.0.1:10808
HTTPS_PROXY=http://127.0.0.1:10808
```

### RAG 知识库配置 (可选)

```bash
# ========== RAG 知识库配置 ==========
QDRANT_URL=http://localhost:6333   # Qdrant 向量数据库地址
EMBEDDING_PROVIDER=aliyun          # Embedding 提供商: aliyun / gemini / openai
EMBEDDING_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_API_KEY=your_aliyun_key  # 阿里云通义千问 API Key
EMBEDDING_MODEL=text-embedding-v4  # 1024维向量模型
```

### 日志配置

```bash
# ========== 日志配置 ==========
LOG_LEVEL=info                     # 日志级别: debug / info / warn / error
LOG_FULL_PROMPT=false              # 是否记录完整 AI Prompt
```

---

## 🗄️ 数据库配置

### MySQL 数据库创建

```sql
CREATE DATABASE testflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 应用数据库迁移

```bash
# 初次设置
npx prisma migrate dev --name init

# 应用迁移
npx prisma migrate deploy

# 重新生成客户端
npx prisma generate

# 重置数据库 (⚠️ 慎用,会清空所有数据)
npx prisma migrate reset
```

---

## 🔍 可选: 启用 RAG 知识库

### 1. 启动 Qdrant 向量数据库

**方式 1: Docker (推荐)**

```bash
docker run -d -p 6333:6333 qdrant/qdrant

# 或使用项目脚本 (Windows)
start-qdrant.bat

# 验证启动
curl http://localhost:6333/health
```

**方式 2: 本地安装**

参考 [Qdrant 官方文档](https://qdrant.tech/documentation/guides/installation/)

### 2. 配置 Embedding API

编辑 `.env` 文件:

```bash
QDRANT_URL=http://localhost:6333
EMBEDDING_PROVIDER=aliyun
EMBEDDING_API_KEY=your_aliyun_api_key
EMBEDDING_MODEL=text-embedding-v4
```

获取阿里云 API Key:
- 访问 [阿里云 DashScope 控制台](https://dashscope.console.aliyun.com/apiKey)
- 创建 API Key

### 3. 重启服务

```bash
npm run dev
```

### 4. 验证 RAG 功能

查看日志确认 RAG 已启用:

```bash
tail -f logs/server.log | grep "RAG"

# 示例输出:
# 🔍 [RAG-Step1] 开始向量检索...
# ✅ [RAG-Step2] 向量检索完成 (耗时: 245ms)
# 📊 [RAG-Step3] 业务规则: 2条, 测试模式: 1条, 历史踩坑: 1条
# 🎯 [RAG模式] 将使用知识库增强模式生成测试用例
```

详细 RAG 配置: [RAG_SETUP.md](RAG_SETUP.md)

---

## 🌐 访问系统

### 默认访问地址

```
前端: http://localhost:5173
后端 API: http://localhost:3001
```

### 首次登录

```
用户名: admin
密码: admin
```

**⚠️ 安全提示**: 首次登录后请立即修改默认密码！

---

## 🧪 验证安装

### 检查服务状态

```bash
# 检查前端
curl http://localhost:5173

# 检查后端 API
curl http://localhost:3001/api/health

# 检查数据库连接
npx prisma db pull
```

### 运行测试

```bash
npm run lint
npm test
```

---

## 📦 生产环境部署

### 构建生产版本

```bash
npm run build
```

### 启动生产服务

```bash
npm run preview
```

### 推荐部署方式

- **前端**: Nginx + 静态文件托管
- **后端**: PM2 进程管理
- **数据库**: MySQL 主从复制
- **RAG**: Qdrant 集群部署

详细部署指南: [deployment-guide.md](deployment-guide.md)

---

## 🔧 常见安装问题

### Node.js 版本过低

```bash
# 检查版本
node --version

# 升级 Node.js
# 访问 https://nodejs.org 下载最新版本
```

### MySQL 连接失败

```bash
# 检查 MySQL 服务
net start mysql  # Windows
sudo systemctl start mysql  # Linux

# 测试连接
npx prisma db pull
```

### Playwright 浏览器缺失

```bash
# 重新安装浏览器
npx playwright install chromium

# 清理缓存
npx playwright uninstall
npx playwright install
```

### 端口占用

```bash
# Windows 查看端口
netstat -ano | findstr :3001
netstat -ano | findstr :5173

# 修改端口 (.env)
PORT=3002
VITE_PORT=5174
```

更多问题: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## 📚 下一步

安装完成后,您可以:

1. [查看使用指南](../README.md#-使用指南)
2. [配置 AI 模型](CONFIGURATION.md#ai-模型配置)
3. [启用 RAG 知识库](RAG_SETUP.md)
4. [了解自然语言执行原理](EXECUTION.md)

---

**返回**: [README](../README.md)

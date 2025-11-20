# 🐛 故障排除指南

TestFlow 常见问题和解决方案。

---

## 📋 快速诊断

### 检查服务状态

```bash
# 检查前端
curl http://localhost:5173

# 检查后端 API
curl http://localhost:3001/api/health

# 检查数据库连接
npx prisma db pull

# 检查 Qdrant (RAG)
curl http://localhost:6333/health
```

---

## 🔧 安装问题

### 1. Node.js 版本过低

**症状**：
```
Error: The engine "node" is incompatible with this module
```

**解决**：
```bash
# 检查版本
node --version

# 升级 Node.js（访问 https://nodejs.org 下载最新版本）
# 推荐使用 nvm 管理 Node.js 版本
```

### 2. NPM 依赖安装失败

**症状**：
```
npm ERR! code EINTEGRITY
npm ERR! Verification failed
```

**解决**：
```bash
# 清除缓存
npm cache clean --force

# 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

### 3. Playwright 浏览器缺失

**症状**：
```
Error: Executable doesn't exist at ~/.cache/ms-playwright/chromium-xxx/chrome-linux/chrome
```

**解决**：
```bash
# 安装 Playwright 浏览器
npx playwright install chromium

# 或重新安装全部浏览器
npx playwright install

# 清理缓存重装
npx playwright uninstall
npx playwright install chromium
```

---

## 🗄️ 数据库问题

### 1. MySQL 连接失败

**症状**：
```
Error: P1001: Can't reach database server at `localhost:3306`
```

**解决**：
```bash
# Windows: 检查 MySQL 服务
net start mysql

# Linux: 启动 MySQL
sudo systemctl start mysql

# 检查 MySQL 状态
sudo systemctl status mysql

# 测试连接
npx prisma db pull
```

### 2. 数据库迁移失败

**症状**：
```
Error: P3009: migrate found failed migrations
```

**解决**：
```bash
# 重置数据库（⚠️ 会清空所有数据）
npx prisma migrate reset

# 重新应用迁移
npx prisma migrate deploy

# 重新生成客户端
npx prisma generate
```

### 3. 字符集问题

**症状**：中文乱码

**解决**：
```sql
# 确保数据库使用 utf8mb4 字符集
ALTER DATABASE testflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## 🔐 认证问题

### 1. JWT Token 过期

**症状**：前端提示 "Token 已过期，请重新登录"

**解决**：
```bash
# 方式 1：清除浏览器 Token，重新登录
# 开发者工具 → Application → Local Storage → 清除

# 方式 2：修改 Token 过期时间 (.env)
JWT_EXPIRES_IN=30d  # 延长到 30 天
```

### 2. 忘记管理员密码

**解决**：
```bash
# 重新生成管理员账号
node scripts/create-admin.ts

# 或直接修改数据库（密码为 admin123）
# 使用 bcrypt 生成哈希后更新数据库
```

### 3. 认证失败

**症状**：
```
Error: Invalid token
```

**解决**：
```bash
# 检查 JWT_SECRET 配置
echo $JWT_SECRET

# 确保前后端使用相同的 JWT_SECRET
# 修改 .env 文件后需要重启服务
```

---

## 🎭 测试执行问题

### 1. Playwright 浏览器启动失败

**症状**：
```
Error: Browser closed unexpectedly
```

**解决**：
```bash
# 检查浏览器是否已安装
npx playwright install chromium

# 尝试使用可见模式调试
# .env 文件：
PLAYWRIGHT_HEADLESS=false

# 重启服务
npm run dev
```

### 2. 元素定位失败

**症状**：测试步骤失败，提示 "无法找到元素"

**解决**：
```
# 1. 增加等待时间
等待页面加载完成
点击登录按钮

# 2. 更详细的描述
点击页面底部蓝色的"登录"按钮  # 更具体

# 3. 检查页面是否真的有该元素
# 使用 PLAYWRIGHT_HEADLESS=false 查看浏览器
```

### 3. 测试超时

**症状**：测试执行超过 10 分钟后终止

**解决**：
```bash
# 修改超时配置 (.env)
TEST_TIMEOUT=1800000  # 延长到 30 分钟

# 重启服务
npm run dev
```

### 4. 截图保存失败

**症状**：执行记录中没有截图

**解决**：
```bash
# 检查磁盘空间
df -h

# 检查截图目录权限
ls -la artifacts/screenshots

# 创建目录（如果不存在）
mkdir -p artifacts/screenshots
chmod 755 artifacts/screenshots
```

---

## 🤖 AI 模型问题

### 1. OpenRouter API 调用失败

**症状**：
```
Error: Failed to generate test case: 401 Unauthorized
```

**解决**：
```bash
# 1. 检查 API Key 是否正确
# .env 文件：
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# 2. 确认 API Key 是否有效
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://openrouter.ai/api/v1/models

# 3. 检查网络连接（国外 API 可能需要代理）
HTTP_PROXY=http://127.0.0.1:10808
HTTPS_PROXY=http://127.0.0.1:10808
```

### 2. AI 生成质量差

**症状**：生成的测试用例不符合预期

**解决**：
```bash
# 1. 启用 RAG 知识库增强
# 参考 RAG_SETUP.md 配置

# 2. 更换 AI 模型
# 在设置页面切换到 GPT-4o 或 Claude

# 3. 人工审核需求文档
# 在步骤 2 仔细审核并修正 AI 生成的需求文档
```

### 3. AI 响应慢

**症状**：生成测试用例等待时间过长

**解决**：
```bash
# 1. 更换为更快的模型
# DeepSeek Chat V3 性价比高，速度快

# 2. 检查网络连接
# 确认是否需要代理

# 3. 减少生成数量
# 分批生成，不要一次性生成过多测试点
```

---

## 🧠 RAG 知识库问题

### 1. Qdrant 连接失败

**症状**：
```
Error: Failed to connect to Qdrant at http://localhost:6333
```

**解决**：
```bash
# 检查 Qdrant 服务状态
curl http://localhost:6333/health

# 重启 Qdrant (Docker)
docker ps  # 查看容器 ID
docker restart <qdrant_container_id>

# 或重新启动
docker run -d -p 6333:6333 qdrant/qdrant

# 检查端口占用
netstat -ano | findstr :6333
```

### 2. Embedding API 调用失败

**症状**：
```
Error: Failed to generate embedding: 403 Forbidden
```

**解决**：
```bash
# 检查 API Key 是否正确 (.env)
EMBEDDING_API_KEY=sk-xxxxx  # 确认是阿里云 API Key

# 测试 API
curl -X POST https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"text-embedding-v4","input":"测试文本"}'
```

### 3. RAG 未生效

**症状**：生成的测试用例没有使用知识库

**解决**：
```bash
# 1. 检查 Qdrant 是否启动
curl http://localhost:6333/health

# 2. 检查知识库是否有数据
curl http://localhost:6333/collections

# 3. 查看 RAG 日志
tail -f logs/server.log | grep "RAG"

# 预期看到：
# 🔍 [RAG-Step1] 开始向量检索...
# ✅ [RAG-Step2] 向量检索完成 (耗时: 245ms)
```

---

## 🌐 网络问题

### 1. 端口占用

**症状**：
```
Error: Port 3001 is already in use
```

**解决**：
```bash
# Windows: 查看端口占用
netstat -ano | findstr :3001

# 杀死占用进程
taskkill /PID <PID> /F

# 或修改端口 (.env)
PORT=3002
VITE_PORT=5174
```

### 2. CORS 错误

**症状**：浏览器控制台提示 CORS 错误

**解决**：
```bash
# 确认前后端端口配置正确
# 前端默认：5173
# 后端默认：3001

# 检查后端 CORS 配置
# server/index.ts 应该已配置 CORS 中间件
```

### 3. WebSocket 连接失败

**症状**：测试执行时没有实时进度更新

**解决**：
```bash
# 1. 检查 WebSocket 端口
# 默认使用后端端口 3001

# 2. 检查防火墙设置
# 确保允许 WebSocket 连接

# 3. 查看浏览器控制台
# 查看 WebSocket 连接错误信息
```

---

## 📊 性能问题

### 1. 页面加载慢

**症状**：前端页面加载时间过长

**解决**：
```bash
# 1. 检查数据库查询性能
# 添加索引

# 2. 启用生产模式
npm run build
npm run preview

# 3. 使用 CDN 加速静态资源
```

### 2. 测试执行慢

**症状**：单个测试用例执行时间过长

**解决**：
```bash
# 1. 减少不必要的等待
# 使用"等待页面加载完成"而不是"等待 5 秒"

# 2. 优化步骤描述
# 更清晰的描述可以减少 AI 处理时间

# 3. 检查网络延迟
# 确保测试目标网站响应正常
```

### 3. 内存占用高

**症状**：服务运行一段时间后内存占用过高

**解决**：
```bash
# 1. 定期重启服务
# 使用 PM2 自动管理进程

# 2. 限制并发数 (.env)
MAX_CONCURRENT_TESTS=3  # 减少并发数

# 3. 清理日志文件
# 定期清理 logs/ 目录
```

---

## 🔍 调试技巧

### 启用详细日志

```bash
# .env 文件
LOG_LEVEL=debug
LOG_FULL_PROMPT=true

# 查看日志
tail -f logs/server.log
```

### 使用可见模式调试

```bash
# .env 文件
PLAYWRIGHT_HEADLESS=false

# 重启服务，浏览器窗口将可见
npm run dev
```

### 查看数据库数据

```bash
# 使用 Prisma Studio
npx prisma studio

# 浏览器访问 http://localhost:5555
```

---

## 📞 获取帮助

### 文档资源

- [安装指南](INSTALLATION.md)
- [配置说明](CONFIGURATION.md)
- [AI 生成器详解](AI_GENERATOR.md)
- [RAG 配置](RAG_SETUP.md)
- [自然语言执行原理](EXECUTION.md)

### 问题反馈

- [提交 Bug](https://github.com/testflow/testflow/issues)

---

**返回**: [README](../README.md)

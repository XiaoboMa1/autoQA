import express from 'express';
import cors from 'cors';
import path from 'path';
import { TestExecutionService } from './services/testExecution.js';
import { SuiteExecutionService } from './services/suiteExecution.js';
import { WebSocketManager } from './services/websocket.js';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { testRoutes } from './routes/test.js';
import { suiteRoutes } from './routes/suite.js'; // 🔥 新增
import { screenshotRoutes } from './routes/screenshots.js';
import { configRoutes } from './routes/config.js';
// 🔥 新增：AI批量更新相关路由
import { createAiBulkUpdateRoutes, createVersionRoutes } from './routes/aiBulkUpdate.js';
import { createFeatureFlagRoutes, createPublicFeatureFlagRoutes } from './routes/featureFlag.js';
import { createSecurityRoutes } from './routes/security.js';
// 🔥 新增：认证相关路由
import { createAuthRoutes } from './routes/auth.js';
import { createUserRoutes } from './routes/users.js';
import { createAuthMiddleware } from './middleware/authMiddleware.js';
// 🔥 新增：Dashboard统计路由
import { createDashboardRoutes } from './routes/dashboard.js';
// 🔥 新增：Reports测试报告路由
import { createReportsRoutes } from './routes/reports.js';
// 🔥 新增：功能测试用例相关路由
import { createAxureRoutes } from './routes/axure.js';
import { createFunctionalTestCaseRoutes } from './routes/functionalTestCase.js';
// 🔥 新增：系统字典管理路由
import systemsRouter from './routes/systems.js';
// 🔥 新增：知识库管理路由
import knowledgeRouter from './routes/knowledge.js';
// 🔥 新增：初始化功能开关和权限
import { initializeAllFeatureFlags } from './middleware/featureFlag.js';
import { PermissionService } from './middleware/auth.js';
import { AITestParser } from './services/aiParser.js';
import { PlaywrightMcpClient } from './services/mcpClient.js';
import { ScreenshotService } from './services/screenshotService.js';
import { PrismaClient } from '../src/generated/prisma/index.js';
import { DatabaseService } from './services/databaseService.js';
import { QueueService } from './services/queueService.js';
import { StreamService } from './services/streamService.js';
import { EvidenceService } from './services/evidenceService.js';
import streamRoutes, { initializeStreamService } from './routes/stream.js';
import evidenceRoutes, { initializeEvidenceService } from './routes/evidence.js';
import queueRoutes, { initializeQueueService } from './routes/queue.js';
import crypto from 'crypto';
import { testRunStore } from '../lib/TestRunStore.js';
import fetch from 'node-fetch';
import axios from 'axios';
import os from 'os';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

// 🔥 使用数据库服务替代直接创建PrismaClient
const databaseService = DatabaseService.getInstance({
  enableLogging: process.env.NODE_ENV === 'development',
  logLevel: 'error',
  maxConnections: 10
});
const prisma = databaseService.getClient();

// 🔥 新增：日志收集器
const logFile = path.join(process.cwd(), 'debug-execution.log');
function setupLogCollection() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  // 清空之前的日志
  fs.writeFileSync(logFile, `=== 测试执行日志 ${new Date().toISOString()} ===\n`);
  
  // 拦截console输出
  const appendLog = (level: string, args: unknown[]) => {
    const timestamp = new Date().toISOString();
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');

    fs.promises.appendFile(logFile, `[${timestamp}] ${level}: ${message}
`).catch(logError => {
      originalError('?? ??????:', logError);
    });
  };

  console.log = function(...args) {
    appendLog('LOG', args);
    originalLog(...args);
  };

  console.error = function(...args) {
    appendLog('ERROR', args);
    originalError(...args);
  };

  console.warn = function(...args) {
    appendLog('WARN', args);
    originalWarn(...args);
  };
  
  console.log('📝 日志收集已启用，日志文件:', logFile);
}

// 启用日志收集
setupLogCollection();

// 创建HTTP服务器
const server = createServer(app);

// 初始化WebSocket服务器
const wss = new WebSocketServer({ server });
const wsManager = new WebSocketManager(wss);

// 🔥 全局服务变量声明（将在startServer中初始化）
let mcpClient: PlaywrightMcpClient;
let aiParser: AITestParser;
let screenshotService: ScreenshotService;
let testExecutionService: TestExecutionService;
let suiteExecutionService: SuiteExecutionService;
let queueService: QueueService;
let streamService: StreamService;
let evidenceService: EvidenceService;

// 绑定WebSocket通知到Store
testRunStore.onChange((runId, testRun) => {
  wsManager.sendTestStatus(runId, testRun.status, testRun.error);
  // 如果需要，也可以在这里发送详细的 testRun 对象
  // wsManager.broadcast({ type: 'test_update', payload: testRun });
});


// 自动初始化AI配置
async function ensureAIConfiguration() {
  try {
    // 检查数据库中是否存在 app_settings 配置
    const existingSettings = await prisma.settings.findUnique({
      where: { key: 'app_settings' }
    });

    if (!existingSettings) {
      console.log('⚙️ 数据库中未找到AI配置，正在创建默认配置...');

      // 从环境变量构建默认配置
      const defaultSettings = {
        selectedModelId: 'gpt-4o', // 前端使用的模型ID
        apiKey: process.env.OPENROUTER_API_KEY || '',
        temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.3'),
        maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '4000'),
        baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
      };

      if (!defaultSettings.apiKey) {
        console.warn('⚠️ 环境变量 OPENROUTER_API_KEY 未设置，AI功能可能无法正常使用');
      }

      // 保存到数据库
      await prisma.settings.create({
        data: {
          key: 'app_settings',
          value: JSON.stringify(defaultSettings),
          updated_at: new Date()
        }
      });

      console.log('✅ AI配置已自动初始化:', {
        model: defaultSettings.selectedModelId,
        hasApiKey: !!defaultSettings.apiKey,
        temperature: defaultSettings.temperature,
        maxTokens: defaultSettings.maxTokens
      });
    } else {
      console.log('✅ AI配置已存在于数据库中');

      // 验证配置完整性
      try {
        const settings = JSON.parse(existingSettings.value || '{}');
        if (!settings.apiKey) {
          console.warn('⚠️ 数据库中的API Key为空，请通过前端设置页面配置');
        } else {
          console.log(`✅ 当前使用模型: ${settings.selectedModelId || 'default'}`);
        }
      } catch (error) {
        console.error('❌ 解析AI配置失败:', error);
      }
    }
  } catch (error: any) {
    console.error('❌ 初始化AI配置失败:', error.message);
    console.log('💡 AI功能将使用环境变量作为回退配置');
  }
}

// 创建默认系统用户（如果不存在）
async function ensureDefaultUser() {
  try {
    const userCount = await prisma.users.count();

    if (userCount === 0) {
      console.log('🔑 创建默认系统用户...');

      // 创建简单的哈希密码（实际环境应使用bcrypt等）
      const passwordHash = crypto.createHash('sha256').update('system123').digest('hex');

      const defaultUser = await prisma.users.create({
        data: {
          email: 'system@test.local',
          password_hash: passwordHash,
          created_at: new Date()
        }
      });

      console.log(`✅ 默认系统用户已创建: ID=${defaultUser.id}, Email=${defaultUser.email}`);
      
      // 🔥 使用权限服务分配管理员角色
      try {
        await PermissionService.assignDefaultRole(defaultUser.id, 'admin');
        console.log(`✅ 为默认用户分配管理员角色完成`);
      } catch (roleError) {
        console.warn('⚠️ 分配管理员角色失败，将在后续初始化中处理:', roleError);
      }
    } else {
      console.log('✅ 系统中已有用户，无需创建默认用户');
    }
  } catch (error) {
    console.error('❌ 创建默认系统用户失败:', error);
  }
}

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173', 
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://192.168.10.146:5173',
  'http://192.168.10.146:5174',
  'http://192.168.10.146:5175',
  'http://192.168.10.146:5176',
  'http://192.168.10.146:5177',
  'http://192.168.10.146:5178'
];

const corsOptions = {
  origin: function (origin, callback) {
    console.log('🔍 CORS检查 - 请求来源:', origin);
    
    // 允许没有来源的请求 (例如curl, Postman等工具)
    if (!origin) {
      console.log('✅ CORS允许 - 无来源请求');
      return callback(null, true);
    }
    
    // 检查来源是否在白名单中
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('✅ CORS允许 - 白名单匹配:', origin);
      callback(null, true);
    } else {
      // 🔥 增强的局域网IP检测，支持更多网段
      const isLanAccess = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|localhost|127\.0\.0\.1):\d{4,5}$/.test(origin);
      if (isLanAccess) {
        console.log('✅ CORS允许 - 局域网访问:', origin);
        return callback(null, true);
      }
      
      // 🔥 开发环境下允许所有来源（可选，生产环境请移除）
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ CORS允许 - 开发环境:', origin);
        return callback(null, true);
      }
      
      console.log('❌ CORS拒绝 - 未授权来源:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200, // For legacy browser support
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight for all routes

// 🔥 优化：明确配置JSON中间件支持UTF-8编码和合适的大小限制
app.use(express.json({ 
  limit: '10mb',
  type: 'application/json',
  verify: (req, res, buf, encoding) => {
    // 确保接收的数据使用UTF-8编码
    if (encoding !== 'utf8' && encoding !== 'utf-8') {
      const err = new Error('仅支持UTF-8编码的JSON数据');
      (err as any).status = 400;
      throw err;
    }
  }
}));

// 🔥 优化：设置默认字符编码
app.use((req, res, next) => {
  req.setEncoding && req.setEncoding('utf8');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// 🔥 API路由将在startServer函数中注册，因为服务需要先初始化

// 🔥 新增: 报告API路由
app.get('/api/reports/:runId', async (req, res) => {
  try {
    const runId = req.params.runId;
    
    // 先检查是否为测试套件运行ID
    const suiteRun = suiteExecutionService.getSuiteRun(runId);
    
    if (suiteRun) {
      // 尝试从数据库查询报告
      let reportData: any = null;
      
      try {
        reportData = await prisma.reports.findFirst({
          where: {
            run_id: {
              equals: Number(suiteRun.suiteId) // 尝试匹配suite_id
            }
          },
          include: {
            test_runs: true
          }
        });
      } catch (dbError) {
        console.warn('从数据库获取报告数据失败，将使用内存数据:', dbError);
      }
      
      // 无论是否在数据库找到记录，都返回可用的报告数据
      res.json({ 
        success: true, 
        data: {
          generatedAt: new Date(),
          summary: {
            totalCases: suiteRun.totalCases,
            passedCases: suiteRun.passedCases,
            failedCases: suiteRun.failedCases,
            duration: suiteRun.duration || '0s',
            passRate: suiteRun.totalCases > 0 
              ? Math.round((suiteRun.passedCases / suiteRun.totalCases) * 100) 
              : 0,
            status: suiteRun.status
          },
          suiteRun,
          // 如果数据库有数据，附加进来
          dbReport: reportData || null
        }
      });
    } else {
      // 如果不是套件ID，尝试作为单个测试用例处理
      const testRun = testExecutionService.getTestRun(runId);
      
      if (testRun) {
        res.json({
          success: true,
          data: {
            generatedAt: new Date(),
            testRun,
            summary: {
              status: testRun.status,
              duration: testRun.endedAt 
                ? `${Math.round((testRun.endedAt.getTime() - testRun.startedAt.getTime()) / 1000)}s`
                : '进行中...'
            }
          }
        });
      } else {
        res.status(404).json({
          success: false,
          error: '找不到指定的测试报告'
        });
      }
    }
  } catch (error) {
    console.error('获取测试报告失败:', error);
    res.status(500).json({
      success: false,
      error: `获取测试报告失败: ${error.message}`
    });
  }
});

// 🔥 定时清理任务，防止内存泄漏
const setupCleanupTasks = () => {
  // 每小时清理一次已完成的测试记录
  setInterval(() => {
    console.log('🧹 执行定时清理任务...');
    suiteExecutionService.cleanupCompletedSuites(24); // 清理24小时前的记录
    
    // 🔥 可以在这里添加更多清理逻辑
    // testExecutionService.cleanupCompletedTests(24);
  }, 60 * 60 * 1000); // 每小时执行一次
  
  console.log('⏰ 定时清理任务已设置');
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 全局错误处理中间件
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('未处理的错误:', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 🔥 404处理移到了startServer函数中，确保在API路由注册后执行

// Start Server
async function startServer() {
  try {
    // 🔥 连接数据库
    console.log('🗄️ 开始连接数据库...');
    await databaseService.connect();
    console.log('✅ 数据库连接成功');

    // 确保数据库和用户已设置
    await ensureDefaultUser();

    // 🔥 新增：初始化权限角色和功能开关
    console.log('🔧 开始初始化权限角色和功能开关...');
    await PermissionService.ensureDefaultRoles();
    await initializeAllFeatureFlags();
    console.log('✅ 权限角色和功能开关初始化完成');

    // 🔥 新增：自动初始化AI配置
    console.log('🤖 开始检查AI配置...');
    await ensureAIConfiguration();
    console.log('✅ AI配置检查完成');

    // 🔥 初始化所有服务
    console.log('⚙️ 开始初始化所有服务...');
    
    // 🔥 Phase 7: 优化浏览器预安装 - 条件性异步执行
    const shouldPreInstallBrowser = process.env.PLAYWRIGHT_PRE_INSTALL_BROWSER !== 'false';
    if (shouldPreInstallBrowser) {
      console.log('🔧 开始浏览器预安装检查 (后台异步)...');
      // 🚀 Phase 7: 异步执行，不阻塞服务器启动
      PlaywrightMcpClient.ensureBrowserInstalled()
        .then(() => console.log('✅ 浏览器预安装检查完成'))
        .catch((error) => console.warn('⚠️ 浏览器预安装检查失败:', error.message));
    } else {
      console.log('⚡ 跳过浏览器预安装检查 (PLAYWRIGHT_PRE_INSTALL_BROWSER=false)');
    }

    // 初始化Playwright客户端
    console.log('🔧 开始初始化MCP客户端...');
    mcpClient = new PlaywrightMcpClient();
    console.log('✅ MCP客户端初始化完成');

    // 初始化AI解析器（传入MCP客户端）
    console.log('🔧 开始初始化AI解析器...');
    aiParser = new AITestParser(mcpClient);
    console.log('✅ AI解析器初始化完成');

    // 初始化截图服务
    console.log('🔧 开始初始化截图服务...');
    screenshotService = new ScreenshotService(prisma);
    console.log('✅ 截图服务初始化完成');

    // 🔥 初始化新增强服务
    console.log('🔧 开始初始化队列服务...');
    queueService = new QueueService({
      maxConcurrency: 6,
      perUserLimit: 2,
      taskTimeout: 600000, // 10分钟
      retryAttempts: 1
    });
    console.log('✅ 队列服务初始化完成');

    console.log('🔧 开始初始化实时流服务...');
    streamService = new StreamService({
      fps: 2,
      jpegQuality: 60,
      width: 1024,
      height: 768,
      maskSelectors: []
    });
    console.log('✅ 实时流服务初始化完成');

    console.log('🔧 开始初始化证据服务...');
    evidenceService = new EvidenceService(
      prisma,
      path.join(process.cwd(), 'artifacts'),
      process.env.BASE_URL || 'http://localhost:3001'
    );
    console.log('✅ 证据服务初始化完成');

    // 🔥 初始化测试执行服务（使用数据库服务和新增强服务）
    console.log('🔧 开始初始化测试执行服务...');
    testExecutionService = new TestExecutionService(
      wsManager, 
      aiParser, 
      mcpClient, 
      databaseService, 
      screenshotService,
      queueService,
      streamService,
      evidenceService
    );
    console.log('✅ 测试执行服务初始化完成');

    // 🔥 初始化套件执行服务（使用数据库服务）
    console.log('🔧 开始初始化套件执行服务...');
    suiteExecutionService = new SuiteExecutionService(wsManager, testExecutionService, databaseService);
    console.log('✅ 套件执行服务初始化完成');

    console.log('✅ 所有服务初始化完成');

    // 🔥 注册API路由（现在服务已经初始化完成）
    console.log('🔧 开始注册API路由...');
    
    // 初始化路由服务
    initializeQueueService(queueService);
    initializeStreamService(streamService);
    initializeEvidenceService(evidenceService);

    // 🔥 创建认证中间件
    const { authenticate } = createAuthMiddleware(prisma);

    // 注册所有路由（需要认证的路由使用认证中间件）
    app.use('/api/tests', authenticate, testRoutes(testExecutionService));
    app.use('/api/suites', authenticate, suiteRoutes(suiteExecutionService));
    app.use('/api', screenshotRoutes(screenshotService));
    app.use('/api/config', configRoutes);
    app.use(streamRoutes);
    app.use(evidenceRoutes);
    app.use(queueRoutes);

    // 🔥 新增：认证路由
    console.log('🔧 注册认证路由...');
    app.use('/api/auth', createAuthRoutes(prisma));

    // 🔥 新增：用户管理路由
    console.log('🔧 注册用户管理路由...');
    app.use('/api/users', createUserRoutes(prisma));

    // 🔥 新增：AI批量更新相关路由
    console.log('🔧 注册AI批量更新路由...');
    app.use('/api/v1/ai-bulk', createAiBulkUpdateRoutes(prisma, aiParser, wsManager));
    app.use('/api/testcases', createVersionRoutes(prisma));

    // 🔥 新增：功能开关管理路由
    console.log('🔧 注册功能开关管理路由...');
    app.use('/api/v1/feature-flags', createFeatureFlagRoutes());
    app.use('/api/v1/features', createPublicFeatureFlagRoutes());

    // 🔥 新增：安全监控路由
    console.log('🔧 注册安全监控路由...');
    app.use('/api/v1/security', createSecurityRoutes());

    // 🔥 新增：Dashboard统计路由
    console.log('🔧 注册Dashboard统计路由...');
    app.use('/api/dashboard', authenticate, createDashboardRoutes(prisma));

    // 🔥 新增：Reports测试报告路由
    console.log('🔧 注册Reports测试报告路由...');
    app.use('/api/reports', authenticate, createReportsRoutes(prisma));

    // 🔥 新增：功能测试用例相关路由
    console.log('🔧 注册功能测试用例相关路由...');
    app.use('/api/v1/axure', authenticate, createAxureRoutes());
    app.use('/api/v1/functional-test-cases', authenticate, createFunctionalTestCaseRoutes());

    // 🔥 新增：系统字典管理路由
    console.log('🔧 注册系统字典管理路由...');
    app.use('/api/v1/systems', authenticate, systemsRouter);

    // 🔥 新增：知识库管理路由（移除认证，允许公开搜索）
    console.log('🔧 注册知识库管理路由...');
    app.use('/api/v1/knowledge', knowledgeRouter);

    console.log('✅ API路由注册完成');

    // 🔥 在所有API路由注册完成后，注册catch-all 404处理
    app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: '接口不存在'
      });
    });
    console.log('✅ 404处理路由已注册');

    // 🔥 新增：初始化配置数据
    try {
      const { initializeConfig } = await import('../scripts/init-config.js');
      await initializeConfig();
    } catch (configError) {
      console.warn('⚠️ 配置初始化失败，将使用默认配置:', configError);
    }

    // 设置定时清理任务
    console.log('🔧 准备设置定时清理任务...');
    setupCleanupTasks();
    console.log('✅ 定时清理任务设置完成');

    console.log('🔧 准备启动HTTP服务器...');
    server.listen(PORT, () => {
      console.log('✅ HTTP服务器监听回调被调用');
      logServerInfo();
    });
    console.log('🔧 server.listen() 调用完成');
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    
    // 清理已初始化的资源
    try {
      await databaseService.disconnect();
    } catch (cleanupError) {
      console.error('❌ 清理资源时出错:', cleanupError);
    }
    
    process.exit(1);
  }
}

async function logServerInfo() {
  console.log('✅ 服务器已启动');

  // 获取内外网IP地址
  const networkInterfaces = os.networkInterfaces();
  let localIp = '';
  for (const name of Object.keys(networkInterfaces)) {
    const netInterface = networkInterfaces[name];
    if (netInterface) {
      for (const net of netInterface) {
        // 跳过非IPv4和内部地址
        if (net.family === 'IPv4' && !net.internal) {
          localIp = net.address;
          break;
        }
      }
    }
    if (localIp) break;
  }

  try {
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 3000 });
    const publicIp = response.data.ip;
    console.log('-------------------------------------------------');
    console.log(`🚀 服务正在运行:`);
    console.log(`   - 本地访问: http://localhost:${PORT}`);
    if (localIp) {
      console.log(`   - 内网访问: http://${localIp}:${PORT}`);
    }
    console.log(`   - 公网访问: http://${publicIp}:${PORT}`);
    console.log('-------------------------------------------------');
  } catch (error) {
    console.log('-------------------------------------------------');
    console.log(`🚀 服务正在运行:`);
    console.log(`   - 本地访问: http://localhost:${PORT}`);
    if (localIp) {
      console.log(`   - 内网访问: http://${localIp}:${PORT}`);
    }
    console.log('   - 公网IP: 获取失败 (网络连接问题)');
    console.log('-------------------------------------------------');
  }
}

console.log('🚀 准备调用startServer()函数...');
startServer();

// 🔥 优雅关闭服务器
process.on('SIGINT', async () => {
  console.log('🔌 正在关闭服务器...');
  
  try {
    // 关闭WebSocket连接
    wsManager.shutdown();
    
    // 关闭数据库连接
    console.log('🗄️ 正在关闭数据库连接...');
    await databaseService.disconnect();
    
    // 清理TestRunStore资源
    console.log('🧹 正在清理TestRunStore资源...');
    testRunStore.destroy();
    
    // 关闭HTTP服务器
    server.close(() => {
      console.log('✅ 服务器已完全关闭');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ 关闭服务器时出错:', error);
    process.exit(1);
  }
});

// 处理其他退出信号
process.on('SIGTERM', async () => {
  console.log('📨 收到SIGTERM信号，优雅关闭...');
  process.emit('SIGINT' as any);
});

export default app; 
// Load environment variables first (must be before other imports)
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file (from project root)
const envPath = join(__dirname, '../.env');
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.warn('Failed to load .env file:', envResult.error.message);
  console.warn('   Attempted path:', envPath);
} else {
  console.log('Environment variables loaded from .env file');
  // Verify critical environment variables
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not found in .env file');
  } else {
    // Hide sensitive information, only show the prefix of the connection string
    const dbUrl = process.env.DATABASE_URL;
    const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
    console.log('   DATABASE_URL:', maskedUrl);
  }
}

import express from 'express';
import cors from 'cors';
import path from 'path';
import { TestExecutionService } from './services/testExecution.js';
import { SuiteExecutionService } from './services/suiteExecution.js';
import { WebSocketManager, setGlobalWsManager } from './services/websocket.js';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { testRoutes } from './routes/test.js';
import { suiteRoutes } from './routes/suite.js'; // Added
import { screenshotRoutes } from './routes/screenshots.js';
import { configRoutes } from './routes/config.js';
// Added: AI bulk update related routes
import { createAiBulkUpdateRoutes, createVersionRoutes } from './routes/aiBulkUpdate.js';
import { createFeatureFlagRoutes, createPublicFeatureFlagRoutes } from './routes/featureFlag.js';
import { createSecurityRoutes } from './routes/security.js';
// Added: Authentication related routes
import { createAuthRoutes } from './routes/auth.js';
import { createUserRoutes } from './routes/users.js';
import { createAuthMiddleware } from './middleware/authMiddleware.js';
// Added: Dashboard statistics routes
import { createDashboardRoutes } from './routes/dashboard.js';
// Added: Reports test report routes
import { createReportsRoutes } from './routes/reports.js';
// Added: Functional test case related routes
import { createAxureRoutes } from './routes/axure.js';
import { createFunctionalTestCaseRoutes } from './routes/functionalTestCase.js';
// Requirement document management routes
import { createRequirementDocRoutes } from './routes/requirementDoc.js';
// Added: System dictionary management routes
import systemsRouter from './routes/systems.js';
// Added: Account configuration routes
import accountsRouter from './routes/accounts.js';
// Added: Server configuration routes
import serversRouter from './routes/servers.js';
// Added: Database configuration routes
import databasesRouter from './routes/databases.js';
// Added: Knowledge base management routes
import knowledgeRouter from './routes/knowledge.js';
// Test configuration management routes
import testConfigRouter from './routes/testConfig.js';
// Added: Test plan management routes
import createTestPlanRoutes from './routes/testPlan.js';
// Added: Initialize feature flags and permissions
import { initializeAllFeatureFlags } from './middleware/featureFlag.js';
import { PermissionService } from './middleware/auth.js';
import { AITestParser } from './services/aiParser.js';
import { aiCacheManager } from './services/aiCacheManager.js'; // Added: AI cache manager
import { PlaywrightMcpClient } from './services/mcpClient.js';
import { ScreenshotService } from './services/screenshotService.js';
import { PrismaClient } from '../src/generated/prisma/index.js';
import { DatabaseService } from './services/databaseService.js';
import { modelRegistry } from '../src/services/modelRegistry.js';
import { QueueService } from './services/queueService.js';
import { StreamService } from './services/streamService.js';
import { EvidenceService } from './services/evidenceService.js';
import streamRoutes, { initializeStreamService } from './routes/stream.js';
import evidenceRoutes, { initializeEvidenceService } from './routes/evidence.js';
import queueRoutes, { initializeQueueService } from './routes/queue.js';
// crypto removed, no longer needed (password encryption changed to bcrypt)
import { testRunStore } from '../lib/TestRunStore.js';
import fetch from 'node-fetch';
import axios from 'axios';
import os from 'os';
import fs from 'fs';
import { getNow } from './utils/timezone.js';
import { ModelPricingService } from './services/modelPricingService.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Fix: BigInt serialization support (must be before all routes)
// Prisma uses BigInt type, but JSON.stringify does not support BigInt
// This causes other fields like dates to fail to serialize correctly
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// Deferred initialization of database service (initialized in startServer)
let databaseService: DatabaseService;
let prisma: PrismaClient;

// Added: Log collector
const logFile = path.join(process.cwd(), '/logs/debug-execution.log');

// Format time to local time (YYYY-MM-DD HH:mm:ss.SSS)
function formatLocalTime(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function setupLogCollection() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  // Clear previous logs
  fs.writeFileSync(logFile, `=== Test Execution Log ${formatLocalTime()} ===\n`);

  // Intercept console output
  const appendLog = (level: string, args: unknown[]) => {
    const timestamp = formatLocalTime();
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');

    fs.promises.appendFile(logFile, `[${timestamp}] ${level}: ${message}
`).catch(logError => {
      originalError('Log write failed:', logError);
    });
  };

  console.log = function (...args) {
    appendLog('LOG', args);
    originalLog(...args);
  };

  console.error = function (...args) {
    appendLog('ERROR', args);
    originalError(...args);
  };

  console.warn = function (...args) {
    appendLog('WARN', args);
    originalWarn(...args);
  };

  console.log('Log collection enabled, log file:', logFile);
}

// Enable log collection
setupLogCollection();

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ server });
const wsManager = new WebSocketManager(wss);

// Set global WebSocketManager so other modules (like testPlanService) can use it
setGlobalWsManager(wsManager);

// Global service variable declarations (will be initialized in startServer)
let mcpClient: PlaywrightMcpClient;
let aiParser: AITestParser;
let screenshotService: ScreenshotService;
let testExecutionService: TestExecutionService;
let suiteExecutionService: SuiteExecutionService;
let queueService: QueueService;
let streamService: StreamService;
let evidenceService: EvidenceService;

// Bind WebSocket notifications to Store
testRunStore.onChange((runId, testRun) => {
  wsManager.sendTestStatus(runId, testRun.status, testRun.error);
  // If needed, the detailed testRun object can also be sent here
  // wsManager.broadcast({ type: 'test_update', payload: testRun });
});


// Automatically initialize AI configuration
async function ensureAIConfiguration() {
  try {
    // Ensure prisma is initialized
    if (!prisma) {
      throw new Error('Prisma client not initialized');
    }

    // Check if app_settings configuration exists in the database
    const existingSettings = await prisma.settings.findUnique({
      where: { key: 'app_settings' }
    });

    if (!existingSettings) {
      console.log('AI configuration not found in database, creating default configuration...');

      // Build default configuration from environment variables (using correct llm nested format)
      // Get the default model's baseUrl
      const defaultModelId = 'deepseek-series';
      const defaultModel = modelRegistry.getModelById(defaultModelId);
      const defaultBaseUrl = defaultModel?.customBaseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

      const defaultSettings = {
        llm: {
          selectedModelId: defaultModelId, // Model ID used by frontend
          apiKey: process.env.OPENROUTER_API_KEY || '',
          baseUrl: defaultBaseUrl, // Add baseUrl
          customConfig: {
            temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.3'),
            maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '2000')
          }
        },
        system: {
          timeout: 300,
          maxConcurrency: 10,
          logRetentionDays: 90
        }
      };

      if (!defaultSettings.llm.apiKey) {
        console.warn('Environment variable OPENROUTER_API_KEY is not set, AI features may not work properly');
      }

      // Save to database
      await prisma.settings.create({
        data: {
          key: 'app_settings',
          value: JSON.stringify(defaultSettings),
          updated_at: getNow()
        }
      });

      console.log('AI configuration automatically initialized:', {
        model: defaultSettings.llm.selectedModelId,
        hasApiKey: !!defaultSettings.llm.apiKey,
        temperature: defaultSettings.llm.customConfig.temperature,
        maxTokens: defaultSettings.llm.customConfig.maxTokens
      });
    } else {
      console.log('AI configuration already exists in database');

      // Verify configuration integrity and auto-repair placeholder configurations
      try {
        const settings = JSON.parse(existingSettings.value || '{}');
        console.log('Current model configuration:', settings);

        // Check if configuration format is correct (whether there is an llm field)
        if (!settings.llm) {
          console.warn('Configuration format incorrect, missing llm field, migration may be needed');
        } else {
          const envApiKey = process.env.OPENROUTER_API_KEY || '';
          const storedApiKey: string = settings.llm.apiKey || '';
          // Placeholder determination: non-empty but length < 20 and doesn't start with sk- (like "later", "template" residual values)
          const isPlaceholderKey = storedApiKey.length > 0 && storedApiKey.length < 20 && !storedApiKey.startsWith('sk-');

          if (envApiKey && (!storedApiKey || isPlaceholderKey)) {
            console.log('Invalid API Key detected, rebuilding default configuration from environment variables...');
            const repairModelId = 'deepseek-series';
            const repairModel = modelRegistry.getModelById(repairModelId);
            const repairBaseUrl = repairModel?.customBaseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
            const repairedSettings = {
              llm: {
                selectedModelId: repairModelId,
                apiKey: envApiKey,
                baseUrl: repairBaseUrl,
                customConfig: {
                  temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.3'),
                  maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '4000')
                }
              },
              system: settings.system || { timeout: 300, maxConcurrency: 10, logRetentionDays: 90 }
            };
            await prisma.settings.update({
              where: { key: 'app_settings' },
              data: { value: JSON.stringify(repairedSettings), updated_at: getNow() }
            });
            console.log(`Configuration auto-repaired: model=${repairModelId}, baseUrl=${repairBaseUrl}`);
          } else if (!storedApiKey) {
            console.warn('API Key in database is empty, please configure via frontend settings page');
          } else {
            console.log(`Currently used model: ${settings.llm.selectedModelId || 'default'}`);
          }
        }
      } catch (error) {
        console.error('Failed to parse AI configuration:', error);
      }
    }
  } catch (error: any) {
    console.error('Failed to initialize AI configuration:', error.message);
    console.log('AI features will use environment variables as fallback configuration');
  }
}

// Create default system user (if not exists)
async function ensureDefaultUser() {
  try {
    // Ensure prisma is initialized
    if (!prisma) {
      throw new Error('Prisma client not initialized');
    }

    // Improvement: Determine based on username, not total user count
    const adminUser = await prisma.users.findUnique({
      where: { username: 'admin' }
    });

    if (!adminUser) {
      console.log('Creating default system user...');

      // Fix: Use bcrypt to encrypt password (consistent with login verification)
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.default.hash('admin', 10);

      const defaultUser = await prisma.users.create({
        data: {
          email: 'admin@test.local',
          username: 'admin',
          password_hash: passwordHash,
          account_name: 'System Administrator',
          is_super_admin: true,
          created_at: getNow()
        }
      });

      console.log(`Default system user created: ID=${defaultUser.id}, Email=${defaultUser.email}`);
      console.log(`   Username: admin`);
      console.log(`   Password: admin`);

      // Assign admin role using permission service
      try {
        await PermissionService.assignDefaultRole(defaultUser.id, 'admin');
        console.log(`Admin role assigned to default user`);
      } catch (roleError) {
        console.warn('Failed to assign admin role, will be handled in subsequent initialization:', roleError);
      }
    } else {
      console.log('Default admin user already exists, no need to create');

      // Check and fix password hashes of existing users (if using older SHA256)
      await fixExistingUserPasswords();
    }
  } catch (error) {
    console.error('Failed to create default system user:', error);
  }
}

// Added: Fix password hashes of existing users (migrate from SHA256 to bcrypt)
async function fixExistingUserPasswords() {
  try {
    const bcrypt = await import('bcrypt');

    // Find all users
    const users = await prisma.users.findMany({
      select: { id: true, username: true, password_hash: true }
    });

    for (const user of users) {
      // Check password hash format: bcrypt hashes start with $2a$, $2b$, $2y$ and have length 60
      const isBcryptHash = user.password_hash.startsWith('$2') && user.password_hash.length === 60;

      if (!isBcryptHash) {
        console.log(`Detected user "${user.username}" using old password hash, updating to bcrypt...`);

        // If default user (admin or system), update password directly
        // Otherwise require user to reset password (we only handle default users here)
        if (user.username === 'admin' || user.username === 'system') {
          const newPasswordHash = await bcrypt.default.hash('admin', 10);
          await prisma.users.update({
            where: { id: user.id },
            data: { password_hash: newPasswordHash }
          });
          console.log(`Password for user "${user.username}" updated to bcrypt hash`);
        } else {
          console.warn(`User "${user.username}" using old password hash, please manually reset password`);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to fix user password hashes:', error);
  }
}

// Middleware
// Read frontend port from environment variable, support multiple ports
const frontendPort = process.env.VITE_PORT || '5173';
const frontendPorts = [frontendPort, '5174', '5175', '5176', '5177', '5178'];
const allowedOrigins = [
  'http://localhost:3000',
  ...frontendPorts.map(port => `http://localhost:${port}`),
  'http://192.168.10.146:5173',
  'http://192.168.10.146:5174',
  'http://192.168.10.146:5175',
  'http://192.168.10.146:5176',
  'http://192.168.10.146:5177',
  'http://192.168.10.146:5178'
];

const corsOptions = {
  origin: function (origin, callback) {
    console.log('CORS Check - Request origin:', origin);

    // Allow requests with no origin (e.g. tools like curl, Postman)
    if (!origin) {
      console.log('CORS Allowed - Request without origin');
      return callback(null, true);
    }

    // Check if origin is in whitelist
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('CORS Allowed - Whitelist match:', origin);
      callback(null, true);
    } else {
      // Enhanced LAN IP detection, supports more subnets
      const isLanAccess = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|localhost|127\.0\.0\.1):\d{4,5}$/.test(origin);
      if (isLanAccess) {
        console.log('CORS Allowed - LAN access:', origin);
        return callback(null, true);
      }

      // Allow all origins in development environment (optional, remove in production)
      if (process.env.NODE_ENV === 'development') {
        console.log('CORS Allowed - Development environment:', origin);
        return callback(null, true);
      }

      console.log('CORS Denied - Unauthorized origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200, // For legacy browser support
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight for all routes

// Optimization: Explicitly configure JSON middleware to support UTF-8 encoding and proper size limits
app.use(express.json({
  limit: '10mb',
  type: 'application/json',
  verify: (req, res, buf, encoding) => {
    // Ensure received data uses UTF-8 encoding
    if (encoding !== 'utf8' && encoding !== 'utf-8') {
      const err = new Error('Only JSON data with UTF-8 encoding is supported');
      (err as any).status = 400;
      throw err;
    }
  }
}));

// Optimization: Set default character encoding
app.use((req, res, next) => {
  req.setEncoding && req.setEncoding('utf8');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// API routes will be registered in startServer function as services need to be initialized first
// Note: /api/reports/:runId route moved inside startServer function, registered after createReportsRoutes

// Scheduled cleanup tasks to prevent memory leaks
const setupCleanupTasks = () => {
  // Clean up completed test records every hour
  setInterval(() => {
    console.log('Executing scheduled cleanup task...');
    suiteExecutionService.cleanupCompletedSuites(24); // Clean up records from 24 hours ago

    // More cleanup logic can be added here
    // testExecutionService.cleanupCompletedTests(24);
  }, 60 * 60 * 1000); // Execute once every hour

  console.log('Scheduled cleanup tasks set');
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Global error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handling moved to startServer function, ensuring execution after API routes are registered

// Start Server
async function startServer() {
  try {
    // Check DATABASE_URL environment variable
    if (!process.env.DATABASE_URL) {
      console.error('Error: DATABASE_URL environment variable is not set');
      console.error('\nSolution:');
      console.error('   1. Create .env file in the project root directory');
      console.error('   2. Add DATABASE_URL configuration, for example:');
      console.error('      DATABASE_URL="mysql://username:password@localhost:3306/Sakura AI"');
      console.error('\nTip: Refer to docs/CONFIGURATION.md for complete configuration instructions');
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Initialize database service (delayed until after environment variable check)
    console.log('Initializing database service...');
    databaseService = DatabaseService.getInstance({
      enableLogging: process.env.NODE_ENV === 'development',
      logLevel: 'error',
      maxConnections: 10
    });
    prisma = databaseService.getClient();
    console.log('Database service initialized');

    // Connect to database
    console.log('Connecting to database...');
    await databaseService.connect();

    // Ensure database and user are set up
    await ensureDefaultUser();

    // Added: Initialize permission roles and feature flags
    console.log('Initializing permission roles and feature flags...');
    await PermissionService.ensureDefaultRoles();
    await initializeAllFeatureFlags();
    console.log('Permission roles and feature flags initialized');

    // Added: Automatically initialize AI configuration
    console.log('Checking AI configuration...');
    await ensureAIConfiguration();
    console.log('AI configuration check completed');

    // Added: Initialize model pricing service
    console.log('Initializing model pricing service...');
    const pricingService = ModelPricingService.getInstance();
    await pricingService.initialize();
    console.log('Model pricing service initialized');

    // Initialize all services
    console.log('Initializing all services...');

    // Phase 7: Optimize browser pre-installation - conditional asynchronous execution
    const shouldPreInstallBrowser = process.env.PLAYWRIGHT_PRE_INSTALL_BROWSER !== 'false';
    if (shouldPreInstallBrowser) {
      console.log('Starting browser pre-installation check (background async)...');
      // Phase 7: Execute asynchronously, do not block server startup
      PlaywrightMcpClient.ensureBrowserInstalled()
        .then(() => console.log('Browser pre-installation check completed'))
        .catch((error) => console.warn('Browser pre-installation check failed:', error.message));
    } else {
      console.log('Skipping browser pre-installation check (PLAYWRIGHT_PRE_INSTALL_BROWSER=false)');
    }

    // Initialize Playwright client
    console.log('Initializing MCP client...');
    mcpClient = new PlaywrightMcpClient();
    console.log('MCP client initialized');

    // Initialize AI parser (passing MCP client)
    console.log('Initializing AI parser...');
    aiParser = new AITestParser(mcpClient);
    // Register to cache manager
    aiCacheManager.registerParser(aiParser);
    console.log('AI parser initialized');

    // Initialize screenshot service
    console.log('Initializing screenshot service...');
    screenshotService = new ScreenshotService(prisma);
    console.log('Screenshot service initialized');

    // Initialize newly enhanced services
    console.log('Initializing queue service...');
    queueService = new QueueService({
      maxConcurrency: 6,
      perUserLimit: 2,
      taskTimeout: 600000, // 10 minutes
      retryAttempts: 1
    });
    console.log('Queue service initialized');

    console.log('Initializing live stream service...');
    streamService = new StreamService({
      fps: 2,
      jpegQuality: 85,  // Improved quality: increased from 60 to 85, providing clearer images
      width: 1920,       // Improved resolution: increased from 1024 to 1920, supporting HD display
      height: 1080,      // Improved resolution: increased from 768 to 1080, supporting HD display
      maskSelectors: []
    });
    console.log('Live stream service initialized');

    console.log('Initializing evidence service...');
    // Build BASE_URL from environment variable
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    evidenceService = new EvidenceService(
      prisma,
      path.join(process.cwd(), 'artifacts'),
      baseUrl
    );
    console.log('Evidence service initialized');

    // Initialize test execution service (using database service and newly enhanced services)
    console.log('Initializing test execution service...');
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

    // Mount service to global so API routes can access cache statistics
    (global as any).testExecutionService = testExecutionService;

    console.log('Test execution service initialized');

    // Initialize suite execution service (using database service)
    console.log('Initializing suite execution service...');
    suiteExecutionService = new SuiteExecutionService(wsManager, testExecutionService, databaseService);
    console.log('Suite execution service initialized');

    console.log('All services initialized');

    // Register API routes (now that services are fully initialized)
    console.log('Registering API routes...');

    // Initialize routing services
    initializeQueueService(queueService);
    initializeStreamService(streamService);
    initializeEvidenceService(evidenceService);

    // Create authentication middleware
    const { authenticate } = createAuthMiddleware(prisma);

    // Register all routes (routes requiring authentication use auth middleware)
    app.use('/api/tests', authenticate, testRoutes(testExecutionService));
    app.use('/api/suites', authenticate, suiteRoutes(suiteExecutionService));
    app.use('/api', screenshotRoutes(screenshotService));
    app.use('/api/config', configRoutes);
    app.use(streamRoutes);
    app.use(evidenceRoutes);
    app.use(queueRoutes);

    // Added: Authentication routes
    console.log('Registering authentication routes...');
    app.use('/api/auth', createAuthRoutes(prisma));

    // Added: User management routes
    console.log('Registering user management routes...');
    app.use('/api/users', createUserRoutes(prisma));

    // Added: AI bulk update related routes
    console.log('Registering AI bulk update routes...');
    app.use('/api/v1/ai-bulk', createAiBulkUpdateRoutes(prisma, aiParser, wsManager));
    app.use('/api/testcases', createVersionRoutes(prisma));

    // Added: Feature flag management routes
    console.log('Registering feature flag management routes...');
    app.use('/api/v1/feature-flags', createFeatureFlagRoutes());
    app.use('/api/v1/features', createPublicFeatureFlagRoutes());

    // Added: Security monitoring routes
    console.log('Registering security monitoring routes...');
    app.use('/api/v1/security', createSecurityRoutes());

    // Added: Dashboard statistics routes
    console.log('Registering Dashboard statistics routes...');
    app.use('/api/dashboard', authenticate, createDashboardRoutes(prisma));

    // Added: Reports test report routes
    console.log('Registering Reports test report routes...');
    app.use('/api/reports', authenticate, createReportsRoutes(prisma));

    // Added: Single test report route (must be registered after createReportsRoutes to avoid intercepting other routes)
    // GET /api/reports/:runId - Get report for a single test run or suite
    app.get('/api/reports/:runId', authenticate, async (req, res) => {
      try {
        const runId = req.params.runId;

        // First check if it's a test suite run ID
        const suiteRun = suiteExecutionService.getSuiteRun(runId);

        if (suiteRun) {
          // Attempt to query report from database
          let reportData: any = null;

          try {
            reportData = await prisma.reports.findFirst({
              where: {
                run_id: {
                  equals: Number(suiteRun.suiteId) // Attempt to match suite_id
                }
              },
              include: {
                test_runs: true
              }
            });
          } catch (dbError) {
            console.warn('Failed to fetch report data from database, using in-memory data:', dbError);
          }

          // Return available report data regardless of whether record was found in database
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
              // Append database report if available
              dbReport: reportData || null
            }
          });
        } else {
          // If not a suite ID, attempt to process as a single test case
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
                    : 'In Progress...'
                }
              }
            });
          } else {
            res.status(404).json({
              success: false,
              error: 'Specified test report not found'
            });
          }
        }
      } catch (error: any) {
        console.error('Failed to get test report:', error);
        res.status(500).json({
          success: false,
          error: `Failed to get test report: ${error.message}`
        });
      }
    });

    // Added: Functional test case related routes
    console.log('Registering functional test case related routes...');
    app.use('/api/v1/axure', authenticate, createAxureRoutes());
    app.use('/api/v1/functional-test-cases', authenticate, createFunctionalTestCaseRoutes());

    // Requirement document management routes
    console.log('Registering requirement document management routes...');
    app.use('/api/v1/requirement-docs', authenticate, createRequirementDocRoutes());

    // Added: System dictionary management routes
    console.log('Registering system dictionary management routes...');
    app.use('/api/v1/systems', authenticate, systemsRouter);

    // Added: Account configuration routes
    console.log('Registering account configuration routes...');
    app.use('/api/v1/accounts', authenticate, accountsRouter);

    // Added: Server configuration routes
    console.log('Registering server configuration routes...');
    app.use('/api/v1/servers', authenticate, serversRouter);

    // Added: Database configuration routes
    console.log('Registering database configuration routes...');
    app.use('/api/v1/databases', authenticate, databasesRouter);

    // Test configuration management routes
    console.log('Registering test configuration management routes...');
    app.use('/api/v1/test-config', authenticate, testConfigRouter);

    // Added: Knowledge base management routes (authentication removed, allowing public search)
    console.log('Registering knowledge base management routes...');
    app.use('/api/v1/knowledge', knowledgeRouter);

    // Added: Test plan management routes
    console.log('Registering test plan management routes...');
    app.use('/api/v1/test-plans', authenticate, createTestPlanRoutes(testExecutionService));

    // Added: Midscene report routes
    console.log('Registering Midscene report routes...');
    const midsceneReportRouter = (await import('./routes/midsceneReport.js')).default;
    app.use('/api/midscene-report', midsceneReportRouter);

    console.log('API routes registration complete');

    // Production environment: serve frontend static files (after API routes, before 404)
    const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync('/.dockerenv');
    if (isProduction) {
      const distPath = path.join(__dirname, '../dist');
      if (fs.existsSync(distPath)) {
        console.log('Configuring static file service...');
        app.use(express.static(distPath));

        // SPA fallback: Return index.html for all non-API requests
        app.get('*', (req, res, next) => {
          // Skip API requests
          if (req.path.startsWith('/api/')) {
            return next();
          }
          res.sendFile(path.join(distPath, 'index.html'));
        });
        console.log('Static file service configured (Production mode)');
      } else {
        console.warn('dist directory not found, skipping static file service');
      }
    } else {
      console.log('Development mode, static files served by Vite');
    }

    // Register catch-all 404 handler after all API routes are registered
    app.use('/api/*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Interface does not exist'
      });
    });
    console.log('404 handler route registered');

    // Added: Initialize configuration data
    try {
      const { initializeConfig } = await import('../scripts/init-config.js');
      await initializeConfig();
    } catch (configError) {
      console.warn('Configuration initialization failed, using default configuration:', configError);
    }

    // Set scheduled cleanup tasks
    console.log('Preparing to set scheduled cleanup tasks...');
    setupCleanupTasks();
    console.log('Scheduled cleanup tasks set up complete');

    console.log('Preparing to start HTTP server...');
    // Improvement: Listen on all network interfaces (0.0.0.0), allow access from LAN and link-local addresses
    // If only local access is needed, can be restricted via environment variable SERVER_HOST=127.0.0.1
    const host = process.env.SERVER_HOST || '0.0.0.0';
    const portNumber = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;

    // Add port in use error handling
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${portNumber} is already in use`);
        console.error('\nSolution:');
        console.error('   1. Stop other processes using this port');
        console.error('   2. Or modify the PORT configuration in the .env file');
        console.error('   3. Use command to find occupying process: netstat -ano | findstr :' + portNumber);
        process.exit(1);
      } else {
        console.error('Server startup error:', error);
        process.exit(1);
      }
    });

    server.listen(portNumber, host, () => {
      console.log('HTTP server listening callback invoked');
      if (host === '0.0.0.0') {
        console.log('   Server listening on all network interfaces, accessible from LAN');
      } else {
        console.log(`   Server listening only on ${host}, local access only`);
      }
      logServerInfo();
    });
    console.log('server.listen() call completed');
  } catch (error) {
    console.error('Server startup failed:', error);

    // Clean up initialized resources
    try {
      await databaseService.disconnect();
    } catch (cleanupError) {
      console.error('Error during resource cleanup:', cleanupError);
    }

    process.exit(1);
  }
}

async function logServerInfo() {
  console.log('Server has started');

  // Improvement: Get all available network addresses (consistent with Vite behavior)
  const networkInterfaces = os.networkInterfaces();
  const networkIps: string[] = [];

  for (const name of Object.keys(networkInterfaces)) {
    const netInterface = networkInterfaces[name];
    if (netInterface) {
      for (const net of netInterface) {
        // Skip non-IPv4 and internal addresses (127.0.0.1)
        // But keep link-local addresses (169.254.x.x) and LAN addresses
        if (net.family === 'IPv4' && !net.internal) {
          const ip = net.address;
          // Exclude loopback addresses
          if (ip !== '127.0.0.1' && ip !== '::1') {
            networkIps.push(ip);
          }
        }
      }
    }
  }

  // Deduplicate and sort: Prioritize showing LAN addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  const uniqueIps = Array.from(new Set(networkIps));
  const sortedIps = uniqueIps.sort((a, b) => {
    // Prioritize LAN addresses
    const isLanA = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(a);
    const isLanB = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(b);
    if (isLanA && !isLanB) return -1;
    if (!isLanA && isLanB) return 1;
    return 0;
  });

  // Improvement: Attempt multiple public IP services to increase success rate
  const publicIpServices = [
    { url: 'https://api.ipify.org?format=json', timeout: 5000 },
    { url: 'https://api64.ipify.org?format=json', timeout: 5000 },
    { url: 'https://ifconfig.me/ip', timeout: 5000, isPlainText: true },
    { url: 'https://icanhazip.com', timeout: 5000, isPlainText: true },
    { url: 'https://checkip.amazonaws.com', timeout: 5000, isPlainText: true }
  ];

  let publicIp: string | null = null;
  let lastError: Error | null = null;

  // Attempt each service sequentially
  for (const service of publicIpServices) {
    try {
      if (service.isPlainText) {
        // Plain text response
        const response = await axios.get(service.url, {
          timeout: service.timeout,
          responseType: 'text',
          validateStatus: (status) => status === 200
        });
        publicIp = response.data.trim();
      } else {
        // JSON response
        const response = await axios.get(service.url, {
          timeout: service.timeout,
          validateStatus: (status) => status === 200
        });
        publicIp = response.data.ip || response.data.query || response.data;
      }

      if (publicIp && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(publicIp)) {
        // Verify IP format is correct
        break;
      } else {
        publicIp = null;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Continue to try the next service
      continue;
    }
  }

  // Output server information
  console.log('-------------------------------------------------');
  console.log(`Service is running:`);
  console.log(`   - Local access: http://localhost:${PORT}`);

  // Show all available network addresses (consistent with Vite behavior)
  if (sortedIps.length > 0) {
    // Separate LAN addresses and link-local addresses
    const lanIps = sortedIps.filter(ip => /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(ip));
    const linkLocalIps = sortedIps.filter(ip => /^169\.254\./.test(ip));

    if (lanIps.length > 0) {
      if (lanIps.length === 1) {
        console.log(`   - Network access: http://${lanIps[0]}:${PORT} (Recommended)`);
      } else {
        console.log(`   - Network access (Recommended):`);
        lanIps.forEach(ip => {
          console.log(`     • http://${ip}:${PORT}`);
        });
      }
    }

    if (linkLocalIps.length > 0) {
      console.log(`   - Link-local address (Only available on the same link):`);
      linkLocalIps.forEach(ip => {
        console.log(`     • http://${ip}:${PORT}`);
      });
    }
  }

  if (publicIp) {
    console.log(`   - Public access: http://${publicIp}:${PORT}`);
  } else {
    console.log('   - Public IP: Unable to retrieve');
    if (lastError) {
      console.log(`   - Reason: ${lastError.message || 'Network connection issue'}`);
    }
    console.log('   - Tip: If the server is behind a NAT/firewall, port forwarding may be required');
  }
  console.log('-------------------------------------------------');
}

console.log('Preparing to call startServer() function...');
startServer();

// Graceful server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');

  try {
    // Close WebSocket connection
    wsManager.shutdown();

    // Close database connection
    console.log('Closing database connection...');
    await databaseService.disconnect();

    // Clean up TestRunStore resources
    console.log('Cleaning up TestRunStore resources...');
    testRunStore.destroy();

    // Close HTTP server
    server.close(() => {
      console.log('Server fully shut down');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error shutting down server:', error);
    process.exit(1);
  }
});

// Handle other termination signals
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received, graceful shutdown...');
  process.emit('SIGINT' as any);
});

export default app;
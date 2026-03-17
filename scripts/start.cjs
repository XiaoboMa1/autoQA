#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const os = require('os');

const execPromise = promisify(exec);

// Load environment variables (Passed via docker-compose in Docker environment, .env file not required)
try {
  const dotenv = require('dotenv');
  const envPath = path.join(__dirname, '..', '.env');

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('[SUCCESS] Loaded .env file');
  } else {
    console.log('[INFO] .env file not found, using environment variables or default configuration');
  }
} catch (error) {
  console.log('[INFO] Using environment variables or default configuration');
}

// Read configuration from environment variables, provide default values
const BACKEND_PORT = parseInt(process.env.PORT || '3001', 10);
const FRONTEND_PORT = parseInt(process.env.VITE_PORT || '5173', 10);
const SERVER_HOST = process.env.SERVER_HOST || '0.0.0.0';

// Windows compatibility: Detect npm and npx commands
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

console.log('\n[START] Startup Script');
console.log('====================\n');

// Check if dependencies are installed
function checkDependencies() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const nodeModulesPath = path.join(__dirname, '..', 'node_modules');

  if (!fs.existsSync(nodeModulesPath)) {
    console.log('   [GEAR] Installing dependencies (this may take a few minutes)...');
    return new Promise((resolve, reject) => {
      const install = spawn(npmCmd, ['install'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        shell: process.platform === 'win32'
      });

      install.on('close', (code) => {
        if (code === 0) {
          // Dependency installation completed, resolve silently
          resolve();
        } else {
          // Provide generic error prompts and solutions
          console.error('\n[ERROR] Dependency installation failed');
          console.error('\n[LIST] If the error is related to sqlite3 compilation, try the following solutions:');
          console.error('\n   Solution 1 (Recommended): Install Visual Studio Build Tools');
          console.error('   - Download URL: https://visualstudio.microsoft.com/downloads/');
          console.error('   - Select "Build Tools for Visual Studio"');
          console.error('   - Check the "Desktop development with C++" workload during installation');
          console.error('   - Rerun this script after installation is complete');
          console.error('\n   Solution 2: Try using pre-compiled version (skip compilation)');
          console.error('   - Run: npm install --ignore-scripts');
          console.error('   - Then run: npm install sqlite3 --build-from-source=false');
          console.error('   - If there are still issues, you can temporarily skip: npm install --ignore-scripts');
          console.error('\n   Solution 3: If the project uses MySQL, sqlite3 might be an optional dependency');
          console.error('   - You can try: npm install --ignore-scripts');
          console.error('   - Then manually install other dependencies');
          console.error('\n[TIP] The project is currently configured to use MySQL, sqlite3 might be an optional dependency');
          console.error('   If SQLite is not needed, you can temporarily skip sqlite3 installation');
          reject(new Error('Dependency installation failed, please check the error message and solutions above'));
        }
      });

      install.on('error', (error) => {
        reject(error);
      });
    });
  }
  return Promise.resolve();
}

// Wait for database to be ready
async function waitForDatabase() {
  // Check if waiting for database is needed (Docker environment or remote database configured)
  const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === 'true';
  const dbUrl = process.env.DATABASE_URL || '';

  // If not in Docker environment and database is local localhost, skip waiting
  // if (!isDocker && dbUrl.includes('localhost')) {
  //   return;
  // }

  const maxRetries = 30;
  const retryInterval = 10000; // 10 seconds
  let retryCount = 0;

  // Parse database connection information from environment variable
  const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);

  if (!match) {
    console.log('   [WARNING] Cannot parse DATABASE_URL, skipping database connection check');
    await new Promise(resolve => setTimeout(resolve, 5000));
    return;
  }

  const [, user, password, host, port, database] = match;

  console.log(`   [LINK] Connection target: ${user}:${password}@${host}:${port}/${database}`);

  while (retryCount < maxRetries) {
    try {
      // Use Node.js mysql2 package to test connection (Cross-platform, does not rely on system tools)
      const mysql = require('mysql2/promise');
      const connection = await mysql.createConnection({
        host: host,
        port: parseInt(port),
        user: user,
        password: password,
        connectTimeout: 5000
      });

      // Test connection
      await connection.ping();
      await connection.end();

      console.log(`   [SUCCESS] Database is ready (Attempt ${retryCount + 1}/${maxRetries})`);
      return;
    } catch (error) {
      retryCount++;
      if (retryCount < maxRetries) {
        process.stdout.write(`\r   [WAIT] Waiting for database to start... (${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      } else {
        console.log(`\n   [ERROR] Database connection failed, cannot start application`);
        console.log(`   [TIP] Connection info: ${user}@${host}:${port}`);
        console.log(`   [TIP] Please check:`);
        console.log(`      1. Is the database service running normally`);
        console.log(`      2. Is the network connection normal`);
        console.log(`      3. Is the DATABASE_URL configured correctly`);
        console.log(`      4. Are the username and password correct`);
        if (isDocker) {
          console.log(`      5. Docker container status: docker compose ps`);
          console.log(`      6. Database logs: docker compose logs mysql`);
        }
        console.log(`   [TIP] Error details: ${error.message}`);
        process.exit(1);
      }
    }
  }
}

// Run database migrations
async function runDatabaseMigrations() {
  try {
    return new Promise((resolve, reject) => {
      console.log('   [GEAR] Checking database migration status...');

      // Check for standard migration directory (timestamp format)
      const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');
      let hasStandardMigrations = false;

      try {
        const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
        // Find directories in timestamp format (e.g., 20240101000000_init)
        hasStandardMigrations = entries.some(entry =>
          entry.isDirectory() && /^\d{14}_/.test(entry.name)
        );
      } catch (error) {
        console.log('   [INFO] Migration directory does not exist, skipping migration');
        resolve();
        return;
      }

      if (hasStandardMigrations) {
        // Standard migrations exist, use migrate deploy (idempotent, safe)
        console.log('   [BOX] Standard migration files found, executing migrate deploy...');

        // Support retries in Docker environment
        const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === 'true';
        const maxRetries = isDocker ? 3 : 1;
        let retryCount = 0;

        const attemptMigration = () => {
          const migrateDeploy = spawn(npxCmd, ['prisma', 'migrate', 'deploy'], {
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit',
            shell: process.platform === 'win32'
          });

          migrateDeploy.on('close', (code) => {
            if (code === 0) {
              console.log('   [SUCCESS] Database migration completed');
              // Check if database is in sync with schema after successful migration
              checkDatabaseSync(resolve);
            } else {
              retryCount++;
              if (retryCount < maxRetries) {
                console.log(`   [WARNING] Migration failed (Exit code: ${code}), retrying in 3 seconds... (${retryCount}/${maxRetries})`);
                setTimeout(attemptMigration, 3000);
              } else {
                console.log(`   [WARNING] Migration failed (Exit code: ${code}), attempting repair with db push...`);
                executeDbPushForRepair(resolve);
              }
            }
          });

          migrateDeploy.on('error', (error) => {
            retryCount++;
            if (retryCount < maxRetries) {
              console.warn('   [WARNING] Migration execution error:', error.message);
              console.log(`   [RETRY] Retrying in 3 seconds... (${retryCount}/${maxRetries})`);
              setTimeout(attemptMigration, 3000);
            } else {
              console.warn('   [WARNING] Migration execution error:', error.message);
              console.log('   [RETRY] Attempting to repair database structure using db push...');
              executeDbPushForRepair(resolve);
            }
          });
        };

        attemptMigration();
      } else {
        // No standard migrations, skip (avoid using db push)
        console.log('   [INFO] No standard migration files found, skipping database migration');
        console.log('   [TIP] To initialize database, manually execute: npx prisma db push');
        console.log('   [TIP] Or create standard migration: npx prisma migrate dev --name init');
        resolve();
      }
    });
  } catch (error) {
    console.warn('[WARNING] Database migration check exception, but continuing startup:', error.message);
    resolve();
  }
}

// Check if database is in sync with schema
function checkDatabaseSync(resolve) {
  console.log('   [SEARCH] Checking database structure consistency...');

  // Use prisma migrate diff to detect differences
  const migrateDiff = spawn(npxCmd, [
    'prisma', 'migrate', 'diff',
    '--from-schema-datamodel', 'prisma/schema.prisma',
    '--to-schema-datasource', 'prisma/schema.prisma',
    '--exit-code'
  ], {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',  // Use pipe to capture output
    shell: process.platform === 'win32'
  });

  let output = '';
  migrateDiff.stdout?.on('data', (data) => {
    output += data.toString();
  });

  migrateDiff.stderr?.on('data', (data) => {
    output += data.toString();
  });

  migrateDiff.on('close', (code) => {
    if (code === 0) {
      // Exit code 0 means no differences
      console.log('   [SUCCESS] Database structure is consistent, no sync needed');
      resolve();
    } else if (code === 2) {
      // Exit code 2 means differences exist, sync is required
      console.log('   [WARNING] Database structure differences detected, executing sync...');
      console.log('   [TIP] Note: If you see duplicate key errors, you can ignore them (Known Prisma issue)');
      executeDbPushForRepair(resolve);
    } else {
      // Other error codes, handle silently
      console.log('   [INFO] Cannot detect database differences, skipping sync check');
      resolve();
    }
  });

  migrateDiff.on('error', (error) => {
    console.warn('   [WARNING] Difference detection failed:', error.message);
    console.log('   [INFO] Skipping sync check, continuing startup');
    resolve();
  });
}

// Execute db push for database repair (Only when differences are detected or migration fails)
function executeDbPushForRepair(resolve) {
  const dbPush = spawn(npxCmd, ['prisma', 'db', 'push', '--accept-data-loss', '--skip-generate'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  dbPush.on('close', (pushCode) => {
    if (pushCode === 0) {
      console.log('   [SUCCESS] Database structure sync completed');
    } else {
      console.log(`   [WARNING] Database sync failed (Exit code: ${pushCode}), but continuing startup`);
      console.log('   [TIP] This is usually a known Prisma issue (duplicate key error), can be ignored');
      console.log('   [TIP] If the service is running normally, no manual processing is needed');
    }
    // Continue startup regardless of success or failure
    resolve();
  });

  dbPush.on('error', (error) => {
    console.warn('   [WARNING] Database sync error:', error.message, ', but continuing startup');
    // Handle silently, do not block startup
    resolve();
  });
}

// Generate Prisma Client
async function generatePrismaClient() {
  try {
    const prismaClientPath = path.resolve(__dirname, '../src/generated/prisma');

    // Check if Prisma client is already generated
    if (fs.existsSync(prismaClientPath) && fs.existsSync(path.join(prismaClientPath, 'index.js'))) {
      // Already exists, skip silently
      return;
    }

    // Show logs only when generation is needed
    console.log('   [GEAR] Generating Prisma client...');

    // Use npx prisma generate directly to generate client
    return new Promise((resolve, reject) => {
      const prismaGenerate = spawn(npxCmd, ['prisma', 'generate'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        shell: process.platform === 'win32'
      });

      prismaGenerate.on('close', (code) => {
        if (code === 0) {
          // Generation successful, resolve silently
          resolve();
        } else {
          reject(new Error('Prisma client generation failed'));
        }
      });

      prismaGenerate.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error('[ERROR] Prisma client generation failed:', error.message);
    console.error('[TIP] You can manually run "npx prisma generate" to generate the Prisma client');
    process.exit(1);
  }
}

// Install Playwright browsers
async function setup() {
  try {
    // Cross-platform detection: Verify existence of executable files in Playwright cache
    const isWindows = process.platform === 'win32';
    const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === 'true';

    // Docker environment uses fixed path, local environment uses user directory
    const playwrightCachePath = isDocker
      ? '/root/.cache/ms-playwright'
      : (isWindows
        ? path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
        : path.join(os.homedir(), '.cache', 'ms-playwright'));

    console.log(`   [SEARCH] Checking Playwright cache path: ${playwrightCachePath}`);

    if (fs.existsSync(playwrightCachePath)) {
      const cacheContents = fs.readdirSync(playwrightCachePath);
      console.log(`   [DIR] Cache directory contents: ${cacheContents.join(', ')}`);

      // Find any version of chromium directory and verify executable files
      const chromiumDir = cacheContents.find(dir => dir.startsWith('chromium-') && !dir.includes('headless'));
      const headlessDir = cacheContents.find(dir => dir.includes('chromium_headless_shell'));
      const ffmpegDir = cacheContents.find(dir => dir.startsWith('ffmpeg'));

      let chromiumOk = false;
      let headlessOk = false;
      let ffmpegOk = false;

      // Verify chromium executable file (Cross-platform)
      if (chromiumDir) {
        const chromeExe = isWindows ? 'chrome.exe' : 'chrome';
        const chromeSubPath = isWindows ? 'chrome-win' : 'chrome-linux';
        const chromePath = path.join(playwrightCachePath, chromiumDir, chromeSubPath, chromeExe);
        chromiumOk = fs.existsSync(chromePath);
        if (chromiumOk) {
          console.log(`   [BOX] chromium: ${chromiumDir} [OK] (${chromePath})`);
        } else {
          console.log(`   [ERROR] chromium executable does not exist: ${chromePath}`);
        }
      } else {
        console.log(`   [ERROR] chromium directory not found`);
      }

      // Verify headless shell executable file (Cross-platform)
      if (headlessDir) {
        const headlessExe = isWindows ? 'headless_shell.exe' : 'headless_shell';
        const headlessSubPath = isWindows ? 'chrome-win' : 'chrome-linux';
        const headlessPath = path.join(playwrightCachePath, headlessDir, headlessSubPath, headlessExe);
        headlessOk = fs.existsSync(headlessPath);
        if (headlessOk) {
          console.log(`   [BOX] headless_shell: ${headlessDir} [OK] (${headlessPath})`);

          // Verify file permissions (Linux/Docker only)
          if (!isWindows) {
            try {
              const stats = fs.statSync(headlessPath);
              const isExecutable = (stats.mode & 0o111) !== 0;
              if (!isExecutable) {
                console.log(`   [WARNING] headless_shell has no execution permissions, fixing...`);
                fs.chmodSync(headlessPath, 0o755);
                console.log(`   [SUCCESS] Execution permissions set`);
              }
            } catch (err) {
              console.log(`   [WARNING] Cannot check/set permissions: ${err.message}`);
            }
          }
        } else {
          console.log(`   [ERROR] headless_shell executable does not exist: ${headlessPath}`);

          // Try listing directory contents to diagnose issue
          try {
            const headlessDirPath = path.join(playwrightCachePath, headlessDir);
            if (fs.existsSync(headlessDirPath)) {
              console.log(`   [SEARCH] ${headlessDir} directory contents:`);
              const listDir = (dir, prefix = '     ') => {
                const items = fs.readdirSync(dir, { withFileTypes: true });
                items.forEach(item => {
                  const fullPath = path.join(dir, item.name);
                  if (item.isDirectory()) {
                    console.log(`${prefix}[DIR] ${item.name}/`);
                    listDir(fullPath, prefix + '  ');
                  } else {
                    const stats = fs.statSync(fullPath);
                    const size = (stats.size / 1024 / 1024).toFixed(2);
                    console.log(`${prefix}[FILE] ${item.name} (${size} MB)`);
                  }
                });
              };
              listDir(headlessDirPath);
            }
          } catch (err) {
            console.log(`   [WARNING] Cannot list directory: ${err.message}`);
          }
        }
      } else {
        console.log(`   [ERROR] headless_shell directory not found`);
      }

      // Verify ffmpeg executable file (Cross-platform)
      if (ffmpegDir) {
        // Windows and Linux ffmpeg path structures are different
        let ffmpegPath;
        if (isWindows) {
          // Windows: ffmpeg-1011/ffmpeg-win64.exe (Directly in root directory)
          ffmpegPath = path.join(playwrightCachePath, ffmpegDir, 'ffmpeg-win64.exe');
        } else {
          // Linux: ffmpeg-1009/ffmpeg-linux
          ffmpegPath = path.join(playwrightCachePath, ffmpegDir, 'ffmpeg-linux');
        }

        ffmpegOk = fs.existsSync(ffmpegPath);
        if (ffmpegOk) {
          console.log(`   [BOX] ffmpeg: ${ffmpegDir} [OK] (${ffmpegPath})`);
        } else {
          console.log(`   [WARNING] ffmpeg path does not exist: ${ffmpegPath}`);
        }
      } else {
        console.log(`   [WARNING] ffmpeg directory not found`);
      }

      if (chromiumOk && headlessOk && ffmpegOk) {
        console.log(`   [SUCCESS] Playwright browsers fully installed, skipping download`);
        return;
      } else {
        console.log(`   [WARNING] Playwright cache incomplete: chromium=${chromiumOk}, headless=${headlessOk}, ffmpeg=${ffmpegOk}`);
        if (!ffmpegOk) {
          console.log(`   [TIP] ffmpeg is used for video recording and will be automatically installed`);
        }

        // In Docker environment, missing browsers indicate a build issue
        if (isDocker) {
          console.error(`   [ERROR] Playwright browsers missing in Docker environment, this should not happen!`);
          console.error(`   [TIP] Please check if the COPY instructions in Dockerfile are correct`);
          console.error(`   [TIP] Or rebuild image: docker compose build --no-cache`);
          process.exit(1);
        }
      }
    } else {
      console.log(`   [WARNING] Playwright cache directory does not exist: ${playwrightCachePath}`);
    }

    // Download Playwright browsers (using the currently installed Playwright version)
    console.log(`   [GEAR] Downloading Playwright browsers...`);
    const playwrightPath = path.resolve(__dirname, '../node_modules/playwright');
    if (!fs.existsSync(playwrightPath)) {
      console.log('   [ERROR] Playwright is not installed, run npm install first');
      process.exit(1);
    }

    const playwrightCliPath = path.resolve(playwrightPath, 'cli.js');
    // Install chromium and ffmpeg (required for video recording)
    const installCmd = isWindows
      ? `node "${playwrightCliPath}" install chromium chromium-headless-shell ffmpeg`
      : `node "${playwrightCliPath}" install --with-deps chromium chromium-headless-shell ffmpeg`;

    console.log(`   [WRENCH] Executing command: ${installCmd}`);
    await execPromise(installCmd);
    console.log(`   [SUCCESS] Playwright browsers and ffmpeg download completed`);

    // Verify installation result again
    console.log(`   [SEARCH] Verifying installation result...`);
    const verifyContents = fs.readdirSync(playwrightCachePath);
    console.log(`   [DIR] Post-installation cache contents: ${verifyContents.join(', ')}`);
  } catch (error) {
    console.error('   [ERROR] Playwright browser installation failed:', error.message);
    console.error('   [TIP] You can manually run: npx playwright install chromium chromium-headless-shell ffmpeg');
    if (error.stack) {
      console.error('   [LIST] Error stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Create necessary directories
function createDirectories() {
  const dirs = ['screenshots', 'logs', 'temp'];
  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      // Create silently, no log output
    }
  });
}

// Check service health status
function checkServiceHealth(url, serviceName, maxAttempts = 60) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    let attempts = 0;
    let isResolved = false;
    let checkTimer = null;

    const cleanup = () => {
      if (checkTimer) {
        clearTimeout(checkTimer);
        checkTimer = null;
      }
    };

    const check = () => {
      if (isResolved) return;

      attempts++;

      // Display progress only on the first attempt and every 10 attempts
      if (attempts === 1 || attempts % 10 === 0) {
        process.stdout.write(`\r[WAIT] Waiting for ${serviceName} to start... (${attempts}/${maxAttempts})`);
      }

      const req = http.get(url, { timeout: 2000 }, (res) => {
        if (isResolved) return;

        // For health check endpoints, 200 indicates success
        // For frontend, any response indicates service has started
        if (res.statusCode === 200 || res.statusCode < 500) {
          cleanup();
          isResolved = true;
          process.stdout.write('\r'); // Clear progress line
          resolve(true);
        } else {
          if (attempts < maxAttempts) {
            checkTimer = setTimeout(check, 1000);
          } else {
            cleanup();
            reject(new Error(`${serviceName} startup timeout (${maxAttempts} seconds)`));
          }
        }
        res.resume(); // Release response object
      });

      req.on('error', () => {
        if (isResolved) return;

        if (attempts < maxAttempts) {
          checkTimer = setTimeout(check, 1000);
        } else {
          cleanup();
          reject(new Error(`${serviceName} startup timeout (${maxAttempts} seconds)`));
        }
      });

      req.on('timeout', () => {
        req.destroy();
        if (isResolved) return;

        if (attempts < maxAttempts) {
          checkTimer = setTimeout(check, 1000);
        } else {
          cleanup();
          reject(new Error(`${serviceName} startup timeout (${maxAttempts} seconds)`));
        }
      });
    };

    // Wait 3 seconds before starting checks (give services time to start)
    checkTimer = setTimeout(check, 3000);
  });
}

// Start services
async function startServices() {
  console.log('\n[START] Starting Services...');
  console.log('====================\n');

  // Fix: Start services sequentially, ensuring backend starts successfully before starting frontend

  // Step 1: Start backend service
  console.log('[WRENCH] [1/2] Starting backend service...');
  const backendProcess = spawn(npxCmd, ['tsx', 'watch', 'server/index.ts'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1'
    }
  });

  // Store backend process reference for graceful shutdown
  process._backendProcess = backendProcess;

  // Error handling
  backendProcess.on('error', (error) => {
    console.error('\n[ERROR] Backend service startup failed:', error.message);
    console.error('[TIP] Please check:');
    console.error('   1. Are all dependencies installed (npm install)');
    console.error('   2. Is Prisma client generated (npx prisma generate)');
    console.error('   3. Are environment variables configured correctly (.env file)');
    console.error('   4. Is the port occupied');
    console.error('   5. Is tsx installed (npm install tsx)');
    process.exit(1);
  });

  // Step 2: Wait for backend service health check to pass
  try {
    console.log('[WAIT] Waiting for backend service to start...');
    const backendHealthUrl = `http://${SERVER_HOST}:${BACKEND_PORT}/health`;
    await checkServiceHealth(backendHealthUrl, 'Backend Service', 60);
    console.log(`[SUCCESS] Backend service started and running normally (Port ${BACKEND_PORT})`);
  } catch (error) {
    console.error('\n[ERROR] Backend service health check failed:', error.message);
    console.error('[TIP] Hints:');
    console.error('   - Backend might still be starting, please check the logs above');
    console.error('   - If backend fails to start, please check:');
    console.error('     1. Is database connection normal');
    console.error('     2. Are environment variables configured correctly');
    console.error(`     3. Is port ${BACKEND_PORT} occupied`);
    console.error('   - You can run "npm run dev:server" separately to see detailed error messages');
    process.exit(1);
  }

  // Step 3: Start frontend service after backend starts successfully
  console.log('\n[WRENCH] [2/2] Starting frontend service...\n');
  const frontendProcess = spawn('node', [
    '--max-old-space-size=4096',
    './node_modules/vite/bin/vite.js'
  ], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  // Store frontend process reference for graceful shutdown
  process._frontendProcess = frontendProcess;

  frontendProcess.on('error', (error) => {
    console.error('\n[ERROR] Frontend service startup failed:', error.message);
    console.error('[TIP] Please check:');
    console.error(`   1. Is port ${FRONTEND_PORT} occupied`);
    console.error('   2. Is vite installed');
    process.exit(1);
  });

  // Step 4: Wait for frontend service to start
  try {
    console.log('[WAIT] Waiting for frontend service to start...');
    const frontendHealthUrl = `http://${SERVER_HOST}:${FRONTEND_PORT}`;
    await checkServiceHealth(frontendHealthUrl, 'Frontend Service', 30);
    console.log(`[SUCCESS] Frontend service started and running normally (Port ${FRONTEND_PORT})`);
  } catch (error) {
    console.warn('\n[WARNING] Frontend service health check failed:', error.message);
    console.warn('[TIP] Hint: Frontend might still be starting, please check the logs above');
  }

  // Step 5: All services started, output access addresses
  console.log('\n[DONE] All services started successfully');
  console.log('====================');

  // Get all available network addresses
  const networkInterfaces = os.networkInterfaces();
  const networkIps = [];

  for (const name of Object.keys(networkInterfaces)) {
    const netInterface = networkInterfaces[name];
    if (netInterface) {
      for (const net of netInterface) {
        if (net.family === 'IPv4' && !net.internal) {
          const ip = net.address;
          if (ip !== '127.0.0.1' && ip !== '::1') {
            networkIps.push(ip);
          }
        }
      }
    }
  }

  // Deduplicate and sort: Prioritize LAN addresses
  const uniqueIps = Array.from(new Set(networkIps));
  const sortedIps = uniqueIps.sort((a, b) => {
    const isLanA = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(a);
    const isLanB = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(b);
    if (isLanA && !isLanB) return -1;
    if (!isLanA && isLanB) return 1;
    return 0;
  });

  // Separate LAN addresses and link-local addresses
  const lanIps = sortedIps.filter(ip => /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(ip));
  const linkLocalIps = sortedIps.filter(ip => /^169\.254\./.test(ip));

  console.log('[PIN] Access URLs:');
  console.log('   - Local access:');
  console.log(`     • Backend: http://localhost:${BACKEND_PORT}`);
  console.log(`     • Frontend: http://localhost:${FRONTEND_PORT}`);

  if (lanIps.length > 0) {
    console.log('   - LAN access (Recommended):');
    lanIps.forEach(ip => {
      console.log(`     • Backend: http://${ip}:${BACKEND_PORT}`);
      console.log(`     • Frontend: http://${ip}:${FRONTEND_PORT}`);
    });
  }

  if (linkLocalIps.length > 0) {
    console.log('   - Link-local addresses (Available on same link only):');
    linkLocalIps.forEach(ip => {
      console.log(`     • Backend: http://${ip}:${BACKEND_PORT}`);
      console.log(`     • Frontend: http://${ip}:${FRONTEND_PORT}`);
    });
  }
  console.log('[KEY] Login credentials:');
  console.log('   - Username: admin');
  console.log('   - Password: admin');
  console.log('====================');
  console.log('[TIP] Hint: Press Ctrl+C to stop services\n');

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('\n[STOP] Shutting down services...');
    if (process._backendProcess) {
      process._backendProcess.kill('SIGINT');
    }
    if (process._frontendProcess) {
      process._frontendProcess.kill('SIGINT');
    }
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Backend process close event
  backendProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n[ERROR] Backend service exited abnormally (Exit code: ${code})`);
      console.error('[TIP] Please check the error messages above');
      console.error('[TIP] You can try to start backend separately: npm run dev:server');
    } else {
      console.log(`\nBackend service closed (Exit code: ${code})`);
    }
  });

  // Frontend process close event
  frontendProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n[ERROR] Frontend service exited abnormally (Exit code: ${code})`);
      console.error('[TIP] Please check the error messages above');
    } else {
      console.log(`\nFrontend service closed (Exit code: ${code})`);
    }
  });
}

// Main startup flow
async function main() {
  try {
    console.log('[LIST] Startup Checklist:');
    console.log('   [1/6] Checking dependencies...');
    await checkDependencies();

    console.log('   [2/6] Generating Prisma client...');
    await generatePrismaClient();

    console.log('   [3/6] Waiting for database to be ready...');
    await waitForDatabase();

    console.log('   [4/6] Running database migrations...');
    await runDatabaseMigrations();

    console.log('   [5/6] Creating necessary directories...');
    createDirectories();

    console.log('   [6/6] Installing Playwright browsers...');
    await setup();

    console.log('[SUCCESS] All startup checks completed\n');
    await startServices();
  } catch (error) {
    console.error('\n[ERROR] Startup failed:', error.message);
    process.exit(1);
  }
}

main();
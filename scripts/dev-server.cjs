/**
 * 开发服务器启动脚本
 * 解决端口占用和热重载失效问题
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3001;
const isWindows = os.platform() === 'win32';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 检查并清理端口
async function cleanupPort(port) {
  return new Promise((resolve) => {
    log(`🔍 检查端口 ${port} 是否被占用...`, 'blue');
    
    const cmd = isWindows
      ? `netstat -ano | findstr :${port} | findstr LISTENING`
      : `lsof -ti:${port}`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (!stdout || stdout.trim() === '') {
        log(`✅ 端口 ${port} 可用`, 'green');
        resolve();
        return;
      }
      
      log(`⚠️  端口 ${port} 被占用，正在清理...`, 'yellow');
      
      if (isWindows) {
        // Windows: 从 netstat 输出提取 PID
        const lines = stdout.trim().split('\n');
        const pids = new Set();
        
        lines.forEach(line => {
          const match = line.trim().match(/\s+(\d+)\s*$/);
          if (match) {
            pids.add(match[1]);
          }
        });
        
        if (pids.size === 0) {
          log(`✅ 端口 ${port} 已释放`, 'green');
          resolve();
          return;
        }
        
        // 终止所有占用端口的进程
        const killPromises = Array.from(pids).map(pid => {
          return new Promise((resolveKill) => {
            exec(`taskkill /PID ${pid} /F`, (killError) => {
              if (killError) {
                log(`  ⚠️  终止进程 ${pid} 失败`, 'yellow');
              } else {
                log(`  ✅ 已终止进程 ${pid}`, 'green');
              }
              resolveKill();
            });
          });
        });
        
        Promise.all(killPromises).then(() => {
          // 等待端口释放
          setTimeout(() => {
            log(`✅ 端口 ${port} 清理完成`, 'green');
            resolve();
          }, 1000);
        });
      } else {
        // Unix/Linux/Mac
        const pids = stdout.trim().split('\n');
        exec(`kill -9 ${pids.join(' ')}`, (killError) => {
          if (killError) {
            log(`⚠️  清理端口失败: ${killError.message}`, 'yellow');
          } else {
            log(`✅ 端口 ${port} 清理完成`, 'green');
          }
          setTimeout(resolve, 500);
        });
      }
    });
  });
}

// 启动开发服务器
async function startDevServer() {
  log('\n🚀 正在启动开发服务器...', 'blue');
  
  // 1. 清理端口
  await cleanupPort(PORT);
  
  // 2. 启动 tsx watch
  log('\n🔄 启动热重载服务器（tsx watch）...', 'blue');
  
  const serverProcess = spawn(
    'npx',
    ['tsx', 'watch', '--clear-screen=false', 'server/index.ts'],
    {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        PORT: PORT,
        NODE_ENV: process.env.NODE_ENV || 'development',
        // 禁用 Node.js 警告
        NODE_NO_WARNINGS: '1',
      }
    }
  );
  
  serverProcess.on('error', (err) => {
    log(`❌ 服务器启动失败: ${err.message}`, 'red');
    process.exit(1);
  });
  
  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      log(`❌ 服务器异常退出，代码: ${code}`, 'red');
    }
  });
  
  // 3. 优雅关闭处理
  const cleanup = async () => {
    log('\n🔌 正在关闭服务器...', 'yellow');
    
    // 终止子进程
    if (!serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      
      // 如果 5 秒后还没退出，强制终止
      setTimeout(() => {
        if (!serverProcess.killed) {
          log('⚠️  强制终止服务器进程', 'yellow');
          serverProcess.kill('SIGKILL');
        }
      }, 5000);
    }
    
    // 再次清理端口（以防万一）
    setTimeout(async () => {
      await cleanupPort(PORT);
      process.exit(0);
    }, 1000);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);
  
  // Windows 特殊处理
  if (isWindows) {
    require('readline')
      .createInterface({
        input: process.stdin,
        output: process.stdout
      })
      .on('SIGINT', () => {
        process.emit('SIGINT');
      });
  }
}

// 启动
startDevServer().catch((err) => {
  log(`❌ 启动失败: ${err.message}`, 'red');
  process.exit(1);
});


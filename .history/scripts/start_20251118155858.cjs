#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 autoQA 启动脚本');
console.log('====================');

// 添加 execPromise 辅助函数
function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

// 检查依赖是否已安装
function checkDependencies() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
  
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('📦 正在安装依赖...');
    return new Promise((resolve, reject) => {
      const install = spawn('npm', ['install'], { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit' 
      });
      
      install.on('close', (code) => {
        if (code === 0) {
          console.log('✅ 依赖安装完成');
          resolve();
        } else {
          reject(new Error('依赖安装失败'));
        }
      });
    });
  }
  return Promise.resolve();
}

// 安装 Playwright 浏览器
async function setup() {
  console.log('🎭 正在安装 Playwright 浏览器...');
  try {
    // 修复：使用正确的相对路径检查 playwright 是否已安装
    const playwrightPath = path.resolve(__dirname, '../node_modules/playwright');
    if (!fs.existsSync(playwrightPath)) {
        console.log('Playwright 未安装，请先运行 npm install playwright');
        process.exit(1);
    }
    
    // 修复：使用正确的路径调用 playwright 安装脚本
    const cliPath = path.resolve(__dirname, '../node_modules/playwright/cli.js');
    await execPromise(`node "${cliPath}" install chromium`);
    
    console.log('✅ Playwright 浏览器安装/更新成功');
  } catch (error) {
    console.error('❌ Playwright 浏览器安装失败:', error);
    process.exit(1);
  }
}

// ...existing code...

// 创建必要的目录
function createDirectories() {
  const dirs = ['screenshots', 'logs', 'temp'];
  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`📁 创建目录: ${dir}`);
    }
  });
}

// 启动服务
function startServices() {
  console.log('🔥 启动 autoQA 服务...');
  console.log('📍 前端地址: http://localhost:5173');
  console.log('📍 后端地址: http://localhost:3001');
  console.log('📍 按 Ctrl+C 停止服务');
  console.log('====================');
  
  const dev = spawn('npm', ['run', 'dev'], { 
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit' 
  });
  
  // 优雅关闭
  process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭服务...');
    dev.kill('SIGINT');
    process.exit(0);
  });
  
  dev.on('close', (code) => {
    console.log(`服务已关闭 (退出码: ${code})`);
  });
}

// 主启动流程
async function main() {
  try {
    await checkDependencies();
    createDirectories();
    await setup();
    startServices();
  } catch (error) {
    console.error('❌ 启动失败:', error.message);
    process.exit(1);
  }
}

main(); 
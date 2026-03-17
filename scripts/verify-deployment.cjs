#!/usr/bin/env node

/**
 * 部署验证脚本
 * 验证步骤截图数据库存储功能是否正确部署
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 开始部署验证...');

async function verifyDeployment() {
  const results = {
    environment: checkEnvironment(),
    directories: checkDirectories(),
    files: checkFiles(),
    database: await checkDatabase(),
    services: checkServices(),
    configuration: checkConfiguration()
  };

  console.log('\n📊 验证结果汇总:');
  console.log('==================');
  
  let allPassed = true;
  
  for (const [category, result] of Object.entries(results)) {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${category}: ${result.message}`);
    
    if (!result.passed) {
      allPassed = false;
      if (result.details) {
        result.details.forEach(detail => console.log(`   - ${detail}`));
      }
    }
  }

  console.log('==================');
  
  if (allPassed) {
    console.log('🎉 部署验证通过！所有功能正常。');
    return true;
  } else {
    console.log('❌ 部署验证失败，请检查上述问题。');
    return false;
  }
}

function checkEnvironment() {
  const requiredVars = ['DATABASE_URL', 'NODE_ENV'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    return {
      passed: false,
      message: `缺少环境变量: ${missing.join(', ')}`,
      details: missing.map(v => `请设置 ${v}`)
    };
  }

  const optionalVars = {
    SCREENSHOT_DIR: 'screenshots',
    SCREENSHOT_RETENTION_DAYS: '30',
    SCREENSHOT_MAX_FILE_SIZE: '10485760',
    SCREENSHOT_QUALITY: '80'
  };

  const config = {};
  for (const [key, defaultValue] of Object.entries(optionalVars)) {
    config[key] = process.env[key] || defaultValue;
  }

  return {
    passed: true,
    message: `环境配置正常 (${process.env.NODE_ENV})`,
    config
  };
}

function checkDirectories() {
  const requiredDirs = [
    process.env.SCREENSHOT_DIR || 'screenshots',
    'logs',
    'temp',
    'backups'
  ];

  const issues = [];
  
  for (const dir of requiredDirs) {
    const fullPath = path.join(process.cwd(), dir);
    
    if (!fs.existsSync(fullPath)) {
      issues.push(`目录不存在: ${dir}`);
      continue;
    }

    try {
      const testFile = path.join(fullPath, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (error) {
      issues.push(`目录不可写: ${dir}`);
    }
  }

  if (issues.length > 0) {
    return {
      passed: false,
      message: `目录检查失败`,
      details: issues
    };
  }

  return {
    passed: true,
    message: `所有必需目录存在且可写 (${requiredDirs.length}个)`
  };
}

function checkFiles() {
  const criticalFiles = [
    'server/index.ts',
    'server/services/screenshotService.ts',
    'server/services/testExecution.ts',
    'server/routes/screenshots.ts',
    'prisma/schema.prisma',
    'scripts/deploy-database.cjs',
    'scripts/deploy-application.cjs'
  ];

  const missing = criticalFiles.filter(file => !fs.existsSync(file));
  
  if (missing.length > 0) {
    return {
      passed: false,
      message: `关键文件缺失`,
      details: missing.map(f => `缺失文件: ${f}`)
    };
  }

  return {
    passed: true,
    message: `所有关键文件存在 (${criticalFiles.length}个)`
  };
}

async function checkDatabase() {
  try {
    const { PrismaClient } = require('../src/generated/prisma');
    const prisma = new PrismaClient();

    try {
      // 测试连接
      await prisma.$connect();

      // 检查step_screenshots表
      const tableExists = await prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'step_screenshots'
      `;

      if (tableExists[0].count === 0) {
        return {
          passed: false,
          message: 'step_screenshots表不存在',
          details: ['请运行数据库迁移: npx prisma migrate deploy']
        };
      }

      // 检查索引
      const indexes = await prisma.$queryRaw`
        SELECT index_name 
        FROM information_schema.statistics 
        WHERE table_schema = DATABASE() 
        AND table_name = 'step_screenshots'
        AND index_name IN ('idx_run_id', 'idx_test_case_id', 'idx_created_at')
      `;

      const indexNames = indexes.map(idx => idx.index_name);
      const requiredIndexes = ['idx_run_id', 'idx_test_case_id', 'idx_created_at'];
      const missingIndexes = requiredIndexes.filter(idx => !indexNames.includes(idx));

      // 检查记录数
      const count = await prisma.step_screenshots.count();

      await prisma.$disconnect();

      if (missingIndexes.length > 0) {
        return {
          passed: false,
          message: `数据库索引缺失`,
          details: missingIndexes.map(idx => `缺失索引: ${idx}`)
        };
      }

      return {
        passed: true,
        message: `数据库连接正常，表结构完整 (${count}条记录)`
      };

    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    return {
      passed: false,
      message: `数据库连接失败: ${error.message}`,
      details: [
        '请检查DATABASE_URL配置',
        '确保数据库服务正在运行',
        '验证数据库用户权限'
      ]
    };
  }
}

function checkServices() {
  const services = [
    'server/services/screenshotService.ts',
    'server/services/testExecution.ts'
  ];

  const issues = [];
  
  for (const service of services) {
    if (!fs.existsSync(service)) {
      issues.push(`服务文件不存在: ${service}`);
      continue;
    }

    // 检查文件内容是否包含关键功能
    const content = fs.readFileSync(service, 'utf8');
    
    if (service.includes('screenshotService')) {
      const requiredMethods = ['saveScreenshot', 'getScreenshotsByRunId', 'cleanupExpiredScreenshots'];
      const missingMethods = requiredMethods.filter(method => !content.includes(method));
      
      if (missingMethods.length > 0) {
        issues.push(`ScreenshotService缺少方法: ${missingMethods.join(', ')}`);
      }
    }

    if (service.includes('testExecution')) {
      if (!content.includes('takeStepScreenshot')) {
        issues.push('TestExecutionService缺少takeStepScreenshot方法');
      }
    }
  }

  if (issues.length > 0) {
    return {
      passed: false,
      message: `服务检查失败`,
      details: issues
    };
  }

  return {
    passed: true,
    message: `所有服务文件正常 (${services.length}个)`
  };
}

function checkConfiguration() {
  const configFiles = [
    'deployment.config.js',
    'docs/deployment-guide.md',
    'docs/database-deployment-guide.md'
  ];

  const missing = configFiles.filter(file => !fs.existsSync(file));
  
  if (missing.length > 0) {
    return {
      passed: false,
      message: `配置文件缺失`,
      details: missing.map(f => `缺失文件: ${f}`)
    };
  }

  // 检查.env文件
  if (!fs.existsSync('.env')) {
    return {
      passed: false,
      message: '环境配置文件缺失',
      details: ['请创建.env文件或设置环境变量']
    };
  }

  return {
    passed: true,
    message: `配置文件完整 (${configFiles.length + 1}个)`
  };
}

// 运行验证
if (require.main === module) {
  verifyDeployment().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { verifyDeployment };
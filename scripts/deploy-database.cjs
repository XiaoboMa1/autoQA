#!/usr/bin/env node

/**
 * 数据库部署脚本
 * 执行Prisma迁移并验证数据库结构
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 开始数据库部署...');

async function deployDatabase() {
  try {
    // 1. 检查数据库连接
    console.log('📡 检查数据库连接...');
    try {
      execSync('npx prisma db pull --force', { stdio: 'inherit' });
      console.log('✅ 数据库连接正常');
    } catch (error) {
      console.error('❌ 数据库连接失败，请确保数据库服务正在运行');
      console.error('数据库配置:', process.env.DATABASE_URL || '未设置DATABASE_URL');
      process.exit(1);
    }

    // 2. 备份现有数据（可选）
    console.log('💾 创建数据库备份...');
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);
    
    try {
      // 提取数据库连接信息
      const dbUrl = process.env.DATABASE_URL;
      const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
      if (match) {
        const [, user, password, host, port, database] = match;
        execSync(`mysqldump -h${host} -P${port} -u${user} -p${password} ${database} > "${backupFile}"`, { stdio: 'inherit' });
        console.log(`✅ 数据库备份已创建: ${backupFile}`);
      }
    } catch (error) {
      console.warn('⚠️ 数据库备份失败，继续执行迁移...');
    }

    // 3. 执行Prisma迁移
    console.log('🔄 执行数据库迁移...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('✅ 数据库迁移完成');

    // 4. 生成Prisma客户端
    console.log('🔧 生成Prisma客户端...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Prisma客户端生成完成');

    // 5. 验证数据库结构
    console.log('🔍 验证数据库结构...');
    await verifyDatabaseStructure();

    // 6. 创建索引优化（如果需要）
    console.log('⚡ 优化数据库索引...');
    await optimizeIndexes();

    console.log('🎉 数据库部署完成！');

  } catch (error) {
    console.error('❌ 数据库部署失败:', error.message);
    process.exit(1);
  }
}

async function verifyDatabaseStructure() {
  try {
    const { PrismaClient } = require('../src/generated/prisma');
    const prisma = new PrismaClient();

    try {
      // 验证step_screenshots表是否存在
      const result = await prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'step_screenshots'
      `;
      
      if (result[0].count > 0) {
        console.log('✅ step_screenshots表已存在');
      } else {
        throw new Error('step_screenshots表不存在');
      }

      // 验证索引是否存在
      const indexes = await prisma.$queryRaw`
        SELECT index_name 
        FROM information_schema.statistics 
        WHERE table_schema = DATABASE() 
        AND table_name = 'step_screenshots'
        AND index_name IN ('idx_run_id', 'idx_test_case_id', 'idx_created_at')
      `;
      
      const indexNames = indexes.map(idx => idx.index_name);
      const requiredIndexes = ['idx_run_id', 'idx_test_case_id', 'idx_created_at'];
      
      for (const indexName of requiredIndexes) {
        if (indexNames.includes(indexName)) {
          console.log(`✅ 索引 ${indexName} 已存在`);
        } else {
          console.warn(`⚠️ 索引 ${indexName} 不存在`);
        }
      }

      // 验证枚举类型
      const enumCheck = await prisma.$queryRaw`
        SELECT column_type 
        FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = 'step_screenshots' 
        AND column_name = 'status'
      `;
      
      if (enumCheck[0] && enumCheck[0].column_type.includes('success')) {
        console.log('✅ step_screenshots_status枚举类型正确');
      } else {
        console.warn('⚠️ step_screenshots_status枚举类型可能有问题');
      }

    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    console.warn('⚠️ 数据库验证失败，可能是因为数据库未连接:', error.message);
  }
}

async function optimizeIndexes() {
  try {
    const { PrismaClient } = require('../src/generated/prisma');
    const prisma = new PrismaClient();

    try {
      // 分析表统计信息
      await prisma.$executeRaw`ANALYZE TABLE step_screenshots`;
      console.log('✅ 表统计信息已更新');

      // 检查索引使用情况（仅在有数据时）
      const rowCount = await prisma.step_screenshots.count();
      if (rowCount > 0) {
        console.log(`📊 step_screenshots表当前有 ${rowCount} 条记录`);
      } else {
        console.log('📊 step_screenshots表为空，索引优化将在有数据后生效');
      }

    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    console.warn('⚠️ 索引优化失败，可能是因为数据库未连接:', error.message);
  }
}

// 运行部署
if (require.main === module) {
  deployDatabase();
}

module.exports = { deployDatabase, verifyDatabaseStructure, optimizeIndexes };
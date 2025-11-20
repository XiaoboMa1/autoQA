import { PrismaClient } from '../src/generated/prisma/index.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('开始迁移用户数据...');

  // 首先，我们需要直接通过SQL添加字段，设置临时默认值
  try {
    // 1. 添加字段（允许NULL）- 逐个添加以处理已存在的情况
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN username VARCHAR(100) NULL`);
      console.log('✅ username字段添加成功');
    } catch (e: any) {
      if (e.message.includes('Duplicate column')) {
        console.log('⚠️ username字段已存在');
      } else {
        throw e;
      }
    }

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN account_name VARCHAR(100) NULL`);
      console.log('✅ account_name字段添加成功');
    } catch (e: any) {
      if (e.message.includes('Duplicate column')) {
        console.log('⚠️ account_name字段已存在');
      } else {
        throw e;
      }
    }

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN department VARCHAR(100) NULL`);
      console.log('✅ department字段添加成功');
    } catch (e: any) {
      if (e.message.includes('Duplicate column')) {
        console.log('⚠️ department字段已存在');
      } else {
        throw e;
      }
    }

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE`);
      console.log('✅ is_super_admin字段添加成功');
    } catch (e: any) {
      if (e.message.includes('Duplicate column')) {
        console.log('⚠️ is_super_admin字段已存在');
      } else {
        throw e;
      }
    }

    // 2. 为现有用户设置默认username（使用email前缀）
    await prisma.$executeRawUnsafe(`
      UPDATE users
      SET username = SUBSTRING_INDEX(email, '@', 1)
      WHERE username IS NULL
    `);
    console.log('✅ 为现有用户设置默认username');

    // 3. 创建超级管理员账号（如果不存在）- 使用原始SQL
    const hashedPassword = await bcrypt.hash('admin', 10);

    // 检查是否已存在admin用户
    const result: any = await prisma.$queryRawUnsafe(
      `SELECT id FROM users WHERE email = 'admin@test.local' LIMIT 1`
    );

    if (result.length === 0) {
      // 创建新用户
      await prisma.$executeRawUnsafe(`
        INSERT INTO users (email, username, account_name, password_hash, department, is_super_admin, created_at)
        VALUES ('admin@test.local', 'admin', '超级管理员', '${hashedPassword}', '系统管理部', TRUE, NOW())
      `);
      console.log('✅ 超级管理员账号创建成功');
      console.log('   用户名: admin');
      console.log('   密码: admin');
    } else {
      // 更新现有用户
      await prisma.$executeRawUnsafe(`
        UPDATE users
        SET username = 'admin',
            account_name = '超级管理员',
            password_hash = '${hashedPassword}',
            department = '系统管理部',
            is_super_admin = TRUE
        WHERE email = 'admin@test.local'
      `);
      console.log('✅ 超级管理员账号更新成功');
      console.log('   用户名: admin');
      console.log('   密码: admin');
    }

    // 4. 添加unique约束
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE users
        ADD UNIQUE INDEX username (username)
      `);
      console.log('✅ username唯一约束添加成功');
    } catch (error: any) {
      if (error.message.includes('Duplicate')) {
        console.log('⚠️ username唯一约束已存在');
      } else {
        throw error;
      }
    }

    // 5. 将username设置为NOT NULL
    await prisma.$executeRawUnsafe(`
      ALTER TABLE users
      MODIFY COLUMN username VARCHAR(100) NOT NULL
    `);
    console.log('✅ username字段设置为NOT NULL');

    console.log('🎉 用户数据迁移完成！');
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

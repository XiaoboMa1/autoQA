import { PrismaClient } from '../src/generated/prisma/index.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log('正在创建超级管理员用户...\n');

    // 检查admin用户是否已存在
    const existingAdmin = await prisma.users.findUnique({
      where: { username: 'admin' }
    });

    if (existingAdmin) {
      console.log('admin 用户已存在，更新为超级管理员...');

      // 更新为超级管理员
      const updated = await prisma.users.update({
        where: { id: existingAdmin.id },
        data: {
          is_super_admin: true,
          password_hash: await bcrypt.hash('admin', 10)
        }
      });

      console.log('✅ 用户已更新:');
      console.log(`   ID: ${updated.id}`);
      console.log(`   用户名: ${updated.username}`);
      console.log(`   邮箱: ${updated.email}`);
      console.log(`   超级管理员: ${updated.is_super_admin}`);
    } else {
      // 创建新的超级管理员
      const passwordHash = await bcrypt.hash('admin', 10);

      const admin = await prisma.users.create({
        data: {
          email: 'admin@test.com',
          username: 'admin',
          password_hash: passwordHash,
          account_name: '系统管理员',
          department: 'IT部门',
          is_super_admin: true
        }
      });

      console.log('✅ 超级管理员创建成功:');
      console.log(`   ID: ${admin.id}`);
      console.log(`   用户名: ${admin.username}`);
      console.log(`   邮箱: ${admin.email}`);
      console.log(`   密码: admin`);
      console.log(`   超级管理员: ${admin.is_super_admin}`);
    }

    console.log('\n可以使用以下凭据登录:');
    console.log('   用户名: admin');
    console.log('   密码: admin');

  } catch (error) {
    console.error('❌ 创建管理员失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();

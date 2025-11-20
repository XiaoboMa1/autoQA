import bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    // 检查是否已存在 admin 用户
    const existingAdmin = await prisma.users.findUnique({
      where: { username: 'admin' }
    });

    if (existingAdmin) {
      console.log('❌ Admin 用户已存在');
      return;
    }

    // 创建 admin 用户
    const hashedPassword = await bcrypt.hash('admin', 10);
    
    const adminUser = await prisma.users.create({
      data: {
        email: 'admin@autoQA.com',
        username: 'admin',
        password_hash: hashedPassword,
        account_name: 'Administrator',
        department: 'IT',
        is_super_admin: true
      }
    });

    console.log('✅ Admin 用户创建成功:', adminUser);
  } catch (error) {
    console.error('❌ 创建 Admin 用户失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
/**
 * 查询数据库中的所有系统
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  let connection;

  try {
    // 从 DATABASE_URL 解析连接信息
    const dbUrl = process.env.DATABASE_URL;
    const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);

    if (!match) {
      throw new Error('无法解析 DATABASE_URL');
    }

    const [, user, password, host, port, database] = match;

    // 创建数据库连接
    connection = await mysql.createConnection({
      host,
      port: parseInt(port),
      user,
      password,
      database
    });

    console.log('✅ 数据库连接成功\n');

    // 查询所有系统
    const [rows] = await connection.execute(
      'SELECT id, name, description, status, sort_order, created_at FROM `systems` WHERE status = "active" ORDER BY sort_order, id'
    );

    console.log('📊 数据库中的系统列表:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (rows.length === 0) {
      console.log('⚠️  数据库中没有系统记录');
      return;
    }

    rows.forEach((system, index) => {
      console.log(`${index + 1}. 系统名称: ${system.name}`);
      console.log(`   系统ID: ${system.id}`);
      console.log(`   状态: ${system.status}`);
      console.log(`   描述: ${system.description || '(无)'}`);
      console.log(`   创建时间: ${system.created_at}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`总计: ${rows.length} 个系统\n`);

    // 显示需要创建的知识库集合
    console.log('💡 需要创建的知识库集合:\n');
    rows.forEach(system => {
      const collectionName = `test_knowledge_${system.name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').toLowerCase()}`;
      console.log(`   - ${collectionName} (系统: ${system.name})`);
    });

  } catch (error) {
    console.error('❌ 查询失败:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

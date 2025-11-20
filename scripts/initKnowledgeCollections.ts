/**
 * 初始化知识库集合脚本
 * 为数据库中所有系统创建对应的向量数据库集合
 */

import { PrismaClient } from '@prisma/client';
import { TestCaseKnowledgeBase } from '../server/services/testCaseKnowledgeBase.js';

const prisma = new PrismaClient();

async function initKnowledgeCollections() {
  try {
    console.log('🚀 开始初始化知识库集合...\n');

    // 1. 获取所有系统
    const systems = await prisma.system.findMany({
      select: {
        id: true,
        name: true,
        code: true
      }
    });

    console.log(`📊 找到 ${systems.length} 个系统:`);
    systems.forEach(s => {
      console.log(`   - ${s.name} (${s.code})`);
    });
    console.log('');

    // 2. 检查并创建默认知识库
    console.log('🔍 检查默认知识库集合...');
    const defaultKb = new TestCaseKnowledgeBase();
    const defaultExists = await defaultKb.isInitialized();

    if (!defaultExists) {
      console.log('   ⚠️  默认集合不存在，正在创建...');
      await defaultKb.initializeCollection();
      console.log('   ✅ 默认集合创建成功: test_knowledge_default');
    } else {
      console.log('   ✅ 默认集合已存在: test_knowledge_default');
    }
    console.log('');

    // 3. 为每个系统创建知识库集合
    console.log('🔧 开始为各系统创建知识库集合...\n');

    for (const system of systems) {
      const systemName = system.code || system.name;
      console.log(`📦 处理系统: ${system.name} (${systemName})`);

      const kb = new TestCaseKnowledgeBase(systemName);
      const exists = await kb.isInitialized();

      if (!exists) {
        console.log(`   ⚠️  集合不存在，正在创建...`);
        await kb.initializeCollection();
        const collectionName = `test_knowledge_${systemName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').toLowerCase()}`;
        console.log(`   ✅ 集合创建成功: ${collectionName}`);
      } else {
        const collectionName = `test_knowledge_${systemName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').toLowerCase()}`;
        console.log(`   ✅ 集合已存在: ${collectionName}`);
      }
      console.log('');
    }

    // 4. 显示所有集合统计
    console.log('📊 所有知识库集合统计:\n');
    const defaultStats = await defaultKb.getStats();
    console.log(`   📚 默认集合 (test_knowledge_default)`);
    console.log(`      - 总知识数: ${defaultStats.totalKnowledge}`);
    console.log(`      - 业务规则: ${defaultStats.byCategory.business_rule}`);
    console.log(`      - 测试模式: ${defaultStats.byCategory.test_pattern}`);
    console.log(`      - 踩坑记录: ${defaultStats.byCategory.pitfall}`);
    console.log(`      - 风险场景: ${defaultStats.byCategory.risk_scenario}`);
    console.log('');

    for (const system of systems) {
      const systemName = system.code || system.name;
      const kb = new TestCaseKnowledgeBase(systemName);
      const stats = await kb.getStats();
      const collectionName = `test_knowledge_${systemName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').toLowerCase()}`;

      console.log(`   📚 ${system.name} (${collectionName})`);
      console.log(`      - 总知识数: ${stats.totalKnowledge}`);
      console.log(`      - 业务规则: ${stats.byCategory.business_rule}`);
      console.log(`      - 测试模式: ${stats.byCategory.test_pattern}`);
      console.log(`      - 踩坑记录: ${stats.byCategory.pitfall}`);
      console.log(`      - 风险场景: ${stats.byCategory.risk_scenario}`);
      console.log('');
    }

    // 5. 查询 Qdrant 中的所有集合
    console.log('🔍 Qdrant 中的所有集合:');
    const allCollections = await defaultKb.listAllCollections();
    allCollections.forEach(name => {
      console.log(`   - ${name}`);
    });

    console.log('\n✅ 知识库集合初始化完成！');

  } catch (error) {
    console.error('❌ 初始化失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行初始化
initKnowledgeCollections()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

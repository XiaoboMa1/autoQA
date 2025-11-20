/**
 * 知识库导入脚本
 * 用法：npx tsx server/scripts/importKnowledge.ts
 */

import { TestCaseKnowledgeBase, KnowledgeItem } from '../services/testCaseKnowledgeBase';
import initialKnowledge from '../knowledgeBase/initialKnowledge.json';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES模块中获取__dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function importKnowledge() {
  console.log('========================================');
  console.log('📦 开始导入测试用例知识库');
  console.log('========================================\n');

  try {
    // 初始化知识库服务
    const kb = new TestCaseKnowledgeBase();

    // Step 1: 初始化集合
    console.log('Step 1: 初始化Qdrant集合...');
    await kb.initCollection();
    console.log('');

    // Step 2: 准备知识数据
    console.log('Step 2: 准备知识数据...');
    const knowledgeList: KnowledgeItem[] = [
      ...initialKnowledge.businessRules,
      ...initialKnowledge.testPatterns,
      ...initialKnowledge.pitfalls,
      ...initialKnowledge.riskScenarios
    ];
    console.log(`📊 共准备 ${knowledgeList.length} 条知识`);
    console.log(`   - 业务规则: ${initialKnowledge.businessRules.length} 条`);
    console.log(`   - 测试模式: ${initialKnowledge.testPatterns.length} 条`);
    console.log(`   - 踩坑点: ${initialKnowledge.pitfalls.length} 条`);
    console.log(`   - 资损场景: ${initialKnowledge.riskScenarios.length} 条`);
    console.log('');

    // Step 3: 批量导入（测试模式：只导入第一条）
    console.log('Step 3: 测试导入单条知识...\n');
    try {
      await kb.addKnowledge(knowledgeList[0]);
      console.log('✅ 单条知识导入成功，开始批量导入...\n');
      await kb.addKnowledgeBatch(knowledgeList);
    } catch (error) {
      console.error('❌ 单条知识导入失败，请检查API配置');
      throw error;
    }
    console.log('');

    // Step 4: 验证导入结果
    console.log('Step 4: 验证导入结果...');
    const stats = await kb.getStats();
    console.log(`✅ 知识库总数: ${stats.totalCount} 条`);
    console.log('📊 分类统计:');
    Object.entries(stats.categoryCounts).forEach(([category, count]) => {
      const categoryName = {
        'business_rule': '业务规则',
        'test_pattern': '测试模式',
        'pitfall': '踩坑点',
        'risk_scenario': '资损场景'
      }[category] || category;
      console.log(`   - ${categoryName}: ${count} 条`);
    });
    console.log('');

    // Step 5: 测试检索功能
    console.log('Step 5: 测试知识检索功能...');
    console.log('测试查询: "订单创建时如何扣减库存"');
    const testResults = await kb.searchKnowledge({
      query: '订单创建时如何扣减库存',
      topK: 3
    });
    console.log(`🔍 检索到 ${testResults.length} 条相关知识:\n`);
    testResults.forEach((result, index) => {
      console.log(`${index + 1}. [${result.knowledge.category}] ${result.knowledge.title}`);
      console.log(`   相似度: ${(result.score * 100).toFixed(1)}%`);
      console.log(`   内容: ${result.knowledge.content.substring(0, 100)}...\n`);
    });

    console.log('========================================');
    console.log('✅ 知识库导入完成！');
    console.log('========================================');
    console.log('');
    console.log('💡 下一步:');
    console.log('1. 访问 Qdrant 管理界面: http://localhost:6333/dashboard');
    console.log('2. 查看集合 "test_knowledge" 的向量数据');
    console.log('3. 继续 Day3 的集成工作');
    console.log('');

  } catch (error) {
    console.error('❌ 导入失败:', error);
    process.exit(1);
  }
}

// 执行导入
importKnowledge();

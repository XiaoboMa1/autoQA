/**
 * 测试知识库检索功能
 * 演示如何在测试用例生成中使用RAG
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { TestCaseKnowledgeBase } from '../services/testCaseKnowledgeBase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testKnowledgeSearch() {
  console.log('========================================');
  console.log('🔍 测试知识库检索功能');
  console.log('========================================\n');

  const kb = new TestCaseKnowledgeBase();

  // 测试场景1: 订单相关需求
  console.log('📋 场景1: 订单创建功能需求');
  console.log('需求描述: "实现订单创建功能，包括库存扣减、金额计算、优惠券使用"');
  console.log('');

  const results1 = await kb.searchByCategory({
    query: '订单创建功能，包括库存扣减、金额计算、优惠券使用',
    businessDomain: '订单管理',
    topK: 3,
    scoreThreshold: 0.5  // 降低阈值以获取更多结果
  });

  console.log('🔍 检索到的相关知识:\n');

  console.log('📌 业务规则:');
  results1.businessRules.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.knowledge.title} (${(r.score * 100).toFixed(1)}%)`);
    console.log(`     ${r.knowledge.content.substring(0, 100)}...`);
  });

  console.log('\n📌 测试模式:');
  results1.testPatterns.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.knowledge.title} (${(r.score * 100).toFixed(1)}%)`);
    console.log(`     ${r.knowledge.content.substring(0, 100)}...`);
  });

  console.log('\n📌 历史踩坑点:');
  results1.pitfalls.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.knowledge.title} (${(r.score * 100).toFixed(1)}%)`);
    console.log(`     ${r.knowledge.content.substring(0, 100)}...`);
  });

  console.log('\n📌 资损风险场景:');
  results1.riskScenarios.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.knowledge.title} (${(r.score * 100).toFixed(1)}%)`);
    console.log(`     ${r.knowledge.content.substring(0, 100)}...`);
  });

  console.log('\n' + '='.repeat(60) + '\n');

  // 测试场景2: 查询列表功能
  console.log('📋 场景2: 商品列表查询功能需求');
  console.log('需求描述: "实现商品列表查询，支持分页、筛选、排序"');
  console.log('');

  const results2 = await kb.searchKnowledge({
    query: '商品列表查询，支持分页、筛选、排序',
    category: 'test_pattern',
    topK: 3,
    scoreThreshold: 0.5
  });

  console.log('🔍 检索到的测试模式:\n');
  results2.forEach((r, i) => {
    console.log(`${i + 1}. [${r.knowledge.category}] ${r.knowledge.title}`);
    console.log(`   相似度: ${(r.score * 100).toFixed(1)}%`);
    console.log(`   ${r.knowledge.content.substring(0, 120)}...\n`);
  });

  console.log('='.repeat(60) + '\n');

  // 测试场景3: 安全测试
  console.log('📋 场景3: 用户输入表单功能需求');
  console.log('需求描述: "实现用户评论功能，支持富文本输入"');
  console.log('');

  const results3 = await kb.searchKnowledge({
    query: '用户评论功能，富文本输入',
    category: 'risk_scenario',
    topK: 3,
    scoreThreshold: 0.5
  });

  console.log('🔍 检索到的资损风险场景:\n');
  results3.forEach((r, i) => {
    console.log(`${i + 1}. [${r.knowledge.category}] ${r.knowledge.title}`);
    console.log(`   相似度: ${(r.score * 100).toFixed(1)}%`);
    console.log(`   ⚠️  ${r.knowledge.content.substring(0, 120)}...\n`);
  });

  console.log('========================================');
  console.log('✅ 知识库检索测试完成');
  console.log('========================================\n');

  // 统计信息
  const stats = await kb.getStats();
  console.log('📊 知识库统计:');
  console.log(`   总计: ${stats.totalCount} 条知识`);
  console.log('   分类分布:');
  Object.entries(stats.categoryCounts).forEach(([category, count]) => {
    const categoryName = {
      'business_rule': '业务规则',
      'test_pattern': '测试模式',
      'pitfall': '踩坑点',
      'risk_scenario': '资损场景'
    }[category] || category;
    console.log(`     - ${categoryName}: ${count} 条`);
  });

  console.log('\n💡 使用建议:');
  console.log('1. 在生成测试用例前，先调用知识库检索相关知识');
  console.log('2. 将检索到的业务规则、测试模式注入到AI提示词中');
  console.log('3. 优先测试历史踩坑点和资损场景');
  console.log('4. 持续积累项目特有的测试知识');
}

// 运行测试
testKnowledgeSearch().catch(console.error);

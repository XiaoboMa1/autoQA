/**
 * 批量导入知识库数据到所有系统集合
 * 为电商公司的8个系统导入测试知识数据
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const EMBEDDING_API_BASE_URL = process.env.EMBEDDING_API_BASE_URL;
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-v4';
const EXPECTED_DIMENSION = 1024; // Aliyun text-embedding-v4 dimension

// 8个系统的集合名称
const SYSTEM_COLLECTIONS = [
  'test_knowledge_实物1_0',
  'test_knowledge_实物2_0',
  'test_knowledge_saas',
  'test_knowledge_供应链开放平台',
  'test_knowledge_权益管理平台',
  'test_knowledge_综合运营平台',
  'test_knowledge_立减金管理平台',
  'test_knowledge_营销管理中台'
];

// 电商业务知识数据 - 每个类别1-2条
const KNOWLEDGE_DATA = [
  // 业务规则类 (business_rule)
  {
    category: 'business_rule',
    title: '订单超时自动取消规则',
    content: '用户下单后30分钟内未支付，系统将自动取消订单并释放库存。特殊商品（如预售、定金商品）超时时间为24小时。取消后优惠券自动返还到用户账户，积分扣减回滚。',
    businessDomain: '订单管理',
    tags: ['订单', '超时', '自动取消', '库存释放'],
    metadata: { severity: 'high', version: 'v2.0' }
  },
  {
    category: 'business_rule',
    title: '优惠券叠加使用限制',
    content: '单笔订单最多使用3张优惠券，且满减券、折扣券、品类券可以叠加，但同类型优惠券不可叠加。店铺券与平台券可同时使用。优惠金额不得超过订单实付金额，多余部分自动失效。',
    businessDomain: '营销促销',
    tags: ['优惠券', '叠加规则', '促销', '限制'],
    metadata: { severity: 'medium', version: 'v2.1' }
  },

  // 测试模式类 (test_pattern)
  {
    category: 'test_pattern',
    title: '支付流程端到端测试模式',
    content: '测试支付流程时需覆盖：1.选择支付方式 2.调起支付组件 3.输入支付密码 4.支付成功回调 5.订单状态更新 6.库存扣减 7.发送支付成功通知。需验证支付超时、支付失败、重复支付等异常场景。',
    businessDomain: '支付系统',
    tags: ['支付', 'E2E测试', '回调', '异常处理'],
    metadata: { testType: 'integration', priority: 'high' }
  },
  {
    category: 'test_pattern',
    title: '秒杀活动并发测试模式',
    content: '秒杀测试需模拟高并发场景：1.使用JMeter或Locust模拟5000+并发 2.验证库存扣减准确性（不超卖） 3.检查订单创建速度 4.监控数据库连接池 5.验证Redis缓存击穿防护 6.测试限流降级策略。',
    businessDomain: '营销活动',
    tags: ['秒杀', '并发', '压力测试', '限流'],
    metadata: { testType: 'performance', priority: 'critical' }
  },

  // 历史踩坑点类 (pitfall)
  {
    category: 'pitfall',
    title: '退款金额计算精度丢失问题',
    content: '历史问题：使用JavaScript的Number类型计算退款金额时出现精度丢失，导致退款金额与实付金额相差几分钱。解决方案：统一使用整数（分为单位）进行金额计算，前端显示时再转换为元。涉及金额计算的接口必须使用decimal或bigint类型。',
    businessDomain: '订单退款',
    tags: ['退款', '精度', 'JavaScript', '金额计算', 'Bug'],
    metadata: { severity: 'critical', fixedDate: '2024-03', jiraId: 'BUG-1234' }
  },
  {
    category: 'pitfall',
    title: '分布式事务未提交导致库存不一致',
    content: '历史问题：订单创建时扣减库存采用分布式事务，但未正确处理事务补偿，导致订单取消后库存未回滚。解决方案：引入Seata分布式事务框架，使用TCC模式确保订单和库存的最终一致性。所有涉及多服务的数据变更必须纳入分布式事务管理。',
    businessDomain: '库存管理',
    tags: ['分布式事务', '库存', '数据一致性', 'Seata', 'TCC'],
    metadata: { severity: 'critical', fixedDate: '2024-05', jiraId: 'BUG-2456' }
  },

  // 资损风险场景类 (risk_scenario)
  {
    category: 'risk_scenario',
    title: '优惠券恶意刷取风控漏洞',
    content: '风险场景：用户通过脚本批量注册小号领取新人券，然后转卖或刷单套现，造成平台资损。防控措施：1.限制同一设备领取次数 2.实名认证绑定 3.新人券设置使用门槛（如首单满100可用） 4.监控异常领券行为（短时间大量领取） 5.订单风控拦截（收货地址、IP、设备指纹关联分析）。',
    businessDomain: '营销风控',
    tags: ['优惠券', '风控', '资损', '刷单', '恶意用户'],
    metadata: { riskLevel: 'critical', monthlyLoss: 50000, status: 'monitoring' }
  },
  {
    category: 'risk_scenario',
    title: '恶意退货骗取运费险赔付',
    content: '风险场景：用户购买商品后故意损坏或调包，申请退货获取运费险赔付，造成平台和商家双重损失。防控措施：1.退货需上传开箱视频和商品照片 2.物流签收时拍照存证 3.高价值商品（>500元）退货需平台审核 4.建立恶意退货用户黑名单 5.对接第三方质检机构 6.运费险赔付设置冷静期。',
    businessDomain: '售后风控',
    tags: ['退货', '运费险', '资损', '欺诈', '风控'],
    metadata: { riskLevel: 'high', monthlyLoss: 30000, status: 'controlled' }
  }
];

// 生成文本的embedding向量（使用OpenAI兼容API）
async function generateEmbedding(text) {
  try {
    const response = await fetch(`${EMBEDDING_API_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EMBEDDING_API_KEY}`
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
        encoding_format: 'float'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    // OpenAI格式返回: { data: [{ embedding: [...] }] }
    return data.data[0].embedding;
  } catch (error) {
    console.error('❌ 生成embedding失败:', error.message);
    throw error;
  }
}

// 为知识项生成ID
function generateId(knowledge, systemName) {
  const baseStr = `${systemName}-${knowledge.category}-${knowledge.title}`;
  // 简单的字符串hash
  let hash = 0;
  for (let i = 0; i < baseStr.length; i++) {
    const char = baseStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString();
}

// 检查集合是否存在
async function collectionExists(collectionName) {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${collectionName}`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

// 插入点到Qdrant
async function upsertPoints(collectionName, points) {
  const response = await fetch(`${QDRANT_URL}/collections/${collectionName}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: points
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Qdrant upsert error: ${error}`);
  }

  return response.json();
}

// 导入知识到指定集合
async function importToCollection(collectionName, systemName) {
  console.log(`\n📦 正在处理集合: ${collectionName}`);

  try {
    // 检查集合是否存在
    const exists = await collectionExists(collectionName);

    if (!exists) {
      console.log(`   ⚠️  集合不存在，跳过`);
      return { success: 0, failed: 0 };
    }

    let successCount = 0;
    let failedCount = 0;

    // 为每条知识生成embedding并插入
    for (const knowledge of KNOWLEDGE_DATA) {
      try {
        // 生成embedding（使用标题+内容）
        const text = `${knowledge.title} ${knowledge.content}`;
        console.log(`   🔄 生成embedding: ${knowledge.title.substring(0, 20)}...`);
        const embedding = await generateEmbedding(text);

        if (!embedding || !Array.isArray(embedding)) {
          console.log(`   ❌ Embedding数据错误，跳过`);
          failedCount++;
          continue;
        }

        if (embedding.length !== EXPECTED_DIMENSION) {
          console.log(`   ⚠️  Embedding维度异常: ${embedding.length} (期望${EXPECTED_DIMENSION})`);
          failedCount++;
          continue;
        }

        // 生成唯一ID
        const id = generateId(knowledge, systemName);

        // 插入到Qdrant
        await upsertPoints(collectionName, [
          {
            id: parseInt(id),
            vector: embedding,
            payload: {
              ...knowledge,
              systemName: systemName,
              createdAt: new Date().toISOString()
            }
          }
        ]);

        console.log(`   ✅ 已插入: ${knowledge.title}`);
        successCount++;

        // 避免请求过快
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.log(`   ❌ 插入失败: ${knowledge.title} - ${error.message}`);
        failedCount++;
      }
    }

    console.log(`   📊 导入完成 - 成功: ${successCount}, 失败: ${failedCount}`);
    return { success: successCount, failed: failedCount };

  } catch (error) {
    console.error(`   ❌ 处理集合失败:`, error.message);
    return { success: 0, failed: KNOWLEDGE_DATA.length };
  }
}

async function main() {
  console.log('🚀 开始批量导入知识库数据...\n');
  console.log(`📚 准备导入 ${KNOWLEDGE_DATA.length} 条知识数据`);
  console.log(`🎯 目标系统: ${SYSTEM_COLLECTIONS.length} 个集合\n`);

  // 显示知识数据概览
  console.log('📋 知识数据概览:');
  const categoryCounts = {};
  KNOWLEDGE_DATA.forEach(k => {
    categoryCounts[k.category] = (categoryCounts[k.category] || 0) + 1;
  });
  Object.entries(categoryCounts).forEach(([cat, count]) => {
    const labels = {
      business_rule: '业务规则',
      test_pattern: '测试模式',
      pitfall: '历史踩坑点',
      risk_scenario: '资损风险场景'
    };
    console.log(`   - ${labels[cat]}: ${count}条`);
  });
  console.log('');

  // 统计总体结果
  const totalStats = {
    collections: 0,
    successCollections: 0,
    totalSuccess: 0,
    totalFailed: 0
  };

  // 逐个集合导入
  for (const collectionName of SYSTEM_COLLECTIONS) {
    const systemName = collectionName.replace('test_knowledge_', '').replace(/_/g, '.');
    const result = await importToCollection(collectionName, systemName);

    totalStats.collections++;
    if (result.success > 0) {
      totalStats.successCollections++;
    }
    totalStats.totalSuccess += result.success;
    totalStats.totalFailed += result.failed;
  }

  // 显示总体统计
  console.log('\n' + '='.repeat(60));
  console.log('📊 批量导入完成统计:');
  console.log('='.repeat(60));
  console.log(`   处理集合数: ${totalStats.collections}`);
  console.log(`   成功集合数: ${totalStats.successCollections}`);
  console.log(`   总插入数据: ${totalStats.totalSuccess}`);
  console.log(`   总失败数据: ${totalStats.totalFailed}`);
  console.log('='.repeat(60));

  // 验证导入结果
  console.log('\n🔍 验证各集合数据量:');
  for (const collectionName of SYSTEM_COLLECTIONS) {
    try {
      const response = await fetch(`${QDRANT_URL}/collections/${collectionName}`);
      if (response.ok) {
        const info = await response.json();
        console.log(`   ${collectionName}: ${info.result.points_count} 条`);
      } else {
        console.log(`   ${collectionName}: 集合不存在`);
      }
    } catch (error) {
      console.log(`   ${collectionName}: 获取失败`);
    }
  }

  console.log('\n✅ 所有数据导入完成！');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ 批量导入失败:', error);
    process.exit(1);
  });

/**
 * 重新创建集合，使用正确的向量维度（1024维，匹配Aliyun text-embedding-v4）
 */

import fetch from 'node-fetch';

const QDRANT_URL = 'http://localhost:6333';
const EMBEDDING_DIMENSION = 1024; // Aliyun text-embedding-v4 dimension

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

async function deleteCollection(collectionName) {
  const response = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(collectionName)}`, {
    method: 'DELETE'
  });
  return response.json();
}

async function createCollection(collectionName) {
  const response = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(collectionName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: {
        size: EMBEDDING_DIMENSION,
        distance: 'Cosine'
      }
    })
  });
  return response.json();
}

async function getCollectionInfo(collectionName) {
  const response = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(collectionName)}`);
  return response.json();
}

async function main() {
  console.log('🔧 重新创建知识库集合，使用正确的向量维度...\n');
  console.log(`📏 目标维度: ${EMBEDDING_DIMENSION}D (Aliyun text-embedding-v4)\n`);

  let successCount = 0;
  let failedCount = 0;

  for (const collectionName of SYSTEM_COLLECTIONS) {
    console.log(`📦 处理集合: ${collectionName}`);

    try {
      // 1. 获取当前集合信息
      const info = await getCollectionInfo(collectionName);

      if (info.status === 'ok') {
        const currentDimension = info.result.config.params.vectors.size;
        console.log(`   当前维度: ${currentDimension}D`);

        if (currentDimension === EMBEDDING_DIMENSION) {
          console.log(`   ✅ 维度正确，跳过\n`);
          successCount++;
          continue;
        }

        // 2. 删除旧集合
        console.log(`   🗑️  删除旧集合...`);
        await deleteCollection(collectionName);
        console.log(`   ✅ 删除成功`);
      }

      // 3. 创建新集合
      console.log(`   🆕 创建新集合 (${EMBEDDING_DIMENSION}D)...`);
      const createResult = await createCollection(collectionName);

      if (createResult.status === 'ok') {
        console.log(`   ✅ 创建成功\n`);
        successCount++;
      } else {
        console.log(`   ❌ 创建失败:`, createResult);
        failedCount++;
      }

    } catch (error) {
      console.error(`   ❌ 处理失败:`, error.message, '\n');
      failedCount++;
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 处理结果统计:\n');
  console.log(`   成功: ${successCount}`);
  console.log(`   失败: ${failedCount}`);
  console.log(`   总计: ${SYSTEM_COLLECTIONS.length}`);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 验证最终状态
  console.log('🔍 验证集合状态:\n');
  for (const collectionName of SYSTEM_COLLECTIONS) {
    try {
      const info = await getCollectionInfo(collectionName);
      if (info.status === 'ok') {
        console.log(`   ✅ ${collectionName}`);
        console.log(`      维度: ${info.result.config.params.vectors.size}D`);
        console.log(`      点数: ${info.result.points_count}`);
      } else {
        console.log(`   ❌ ${collectionName}: 不存在`);
      }
    } catch (error) {
      console.log(`   ❌ ${collectionName}: 获取失败`);
    }
  }

  console.log('\n✅ 集合重建完成！');
  console.log('\n💡 下一步: 运行导入脚本');
  console.log('   node scripts/importKnowledgeToAllSystems.mjs');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ 操作失败:', error);
    process.exit(1);
  });

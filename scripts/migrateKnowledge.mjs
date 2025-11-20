/**
 * 迁移知识库数据脚本
 * 将 test_knowledge 集合的数据复制到 test_knowledge_实物2.0
 */

import fetch from 'node-fetch';

const QDRANT_URL = 'http://localhost:6333';

async function main() {
  try {
    console.log('🚀 开始迁移知识库数据...\n');

    const sourceCollection = 'test_knowledge';
    const targetCollection = 'test_knowledge_实物2.0';

    // URL 编码集合名称
    const sourceCollectionEncoded = encodeURIComponent(sourceCollection);
    const targetCollectionEncoded = encodeURIComponent(targetCollection);

    // 1. 获取源集合的所有点
    console.log(`📥 从 ${sourceCollection} 获取所有知识点...`);
    const scrollResponse = await fetch(`${QDRANT_URL}/collections/${sourceCollectionEncoded}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 100,
        with_payload: true,
        with_vector: true
      })
    });

    const scrollData = await scrollResponse.json();
    const points = scrollData.result.points;
    console.log(`   ✅ 获取到 ${points.length} 个知识点\n`);

    if (points.length === 0) {
      console.log('⚠️  源集合为空，无需迁移');
      return;
    }

    // 2. 将点批量插入到目标集合
    console.log(`📤 将知识点复制到 ${targetCollection}...`);

    const upsertResponse = await fetch(`${QDRANT_URL}/collections/${targetCollectionEncoded}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: points.map(point => ({
          id: point.id,
          vector: point.vector,
          payload: point.payload
        }))
      })
    });

    const upsertData = await upsertResponse.json();

    if (upsertData.status === 'ok') {
      console.log(`   ✅ 成功复制 ${points.length} 个知识点\n`);
    } else {
      console.error('   ❌ 复制失败:', upsertData);
      return;
    }

    // 3. 验证目标集合
    console.log('🔍 验证目标集合...');
    const targetInfoResponse = await fetch(`${QDRANT_URL}/collections/${targetCollectionEncoded}`);
    const targetInfo = await targetInfoResponse.json();
    console.log(`   ✅ 目标集合 ${targetCollection}`);
    console.log(`      - 知识点数: ${targetInfo.result.points_count}`);
    console.log(`      - 向量维度: ${targetInfo.result.config.params.vectors.size}`);
    console.log('');

    // 4. 显示迁移后的集合状态
    console.log('📊 所有知识库集合状态:');
    const collectionsResponse = await fetch(`${QDRANT_URL}/collections`);
    const collectionsData = await collectionsResponse.json();

    for (const collection of collectionsData.result.collections) {
      const infoResponse = await fetch(`${QDRANT_URL}/collections/${collection.name}`);
      const info = await infoResponse.json();
      console.log(`   - ${collection.name}`);
      console.log(`     知识点数: ${info.result.points_count}`);
    }

    console.log('\n✅ 迁移完成！');
    console.log('\n💡 下一步建议:');
    console.log('   1. 验证 test_knowledge_实物2.0 集合中的数据是否正确');
    console.log('   2. 确认后可以删除旧的 test_knowledge 集合');
    console.log('   3. 删除命令: curl -X DELETE "http://localhost:6333/collections/test_knowledge"');

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

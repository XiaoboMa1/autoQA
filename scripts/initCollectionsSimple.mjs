/**
 * 简单的知识库集合初始化脚本（使用纯 Node.js）
 */

import fetch from 'node-fetch';
import { Client } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

dotenv.config();

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const EMBEDDING_DIMENSION = 1536; // Google Gemini embedding dimension

async function main() {
  try {
    console.log('🚀 开始初始化知识库集合...\n');

    // 创建 Qdrant 客户端
    const qdrant = new Client({ url: QDRANT_URL });

    // 1. 获取现有集合
    console.log('🔍 检查现有集合...');
    const collections = await qdrant.getCollections();
    const existingCollections = collections.collections.map(c => c.name);
    console.log('   现有集合:', existingCollections.join(', '));
    console.log('');

    // 2. 定义需要创建的系统及其对应集合
    const systemCollections = [
      {
        systemName: '实物2.0',
        collectionName: 'test_knowledge', // 保留现有集合
        action: 'skip' // 跳过，已存在且已使用
      },
      {
        systemName: '渠道集采',
        collectionName: 'test_knowledge_渠道集采',
        action: 'create'
      },
      {
        systemName: '拍卖',
        collectionName: 'test_knowledge_拍卖',
        action: 'create'
      }
      // 可以继续添加更多系统
    ];

    // 3. 处理每个系统的集合
    for (const { systemName, collectionName, action } of systemCollections) {
      console.log(`📦 处理系统: ${systemName}`);
      console.log(`   集合名称: ${collectionName}`);

      if (action === 'skip') {
        console.log(`   ⏭️  跳过 - 保留现有集合`);
        console.log('');
        continue;
      }

      if (existingCollections.includes(collectionName)) {
        console.log(`   ✅ 集合已存在`);
      } else {
        console.log(`   ⚠️  集合不存在，正在创建...`);

        try {
          await qdrant.createCollection(collectionName, {
            vectors: {
              size: EMBEDDING_DIMENSION,
              distance: 'Cosine'
            }
          });
          console.log(`   ✅ 集合创建成功`);
        } catch (error) {
          console.error(`   ❌ 创建失败:`, error.message);
        }
      }
      console.log('');
    }

    // 4. 显示最终所有集合
    console.log('📊 Qdrant 中的所有集合:');
    const finalCollections = await qdrant.getCollections();
    for (const collection of finalCollections.collections) {
      const info = await qdrant.getCollection(collection.name);
      console.log(`   - ${collection.name}`);
      console.log(`     向量数: ${info.points_count}`);
      console.log(`     向量维度: ${info.config.params.vectors.size}`);
    }

    console.log('\n✅ 知识库集合初始化完成！');

  } catch (error) {
    console.error('❌ 初始化失败:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

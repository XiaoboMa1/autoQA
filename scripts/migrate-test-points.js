/**
 * 数据迁移脚本：将 functional_test_cases 表中的 test_points JSON 字段
 * 迁移到独立的 functional_test_points 表
 */

import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function migrateTestPoints() {
  console.log('🚀 开始迁移测试点数据...\n');

  try {
    // 1. 查询所有有 test_points 的测试用例
    const testCases = await prisma.$queryRaw`
      SELECT id, name, test_points
      FROM functional_test_cases
      WHERE test_points IS NOT NULL
    `;

    console.log(`📊 找到 ${testCases.length} 个包含测试点的用例\n`);

    if (testCases.length === 0) {
      console.log('✅ 没有需要迁移的数据');
      return;
    }

    // 2. 遍历每个测试用例，将其测试点迁移到新表
    let totalMigrated = 0;

    for (const testCase of testCases) {
      console.log(`处理用例 #${testCase.id}: ${testCase.name}`);

      // 解析 test_points JSON
      let testPoints = [];
      try {
        testPoints = JSON.parse(testCase.test_points);
      } catch (e) {
        console.error(`  ❌ 解析 test_points 失败:`, e);
        continue;
      }

      if (!Array.isArray(testPoints) || testPoints.length === 0) {
        console.log(`  ⚠️  test_points 不是有效数组，跳过`);
        continue;
      }

      console.log(`  发现 ${testPoints.length} 个测试点`);

      // 3. 插入测试点到新表
      for (let i = 0; i < testPoints.length; i++) {
        const point = testPoints[i];

        try {
          await prisma.$executeRaw`
            INSERT INTO functional_test_points
            (test_case_id, test_point_index, test_point_name, steps, expected_result, risk_level, created_at, updated_at)
            VALUES (
              ${testCase.id},
              ${i + 1},
              ${point.testPoint || ''},
              ${point.steps || ''},
              ${point.expectedResult || ''},
              ${point.riskLevel || 'medium'},
              NOW(),
              NOW()
            )
          `;
          totalMigrated++;
          console.log(`    ✓ 测试点 ${i + 1}/${testPoints.length} 已迁移`);
        } catch (e) {
          console.error(`    ❌ 迁移测试点 ${i + 1} 失败:`, e.message);
        }
      }

      console.log('');
    }

    console.log(`\n✅ 迁移完成！共迁移 ${totalMigrated} 个测试点\n`);

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行迁移
migrateTestPoints()
  .then(() => {
    console.log('🎉 迁移脚本执行成功');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 迁移脚本执行失败:', error);
    process.exit(1);
  });

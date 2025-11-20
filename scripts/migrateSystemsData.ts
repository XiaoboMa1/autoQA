/**
 * 数据迁移脚本：从现有测试用例中提取系统名称并导入系统字典表
 *
 * 使用方法：
 * npx tsx scripts/migrateSystemsData.ts
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function migrateSystemsData() {
  try {
    console.log('🚀 开始数据迁移...\n');

    // 1. 从 test_cases 表中提取唯一的系统名称
    console.log('📊 Step 1: 从 test_cases 表提取系统名称...');
    const testCasesResult = await prisma.test_cases.findMany({
      where: {
        system: {
          not: null
        }
      },
      select: {
        system: true
      },
      distinct: ['system']
    });

    const testCasesSystems = testCasesResult
      .map(tc => tc.system)
      .filter(Boolean) as string[];

    console.log(`   ✅ 找到 ${testCasesSystems.length} 个不同的系统名称`);

    // 2. 从 functional_test_cases 表中提取唯一的系统名称
    console.log('📊 Step 2: 从 functional_test_cases 表提取系统名称...');
    const functionalTestCasesResult = await prisma.functional_test_cases.findMany({
      where: {
        system: {
          not: null
        }
      },
      select: {
        system: true
      },
      distinct: ['system']
    });

    const functionalTestCasesSystems = functionalTestCasesResult
      .map(tc => tc.system)
      .filter(Boolean) as string[];

    console.log(`   ✅ 找到 ${functionalTestCasesSystems.length} 个不同的系统名称`);

    // 3. 合并并去重
    console.log('\n📊 Step 3: 合并并去重系统名称...');
    const allSystemsSet = new Set([...testCasesSystems, ...functionalTestCasesSystems]);
    const allSystems = Array.from(allSystemsSet).filter(s => s.trim().length > 0);

    console.log(`   ✅ 合并后共 ${allSystems.length} 个唯一系统名称:`);
    allSystems.forEach((sys, index) => {
      console.log(`      ${index + 1}. ${sys}`);
    });

    // 4. 检查哪些系统已存在于字典表中
    console.log('\n📊 Step 4: 检查已存在的系统...');
    const existingSystems = await prisma.systems.findMany({
      select: { name: true }
    });
    const existingSystemNames = new Set(existingSystems.map(s => s.name));

    console.log(`   ✅ 字典表中已有 ${existingSystems.length} 个系统`);

    // 5. 插入新系统到字典表
    console.log('\n📊 Step 5: 插入新系统到字典表...');
    const systemsToInsert = allSystems.filter(sys => !existingSystemNames.has(sys));

    if (systemsToInsert.length === 0) {
      console.log('   ℹ️  所有系统已存在，无需插入');
    } else {
      console.log(`   📝 将插入 ${systemsToInsert.length} 个新系统:`);

      for (let i = 0; i < systemsToInsert.length; i++) {
        const systemName = systemsToInsert[i];
        const sortOrder = (existingSystems.length + i) * 10;

        await prisma.systems.create({
          data: {
            name: systemName,
            status: 'active',
            sort_order: sortOrder
          }
        });

        console.log(`      ✅ ${i + 1}. ${systemName} (排序: ${sortOrder})`);
      }
    }

    // 6. 统计最终结果
    console.log('\n📊 Step 6: 统计最终结果...');
    const finalCount = await prisma.systems.count();
    const activeCount = await prisma.systems.count({ where: { status: 'active' } });

    console.log(`   ✅ 系统字典表总数: ${finalCount}`);
    console.log(`   ✅ 启用状态系统: ${activeCount}`);

    // 7. 数据验证
    console.log('\n📊 Step 7: 数据验证...');
    const testCasesWithSystem = await prisma.test_cases.count({
      where: { system: { not: null } }
    });
    const functionalTestCasesWithSystem = await prisma.functional_test_cases.count({
      where: { system: { not: null } }
    });

    console.log(`   ℹ️  test_cases 表中有系统字段的记录: ${testCasesWithSystem}`);
    console.log(`   ℹ️  functional_test_cases 表中有系统字段的记录: ${functionalTestCasesWithSystem}`);

    console.log('\n✅ 数据迁移完成！\n');
  } catch (error) {
    console.error('\n❌ 数据迁移失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行迁移
migrateSystemsData()
  .then(() => {
    console.log('🎉 脚本执行成功');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 脚本执行失败:', error);
    process.exit(1);
  });

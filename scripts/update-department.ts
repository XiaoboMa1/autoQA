import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function updateDepartment() {
  try {
    console.log('开始更新测试用例和测试套件的部门信息...\n');

    // 更新所有测试用例的部门为"V链部门"
    const updatedCases = await prisma.test_cases.updateMany({
      where: {
        OR: [
          { department: null },
          { department: '' }
        ]
      },
      data: {
        department: 'V链部门'
      }
    });

    console.log(`✅ 已更新 ${updatedCases.count} 个测试用例的部门为 "V链部门"`);

    // 更新所有测试套件的部门为"V链部门"
    const updatedSuites = await prisma.test_suites.updateMany({
      where: {
        OR: [
          { department: null },
          { department: '' }
        ]
      },
      data: {
        department: 'V链部门'
      }
    });

    console.log(`✅ 已更新 ${updatedSuites.count} 个测试套件的部门为 "V链部门"`);

    // 查询统计
    const totalCases = await prisma.test_cases.count();
    const totalSuites = await prisma.test_suites.count();
    const vChainCases = await prisma.test_cases.count({
      where: { department: 'V链部门' }
    });
    const vChainSuites = await prisma.test_suites.count({
      where: { department: 'V链部门' }
    });

    console.log('\n📊 统计信息:');
    console.log(`   测试用例总数: ${totalCases}, 其中V链部门: ${vChainCases}`);
    console.log(`   测试套件总数: ${totalSuites}, 其中V链部门: ${vChainSuites}`);

  } catch (error) {
    console.error('❌ 更新失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateDepartment();

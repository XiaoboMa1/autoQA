import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function changeDepartment() {
  try {
    console.log('开始将部门从"V链部门"更改为"V链"...\n');

    // 更新测试用例
    const updatedCases = await prisma.test_cases.updateMany({
      where: {
        department: 'V链部门'
      },
      data: {
        department: 'V链'
      }
    });

    console.log(`✅ 已更新 ${updatedCases.count} 个测试用例的部门为 "V链"`);

    // 更新测试套件
    const updatedSuites = await prisma.test_suites.updateMany({
      where: {
        department: 'V链部门'
      },
      data: {
        department: 'V链'
      }
    });

    console.log(`✅ 已更新 ${updatedSuites.count} 个测试套件的部门为 "V链"`);

    // 查询验证
    const vChainCases = await prisma.test_cases.count({
      where: { department: 'V链' }
    });
    const vChainSuites = await prisma.test_suites.count({
      where: { department: 'V链' }
    });
    const oldDeptCases = await prisma.test_cases.count({
      where: { department: 'V链部门' }
    });
    const oldDeptSuites = await prisma.test_suites.count({
      where: { department: 'V链部门' }
    });

    console.log('\n📊 验证结果:');
    console.log(`   V链部门的测试用例: ${vChainCases}`);
    console.log(`   V链部门的测试套件: ${vChainSuites}`);
    console.log(`   旧部门名称的测试用例: ${oldDeptCases}`);
    console.log(`   旧部门名称的测试套件: ${oldDeptSuites}`);

    if (oldDeptCases === 0 && oldDeptSuites === 0) {
      console.log('\n✅ 部门更新完成！所有数据已成功更新为"V链"');
    }

  } catch (error) {
    console.error('❌ 更新失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

changeDepartment();

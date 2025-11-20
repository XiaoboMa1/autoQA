import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function queryDepartments() {
  try {
    console.log('=== 部门统计信息 ===\n');

    // 1. 查询所有用户及其部门
    console.log('📋 用户部门列表：');
    const users = await prisma.users.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        department: true,
        account_name: true
      },
      orderBy: { department: 'asc' }
    });

    const userDepts = new Set<string>();
    users.forEach(user => {
      if (user.department) userDepts.add(user.department);
      console.log(`  ID: ${user.id}, 用户名: ${user.username}, 部门: ${user.department || '(未设置)'}`);
    });

    // 2. 查询所有测试用例及其部门
    console.log('\n\n📋 测试用例部门列表：');
    const testCases = await prisma.test_cases.findMany({
      select: {
        id: true,
        title: true,
        department: true,
        system: true,
        module: true
      },
      orderBy: { department: 'asc' }
    });

    const caseDepts = new Set<string>();
    testCases.forEach(testCase => {
      if (testCase.department) caseDepts.add(testCase.department);
      console.log(`  ID: ${testCase.id}, 标题: ${testCase.title}`);
      console.log(`      部门: ${testCase.department || '(未设置)'}, 系统: ${testCase.system || '(未设置)'}, 模块: ${testCase.module || '(未设置)'}`);
    });

    // 3. 查询所有测试套件及其部门
    console.log('\n\n📋 测试套件部门列表：');
    const testSuites = await prisma.test_suites.findMany({
      select: {
        id: true,
        name: true,
        department: true,
        owner_id: true,
        users: {
          select: {
            username: true
          }
        }
      },
      orderBy: { department: 'asc' }
    });

    const suiteDepts = new Set<string>();
    testSuites.forEach(suite => {
      if (suite.department) suiteDepts.add(suite.department);
      console.log(`  ID: ${suite.id}, 名称: ${suite.name}`);
      console.log(`      部门: ${suite.department || '(未设置)'}, 所有者: ${suite.users.username}`);
    });

    // 4. 统计汇总
    console.log('\n\n📊 部门统计汇总：');
    console.log(`\n用户部门 (${userDepts.size}个):`);
    if (userDepts.size > 0) {
      userDepts.forEach(dept => {
        const count = users.filter(u => u.department === dept).length;
        console.log(`  - ${dept}: ${count} 个用户`);
      });
    } else {
      console.log('  (无部门信息)');
    }

    console.log(`\n测试用例部门 (${caseDepts.size}个):`);
    if (caseDepts.size > 0) {
      caseDepts.forEach(dept => {
        const count = testCases.filter(c => c.department === dept).length;
        console.log(`  - ${dept}: ${count} 个测试用例`);
      });
    } else {
      console.log('  (无部门信息)');
    }

    console.log(`\n测试套件部门 (${suiteDepts.size}个):`);
    if (suiteDepts.size > 0) {
      suiteDepts.forEach(dept => {
        const count = testSuites.filter(s => s.department === dept).length;
        console.log(`  - ${dept}: ${count} 个测试套件`);
      });
    } else {
      console.log('  (无部门信息)');
    }

    // 5. 所有唯一部门列表
    const allDepts = new Set([...userDepts, ...caseDepts, ...suiteDepts]);
    console.log(`\n\n🏢 系统中的所有部门 (${allDepts.size}个):`);
    allDepts.forEach(dept => {
      console.log(`  - ${dept}`);
    });

  } catch (error) {
    console.error('❌ 查询失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

queryDepartments();

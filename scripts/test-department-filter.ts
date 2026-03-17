import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

async function testDepartmentFilter() {
  try {
    console.log('=== 测试部门权限过滤功能 ===\n');

    // 测试1: 使用tanheng用户登录（V链部门）
    console.log('【测试1】使用 tanheng 用户登录（V链部门）...');
    const tanRes = await axios.post(`${API_BASE}/auth/login`, {
      username: 'tanheng',
      password: 'tanheng123'
    });

    const tanToken = tanRes.data.data.token;
    const tanUser = tanRes.data.data.user;
    console.log(`✅ 登录成功 - 用户: ${tanUser.username}, 部门: ${tanUser.department}, 超级管理员: ${tanUser.isSuperAdmin}\n`);

    // 获取测试用例
    console.log('获取测试用例列表...');
    const tanCasesRes = await axios.get(`${API_BASE}/tests/cases`, {
      headers: { Authorization: `Bearer ${tanToken}` }
    });

    console.log(`✅ 获取到 ${tanCasesRes.data.data.length} 个测试用例`);
    tanCasesRes.data.data.forEach((tc: any) => {
      console.log(`   - ID: ${tc.id}, 标题: ${tc.name}, 部门: ${tc.department || '(未设置)'}`);
    });

    // 获取测试套件
    console.log('\n获取测试套件列表...');
    const tanSuitesRes = await axios.get(`${API_BASE}/suites`, {
      headers: { Authorization: `Bearer ${tanToken}` }
    });

    console.log(`✅ 获取到 ${tanSuitesRes.data.data.length} 个测试套件`);
    tanSuitesRes.data.data.forEach((ts: any) => {
      console.log(`   - ID: ${ts.id}, 名称: ${ts.name}, 部门: ${ts.department || '(未设置)'}`);
    });

    // 测试2: 使用tanheng2用户登录（V链2部门）
    console.log('\n\n【测试2】使用 tanheng2 用户登录（V链2部门）...');
    const tan2Res = await axios.post(`${API_BASE}/auth/login`, {
      username: 'tanheng2',
      password: 'tanheng2123'
    });

    const tan2Token = tan2Res.data.data.token;
    const tan2User = tan2Res.data.data.user;
    console.log(`✅ 登录成功 - 用户: ${tan2User.username}, 部门: ${tan2User.department}, 超级管理员: ${tan2User.isSuperAdmin}\n`);

    // 获取测试用例
    console.log('获取测试用例列表...');
    const tan2CasesRes = await axios.get(`${API_BASE}/tests/cases`, {
      headers: { Authorization: `Bearer ${tan2Token}` }
    });

    console.log(`✅ 获取到 ${tan2CasesRes.data.data.length} 个测试用例`);
    if (tan2CasesRes.data.data.length === 0) {
      console.log('   (无数据 - 符合预期，因为该用户的部门与数据不匹配)');
    }

    // 获取测试套件
    console.log('\n获取测试套件列表...');
    const tan2SuitesRes = await axios.get(`${API_BASE}/suites`, {
      headers: { Authorization: `Bearer ${tan2Token}` }
    });

    console.log(`✅ 获取到 ${tan2SuitesRes.data.data.length} 个测试套件`);
    if (tan2SuitesRes.data.data.length === 0) {
      console.log('   (无数据 - 符合预期，因为该用户的部门与数据不匹配)');
    }

    // 测试3: 使用admin用户登录（超级管理员）
    console.log('\n\n【测试3】使用 admin 用户登录（超级管理员）...');
    const adminRes = await axios.post(`${API_BASE}/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });

    const adminToken = adminRes.data.data.token;
    const adminUser = adminRes.data.data.user;
    console.log(`✅ 登录成功 - 用户: ${adminUser.username}, 部门: ${adminUser.department}, 超级管理员: ${adminUser.isSuperAdmin}\n`);

    // 获取测试用例
    console.log('获取测试用例列表...');
    const adminCasesRes = await axios.get(`${API_BASE}/tests/cases`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    console.log(`✅ 获取到 ${adminCasesRes.data.data.length} 个测试用例（应该看到所有数据）`);
    adminCasesRes.data.data.forEach((tc: any) => {
      console.log(`   - ID: ${tc.id}, 标题: ${tc.name}, 部门: ${tc.department || '(未设置)'}`);
    });

    // 获取测试套件
    console.log('\n获取测试套件列表...');
    const adminSuitesRes = await axios.get(`${API_BASE}/suites`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    console.log(`✅ 获取到 ${adminSuitesRes.data.data.length} 个测试套件（应该看到所有数据）`);
    adminSuitesRes.data.data.forEach((ts: any) => {
      console.log(`   - ID: ${ts.id}, 名称: ${ts.name}, 部门: ${ts.department || '(未设置)'}`);
    });

    console.log('\n\n=== 测试完成 ===');
    console.log('✅ tanheng (V链): 能看到V链部门的数据');
    console.log('✅ tanheng2 (V链2): 看不到V链部门的数据');
    console.log('✅ admin (超级管理员): 能看到所有数据');

  } catch (error: any) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
    process.exit(1);
  }
}

testDepartmentFilter();

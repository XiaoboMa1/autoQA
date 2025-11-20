#!/usr/bin/env node

/**
 * 🧹 项目调试文件清理工具
 * 安全清理项目根目录下的调试和测试文件
 */

const fs = require('fs');
const path = require('path');

// 配置
const config = {
  // 需要清理的文件模式
  cleanupPatterns: [
    'debug-*.js',
    'test-*.js',
    'check-*.js',
    'verify-*.js', 
    'simple-*.js',
    'diagnose-*.js',
    'collect-*.js',
    'force-*.js',
    'quick-*.html',
    'mcp-*.log',
    '*.log'
  ],
  
  // 需要保留的文件
  keepFiles: [
    'test-suite-demo.html', // 演示文件
    'jest.config.js',       // Jest配置
    'playwright.config.js'  // Playwright配置
  ],
  
  // 需要保留的目录
  keepDirs: [
    'tests',         // 正式测试目录
    'node_modules',  // 依赖目录
    'scripts'        // 脚本目录
  ],
  
  // 备份目录
  backupDir: 'temp/debug-backup',
  
  // 是否进行备份
  createBackup: true
};

/**
 * 获取匹配的文件列表
 */
function getMatchingFiles() {
  const projectRoot = path.join(__dirname, '..');
  const allFiles = fs.readdirSync(projectRoot);
  const matchingFiles = [];
  
  for (const file of allFiles) {
    const filePath = path.join(projectRoot, file);
    const stat = fs.statSync(filePath);
    
    // 跳过目录
    if (stat.isDirectory()) continue;
    
    // 跳过需要保留的文件
    if (config.keepFiles.includes(file)) continue;
    
    // 检查是否匹配清理模式
    const shouldClean = config.cleanupPatterns.some(pattern => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(file);
    });
    
    if (shouldClean) {
      matchingFiles.push({
        name: file,
        path: filePath,
        size: stat.size,
        mtime: stat.mtime
      });
    }
  }
  
  return matchingFiles;
}

/**
 * 创建备份
 */
function createBackup(files) {
  if (!config.createBackup) return;
  
  const backupPath = path.join(__dirname, '..', config.backupDir);
  
  // 创建备份目录
  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true });
  }
  
  console.log(`📦 创建备份到: ${backupPath}`);
  
  const backupManifest = {
    timestamp: new Date().toISOString(),
    files: []
  };
  
  for (const file of files) {
    const backupFilePath = path.join(backupPath, file.name);
    fs.copyFileSync(file.path, backupFilePath);
    
    backupManifest.files.push({
      name: file.name,
      originalPath: file.path,
      backupPath: backupFilePath,
      size: file.size,
      mtime: file.mtime
    });
    
    console.log(`   ✓ ${file.name} (${(file.size/1024).toFixed(1)}KB)`);
  }
  
  // 保存备份清单
  fs.writeFileSync(
    path.join(backupPath, 'backup-manifest.json'), 
    JSON.stringify(backupManifest, null, 2)
  );
  
  console.log(`✅ 备份完成，共 ${files.length} 个文件\n`);
}

/**
 * 删除文件
 */
function deleteFiles(files) {
  console.log(`🗑️  开始删除文件...\n`);
  
  let deletedCount = 0;
  let totalSize = 0;
  
  for (const file of files) {
    try {
      fs.unlinkSync(file.path);
      deletedCount++;
      totalSize += file.size;
      console.log(`   ✓ 删除: ${file.name}`);
    } catch (error) {
      console.error(`   ❌ 删除失败: ${file.name} - ${error.message}`);
    }
  }
  
  console.log(`\n✅ 删除完成！`);
  console.log(`   - 删除文件: ${deletedCount} 个`);
  console.log(`   - 释放空间: ${(totalSize/1024).toFixed(1)}KB`);
}

/**
 * 显示文件统计
 */
function showFileStats(files) {
  console.log(`\n📊 文件统计:`);
  
  // 按类型分组
  const typeGroups = {};
  let totalSize = 0;
  
  for (const file of files) {
    const ext = path.extname(file.name);
    const prefix = file.name.split('-')[0];
    const type = `${prefix}${ext}`;
    
    if (!typeGroups[type]) {
      typeGroups[type] = { count: 0, size: 0, files: [] };
    }
    
    typeGroups[type].count++;
    typeGroups[type].size += file.size;
    typeGroups[type].files.push(file.name);
    totalSize += file.size;
  }
  
  // 显示统计
  console.log(`   总文件数: ${files.length} 个`);
  console.log(`   总大小: ${(totalSize/1024).toFixed(1)}KB\n`);
  
  console.log(`   文件类型分布:`);
  for (const [type, info] of Object.entries(typeGroups)) {
    console.log(`     ${type}: ${info.count} 个 (${(info.size/1024).toFixed(1)}KB)`);
  }
}

/**
 * 生成恢复脚本
 */
function generateRestoreScript() {
  const restoreScript = `#!/usr/bin/env node

/**
 * 🔄 调试文件恢复脚本
 * 从备份恢复被删除的调试文件
 */

const fs = require('fs');
const path = require('path');

const backupDir = '${config.backupDir}';
const manifestPath = path.join(__dirname, '..', backupDir, 'backup-manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('❌ 找不到备份清单文件');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log('🔄 开始恢复文件...');
console.log(\`备份时间: \${manifest.timestamp}\`);

let restoredCount = 0;

for (const file of manifest.files) {
  try {
    if (fs.existsSync(file.backupPath)) {
      fs.copyFileSync(file.backupPath, file.originalPath);
      console.log(\`   ✓ 恢复: \${file.name}\`);
      restoredCount++;
    } else {
      console.warn(\`   ⚠️  备份文件不存在: \${file.name}\`);
    }
  } catch (error) {
    console.error(\`   ❌ 恢复失败: \${file.name} - \${error.message}\`);
  }
}

console.log(\`\\n✅ 恢复完成！共恢复 \${restoredCount} 个文件\`);
`;

  const restoreScriptPath = path.join(__dirname, 'restore-debug-files.js');
  fs.writeFileSync(restoreScriptPath, restoreScript);
  console.log(`📄 生成恢复脚本: ${restoreScriptPath}`);
}

/**
 * 主函数
 */
function main() {
  console.log('🧹 项目调试文件清理工具\n');
  
  // 获取匹配的文件
  const files = getMatchingFiles();
  
  if (files.length === 0) {
    console.log('✨ 项目很干净，没有找到需要清理的文件！');
    return;
  }
  
  // 显示统计信息
  showFileStats(files);
  
  // 显示将要清理的文件列表
  console.log(`\n📋 将要清理的文件:`);
  files.forEach(file => {
    console.log(`   - ${file.name} (${(file.size/1024).toFixed(1)}KB)`);
  });
  
  // 询问用户确认
  console.log(`\n⚠️  即将删除 ${files.length} 个文件，是否继续？`);
  console.log('   备份: ' + (config.createBackup ? '是' : '否'));
  
  // 在实际使用时，这里应该有用户交互确认
  // 为了演示，我们只是输出信息
  console.log('\n💡 使用方式:');
  console.log('   1. 检查上面的文件列表');
  console.log('   2. 确认无误后运行: node scripts/cleanup-debug-files.js --confirm');
  console.log('   3. 如需恢复: node scripts/restore-debug-files.js');
  
  // 检查是否有确认参数
  if (process.argv.includes('--confirm')) {
    // 创建备份
    if (config.createBackup) {
      createBackup(files);
    }
    
    // 删除文件
    deleteFiles(files);
    
    // 生成恢复脚本
    if (config.createBackup) {
      generateRestoreScript();
    }
    
    console.log('\n🎉 清理完成！项目更加整洁了！');
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { getMatchingFiles, config };
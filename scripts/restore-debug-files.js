#!/usr/bin/env node

/**
 * 🔄 调试文件恢复脚本
 * 从备份恢复被删除的调试文件
 */

const fs = require('fs');
const path = require('path');

const backupDir = 'temp/debug-backup';
const manifestPath = path.join(__dirname, '..', backupDir, 'backup-manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('❌ 找不到备份清单文件');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log('🔄 开始恢复文件...');
console.log(`备份时间: ${manifest.timestamp}`);

let restoredCount = 0;

for (const file of manifest.files) {
  try {
    if (fs.existsSync(file.backupPath)) {
      fs.copyFileSync(file.backupPath, file.originalPath);
      console.log(`   ✓ 恢复: ${file.name}`);
      restoredCount++;
    } else {
      console.warn(`   ⚠️  备份文件不存在: ${file.name}`);
    }
  } catch (error) {
    console.error(`   ❌ 恢复失败: ${file.name} - ${error.message}`);
  }
}

console.log(`\n✅ 恢复完成！共恢复 ${restoredCount} 个文件`);

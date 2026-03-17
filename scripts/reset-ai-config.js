// 临时脚本：重置AI配置，让系统从.env重新初始化
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

async function resetAIConfig() {
  try {
    console.log('🔄 开始重置AI配置...');

    // 删除现有的app_settings配置
    const result = await prisma.settings.deleteMany({
      where: {
        key: 'app_settings'
      }
    });

    console.log(`✅ 已删除 ${result.count} 条配置记录`);
    console.log('💡 请重启后端服务，系统将从 .env 文件重新初始化AI配置');

  } catch (error) {
    console.error('❌ 重置失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetAIConfig();
/**
 * 时区处理工具
 * 
 * ✅ 修复说明（2025-12-17）：
 * - 移除了所有手动的时区偏移处理
 * - 直接使用系统本地时间
 * - 依赖 MySQL 连接字符串中的时区配置来正确处理时区转换
 * 
 * 使用方法：
 * 1. 确保 DATABASE_URL 包含时区配置：
 *    mysql://user:pass@host:3306/db?timezone=Asia/Shanghai
 * 
 * 2. 在代码中使用 getNow() 获取当前时间：
 *    created_at: getNow()
 * 
 * 3. 不需要手动添加或减少时区偏移
 */

/**
 * 获取当前的中国时区时间（UTC+8）
 * ⚠️ 已废弃：请直接使用 getNow() 或 new Date()
 * @deprecated 使用 getNow() 代替
 */
export function getChinaTime(): Date {
  return new Date();
}

/**
 * 将 Date 对象转换为中国时区时间
 * ⚠️ 已废弃：不需要手动转换时区
 * @deprecated 直接使用原始 Date 对象
 * @param date - 需要转换的日期
 */
export function toChinaTime(date: Date): Date {
  return date;
}

/**
 * 获取当前时间（用于数据库存储）
 * 
 * ✅ 正确的实现：
 * - 直接返回系统本地时间
 * - MySQL 会根据连接字符串中的时区配置自动处理时区转换
 * - 不需要手动添加时区偏移，否则会导致时间被重复处理
 * 
 * 注意：
 * - 确保数据库连接字符串中包含正确的时区配置
 * - 例如：mysql://user:pass@host:3306/db?timezone=Asia/Shanghai
 */
export function getNow(): Date {
  // 直接返回本地时间，不做任何偏移处理
  return new Date();
}

/**
 * 格式化时间为本地时间字符串（YYYY-MM-DD HH:mm:ss）
 * @param date - 需要格式化的日期，默认为当前时间
 */
export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 格式化时间为本地时间字符串（带毫秒）
 * @param date - 需要格式化的日期，默认为当前时间
 */
export function formatDateTimeWithMs(date: Date = getNow()): string {
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${formatDateTime(date)}.${milliseconds}`;
}

export default {
  getChinaTime,
  toChinaTime,
  getNow,
  formatDateTime,
  formatDateTimeWithMs
};


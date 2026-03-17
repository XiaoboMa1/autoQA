import { Router } from 'express';
import { StreamService } from '../services/streamService.js';

const router = Router();

// 全局StreamService实例（在实际应用中应该通过依赖注入）
let streamService: StreamService;

// 初始化StreamService
export function initializeStreamService(service: StreamService) {
  streamService = service;
}

// 验证流访问token的辅助函数
function validateStreamToken(token: string, runId: string, userId: string): boolean {
  console.log(`🔐 [StreamRoute] 执行Token验证:`, {
    runId,
    userId,
    hasToken: !!token,
    tokenLength: token ? token.length : 0,
    tokenStart: token ? token.substring(0, 10) : 'null'
  });
  
  // 简化实现：在实际应用中应该验证JWT或其他安全token
  // 这里只做基础验证
  const isValid = token && token.length > 10;
  console.log(`🔐 [StreamRoute] Token验证完成:`, { runId, isValid });
  return isValid;
}

// 🔥 修正：添加客户端注销避免内存泄露
router.get('/api/stream/live/:runId', async (req, res) => {
  const { runId } = req.params;
  const userId = req.headers['user-id'] as string || 'anonymous';
  const token = req.query.token as string;
  
  console.log(`🔍 [StreamRoute] 收到实时流请求:`, {
    runId,
    userId,
    token: token ? token.substring(0, 10) + '...' : 'null',
    userAgent: req.headers['user-agent'],
    referer: req.headers.referer,
    origin: req.headers.origin
  });
  
  // 验证token
  const isValidToken = validateStreamToken(token, runId, userId);
  console.log(`🔐 [StreamRoute] Token验证结果:`, {
    runId,
    token: token ? token.substring(0, 10) + '...' : 'null',
    isValid: isValidToken,
    tokenLength: token ? token.length : 0
  });
  
  if (!token || !isValidToken) {
    console.error(`❌ [StreamRoute] Token验证失败:`, { runId, token });
    return res.status(401).json({ error: '无效的流访问token' });
  }
  
  if (!streamService) {
    console.error(`❌ [StreamRoute] StreamService未初始化:`, { runId });
    return res.status(500).json({ error: 'StreamService未初始化' });
  }
  
  console.log(`🎬 [StreamRoute] 开始注册客户端:`, { runId, userId });
  
  try {
    await streamService.registerClient(runId, res, userId);
    console.log(`✅ [StreamRoute] 客户端注册成功:`, { runId, userId });
  } catch (error) {
    console.error(`❌ [StreamRoute] 客户端注册失败:`, { runId, userId, error });
    return;
  }
  
  // 🔥 修复：增强连接生命周期管理
  const cleanup = () => {
    try {
      streamService.unregisterClient(runId, res);
    } catch (cleanupError) {
      console.warn(`🧹 [StreamRoute] 清理时出错:`, { runId, userId, cleanupError });
    }
  };

  req.on('close', () => {
    console.log(`🔌 [StreamRoute] 客户端连接关闭:`, { runId, userId });
    cleanup();
  });
  
  req.on('error', (error: any) => {
    const errorCode = error.code || 'UNKNOWN';
    if (errorCode === 'ECONNRESET') {
      console.log(`🔌 [StreamRoute] 客户端连接重置 (ECONNRESET):`, { runId, userId });
    } else {
      console.error(`💥 [StreamRoute] 客户端连接错误 (${errorCode}):`, { 
        runId, 
        userId, 
        errorCode,
        errorMessage: error.message 
      });
    }
    cleanup();
  });

  req.on('aborted', () => {
    console.log(`⏹️ [StreamRoute] 客户端连接中止:`, { runId, userId });
    cleanup();
  });

  // 🔥 新增：响应错误处理
  res.on('error', (error: any) => {
    const errorCode = error.code || 'UNKNOWN';
    console.warn(`📤 [StreamRoute] 响应错误 (${errorCode}):`, { 
      runId, 
      userId, 
      errorCode,
      errorMessage: error.message 
    });
    cleanup();
  });

  res.on('close', () => {
    console.log(`📡 [StreamRoute] 响应连接关闭:`, { runId, userId });
    cleanup();
  });
});

// 获取流状态
router.get('/api/stream/status/:runId', (req, res) => {
  const { runId } = req.params;
  
  if (!streamService) {
    return res.status(500).json({ error: 'StreamService未初始化' });
  }
  
  // 这里可以添加获取流状态的逻辑
  res.json({
    success: true,
    data: {
      runId,
      active: true, // 简化实现
      clientCount: 0 // 简化实现
    }
  });
});

// 🔥 新增：获取方案C性能统计
router.get('/api/stream/stats', (req, res) => {
  try {
    if (!streamService) {
      return res.status(500).json({ error: 'StreamService未初始化' });
    }
    
    const stats = streamService.getPerformanceStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        message: '方案C：文件移动策略统计数据',
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error: any) {
    console.error('获取流统计失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔥 新增：重置方案C统计
router.post('/api/stream/stats/reset', (req, res) => {
  try {
    if (!streamService) {
      return res.status(500).json({ error: 'StreamService未初始化' });
    }
    
    streamService.resetStats();
    
    res.json({
      success: true,
      message: '方案C统计数据已重置',
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('重置流统计失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
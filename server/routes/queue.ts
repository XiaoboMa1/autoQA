import { Router } from 'express';
import { QueueService } from '../services/queueService.js';

const router = Router();

// 全局QueueService实例（在实际应用中应该通过依赖注入）
let queueService: QueueService;

// 初始化QueueService
export function initializeQueueService(service: QueueService) {
  queueService = service;
}

// 获取队列状态
router.get('/api/queue/status', (req, res) => {
  try {
    if (!queueService) {
      return res.status(500).json({ error: 'QueueService未初始化' });
    }
    
    const status = queueService.getQueueStatus();
    
    res.json({
      success: true,
      data: status
    });
    
  } catch (error: any) {
    console.error('获取队列状态失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 取消队列中的任务
router.post('/api/queue/cancel/:taskId', async (req, res) => {
  const { taskId } = req.params;
  
  try {
    if (!queueService) {
      return res.status(500).json({ error: 'QueueService未初始化' });
    }
    
    const cancelled = await queueService.cancelTask(taskId);
    
    res.json({
      success: true,
      data: {
        taskId,
        cancelled
      }
    });
    
  } catch (error: any) {
    console.error('取消任务失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 检查任务是否已被取消
router.get('/api/queue/cancelled/:taskId', (req, res) => {
  const { taskId } = req.params;
  
  try {
    if (!queueService) {
      return res.status(500).json({ error: 'QueueService未初始化' });
    }
    
    const cancelled = queueService.isCancelled(taskId);
    
    res.json({
      success: true,
      data: {
        taskId,
        cancelled
      }
    });
    
  } catch (error: any) {
    console.error('检查任务状态失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
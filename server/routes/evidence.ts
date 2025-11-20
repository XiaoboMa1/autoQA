import { Router } from 'express';
import { EvidenceService } from '../services/evidenceService.js';
import * as fs from 'fs';

const router = Router();

// 全局EvidenceService实例（在实际应用中应该通过依赖注入）
let evidenceService: EvidenceService;

// 初始化EvidenceService
export function initializeEvidenceService(service: EvidenceService) {
  evidenceService = service;
}

// 🔥 修正：支持Range请求的证据下载
router.get('/api/evidence/download/:runId/:filename', async (req, res) => {
  const { runId, filename } = req.params;
  const { expires, signature, download } = req.query;
  
  try {
    if (!evidenceService) {
      return res.status(500).json({ error: 'EvidenceService未初始化' });
    }
    
    // 验证签名
    if (!evidenceService.verifySignedUrl(runId, filename, expires as string, signature as string)) {
      return res.status(401).json({ error: '签名无效或已过期' });
    }
    
    const filePath = await evidenceService.getArtifactPath(runId, filename);
    const stats = await fs.promises.stat(filePath);
    
    // 设置响应头
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', stats.size);
    
    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="${download}"`);
    }
    
    // 🔥 修正：支持Range请求
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
      res.setHeader('Content-Length', chunksize);
      
      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
    
  } catch (error: any) {
    console.error('证据文件下载失败:', error);
    res.status(404).json({ error: '文件不存在' });
  }
});

// 获取运行的所有证据文件
router.get('/api/evidence/:runId/files', async (req, res) => {
  const { runId } = req.params;
  
  try {
    if (!evidenceService) {
      return res.status(500).json({ error: 'EvidenceService未初始化' });
    }
    
    const artifacts = await evidenceService.getRunArtifacts(runId);
    
    res.json({
      success: true,
      data: artifacts
    });
    
  } catch (error: any) {
    console.error('获取证据文件列表失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 生成证据文件的签名URL
router.get('/api/evidence/:runId/sign/:filename', async (req, res) => {
  const { runId, filename } = req.params;
  const { ttl, downloadName } = req.query;
  
  try {
    if (!evidenceService) {
      return res.status(500).json({ error: 'EvidenceService未初始化' });
    }
    
    const signedUrl = await evidenceService.generateSignedUrl(
      runId, 
      filename, 
      {
        ttlSeconds: ttl ? parseInt(ttl as string) : 600,
        downloadName: downloadName as string
      }
    );
    
    res.json({
      success: true,
      data: {
        signedUrl,
        expiresIn: ttl ? parseInt(ttl as string) : 600
      }
    });
    
  } catch (error: any) {
    console.error('生成签名URL失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 清理过期证据
router.post('/api/evidence/cleanup', async (req, res) => {
  const { retentionDays = 7 } = req.body;
  
  try {
    if (!evidenceService) {
      return res.status(500).json({ error: 'EvidenceService未初始化' });
    }
    
    const deletedCount = await evidenceService.cleanupExpiredEvidence(retentionDays);
    
    res.json({
      success: true,
      data: {
        deletedCount,
        retentionDays
      }
    });
    
  } catch (error: any) {
    console.error('清理过期证据失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
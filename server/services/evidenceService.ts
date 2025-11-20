import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '../../src/generated/prisma';

interface ArtifactRecord {
  runId: string;
  type: 'trace' | 'video' | 'screenshot' | 'log';
  filename: string;
  size: number;
  signedUrl?: string;
  expiresAt?: Date;
  createdAt: Date;
}

interface SignedUrlOptions {
  ttlSeconds?: number;  // 默认600秒
  downloadName?: string;
}

export class EvidenceService {
  private prisma: PrismaClient;
  private artifactsDir: string;
  private secretKey: string;
  private baseUrl: string;    // 🔥 修正：添加baseUrl支持绝对URL

  constructor(prisma: PrismaClient, artifactsDir: string, baseUrl: string) {
    this.prisma = prisma;
    this.artifactsDir = artifactsDir;
    this.baseUrl = baseUrl;
    this.secretKey = process.env.EVIDENCE_SECRET_KEY || 'default-secret-key';
    
    // 🔥 修复：初始化时确保artifacts目录存在
    this.initializeArtifactsDirectory();
  }

  // 🔥 新增：初始化artifacts目录
  private async initializeArtifactsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.artifactsDir, { recursive: true });
      console.log(`✅ EvidenceService: artifacts目录已确保存在: ${this.artifactsDir}`);
    } catch (error: any) {
      console.error(`❌ EvidenceService: 创建artifacts目录失败: ${error.message}`);
    }
  }

  // 🔥 修正：获取artifacts目录
  getArtifactsDir(): string {
    return this.artifactsDir;
  }

  // 🔥 修正：支持Buffer直接保存
  async saveBufferArtifact(
    runId: string, 
    type: ArtifactRecord['type'], 
    buffer: Buffer,
    filename: string
  ): Promise<ArtifactRecord> {
    const runDir = path.join(this.artifactsDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    const destPath = path.join(runDir, filename);
    
    // 直接保存Buffer到文件
    await fs.writeFile(destPath, buffer);
    
    const stats = await fs.stat(destPath);
    
    // 保存到数据库（如果数据库可用）
    try {
      await this.prisma.run_artifacts.create({
        data: {
          runId,
          type,
          filename,
          size: stats.size,
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.warn('保存证据记录到数据库失败:', error);
    }

    return {
      runId,
      type,
      filename,
      size: stats.size,
      createdAt: new Date()
    };
  }

  // 保存证据文件（从文件路径）
  async saveArtifact(
    runId: string, 
    type: ArtifactRecord['type'], 
    sourceFile: string,
    filename?: string
  ): Promise<ArtifactRecord> {
    const runDir = path.join(this.artifactsDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    const finalFilename = filename || path.basename(sourceFile);
    const destPath = path.join(runDir, finalFilename);
    
    // 移动文件到证据目录
    await fs.rename(sourceFile, destPath);
    
    const stats = await fs.stat(destPath);
    
    // 保存到数据库（如果数据库可用）
    try {
      await this.prisma.run_artifacts.create({
        data: {
          runId,
          type,
          filename: finalFilename,
          size: stats.size,
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.warn('保存证据记录到数据库失败:', error);
    }

    return {
      runId,
      type,
      filename: finalFilename,
      size: stats.size,
      createdAt: new Date()
    };
  }

  // 🔥 修正：生成绝对签名URL
  async generateSignedUrl(
    runId: string, 
    filename: string, 
    options: SignedUrlOptions = {}
  ): Promise<string> {
    const { ttlSeconds = 600, downloadName } = options;
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    
    // 创建签名
    const payload = `${runId}:${filename}:${expiresAt}`;
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(payload)
      .digest('hex');
    
    // 构造相对路径
    const relativePath = `/api/evidence/download/${runId}/${encodeURIComponent(filename)}?expires=${expiresAt}&signature=${signature}`;
    
    // 🔥 修正：构造绝对URL（用于Trace Viewer）
    const absoluteUrl = `${this.baseUrl}${relativePath}${downloadName ? `&download=${encodeURIComponent(downloadName)}` : ''}`;
    
    return absoluteUrl;
  }

  // 验证签名URL
  verifySignedUrl(runId: string, filename: string, expires: string, signature: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = parseInt(expires);
    
    if (expiresAt < now) {
      return false; // 已过期
    }
    
    const payload = `${runId}:${filename}:${expiresAt}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.secretKey)
      .update(payload)
      .digest('hex');
    
    return signature === expectedSignature;
  }

  // 获取证据文件
  async getArtifactPath(runId: string, filename: string): Promise<string> {
    const filePath = path.join(this.artifactsDir, runId, filename);
    
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      throw new Error(`证据文件不存在: ${filename}`);
    }
  }

  // 获取运行的所有证据文件
  async getRunArtifacts(runId: string): Promise<ArtifactRecord[]> {
    try {
      // 尝试从数据库获取
      const records = await this.prisma.run_artifacts.findMany({
        where: { runId },
        orderBy: { createdAt: 'desc' }
      });
      
      return records.map(record => ({
        runId: record.runId,
        type: record.type as ArtifactRecord['type'],
        filename: record.filename,
        size: Number(record.size),
        createdAt: record.createdAt
      }));
    } catch (error) {
      console.warn('从数据库获取证据记录失败，尝试从文件系统获取:', error);
      
      // 降级到文件系统扫描
      const runDir = path.join(this.artifactsDir, runId);
      try {
        const files = await fs.readdir(runDir);
        const artifacts: ArtifactRecord[] = [];
        
        for (const filename of files) {
          const filePath = path.join(runDir, filename);
          const stats = await fs.stat(filePath);
          
          // 根据文件扩展名推断类型
          let type: ArtifactRecord['type'] = 'log';
          if (filename.endsWith('.zip')) type = 'trace';
          else if (filename.endsWith('.webm') || filename.endsWith('.mp4')) type = 'video';
          else if (filename.endsWith('.png') || filename.endsWith('.jpg')) type = 'screenshot';
          
          artifacts.push({
            runId,
            type,
            filename,
            size: stats.size,
            createdAt: stats.birthtime
          });
        }
        
        return artifacts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } catch {
        return [];
      }
    }
  }

  // 清理过期证据
  async cleanupExpiredEvidence(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    let deletedCount = 0;
    
    try {
      // 查询过期记录
      const expiredRecords = await this.prisma.run_artifacts.findMany({
        where: {
          createdAt: {
            lt: cutoffDate
          }
        }
      });
      
      for (const record of expiredRecords) {
        try {
          // 删除文件
          const filePath = path.join(this.artifactsDir, record.runId, record.filename);
          await fs.unlink(filePath);
          
          // 删除数据库记录
          await this.prisma.run_artifacts.delete({
            where: { id: record.id }
          });
          
          deletedCount++;
        } catch (error) {
          console.warn(`清理证据文件失败: ${record.filename}`, error);
        }
      }
    } catch (error) {
      console.warn('数据库清理失败，尝试文件系统清理:', error);
      
      // 降级到文件系统清理
      try {
        const runDirs = await fs.readdir(this.artifactsDir);
        for (const runDir of runDirs) {
          const runPath = path.join(this.artifactsDir, runDir);
          const stats = await fs.stat(runPath);
          
          if (stats.isDirectory() && stats.birthtime < cutoffDate) {
            await fs.rmdir(runPath, { recursive: true });
            deletedCount++;
          }
        }
      } catch (fsError) {
        console.warn('文件系统清理也失败:', fsError);
      }
    }
    
    return deletedCount;
  }
}

export { ArtifactRecord, SignedUrlOptions };
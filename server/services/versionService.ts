import { PrismaClient } from '../../src/generated/prisma/index.js';
import crypto from 'crypto';
import { getNow } from '../utils/timezone.js';

export interface CaseVersion {
  id: number;
  case_id: number;
  version: number;
  steps: any;
  tags: any;
  system?: string;
  module?: string;
  meta?: any;
  created_by?: number;
  created_at?: Date;
  created_by_name?: string;
}

export interface VersionDiff {
  case_id: number;
  from_version: number;
  to_version: number;
  changes: Array<{
    type: 'added' | 'removed' | 'modified';
    path: string;
    old_value?: any;
    new_value?: any;
  }>;
}

export interface RollbackResult {
  success: boolean;
  case_id: number;
  rolled_back_to_version: number;
  new_version: number;
  error?: string;
}

/**
 * 版本控制服务
 * 负责管理测试用例的版本历史和回滚功能
 */
export class VersionService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * 为测试用例创建版本快照
   * @param caseId 测试用例ID
   * @param userId 创建用户ID
   * @returns 创建的版本信息
   */
  async createVersion(caseId: number, userId?: number): Promise<CaseVersion> {
    console.log(`🔄 [VersionService] 为用例 ${caseId} 创建版本快照...`);

    try {
      // 获取当前测试用例数据
      const testCase = await this.prisma.test_cases.findUnique({
        where: { id: caseId }
      });

      if (!testCase) {
        throw new Error(`测试用例 ${caseId} 不存在`);
      }

      // 获取当前最大版本号
      const maxVersionResult = await this.prisma.case_versions.findFirst({
        where: { case_id: caseId },
        orderBy: { version: 'desc' },
        select: { version: true }
      });

      const nextVersion = (maxVersionResult?.version || 0) + 1;

      console.log(`📋 [VersionService] 创建版本 v${nextVersion} for 用例 ${caseId}`);

      // 创建版本快照
      const version = await this.prisma.case_versions.create({
        data: {
          case_id: caseId,
          version: nextVersion,
          steps: testCase.steps,
          tags: testCase.tags,
          system: testCase.system,
          module: testCase.module,
          meta: {
            original_title: testCase.title,
            snapshot_reason: 'bulk_update_pre_apply',
            timestamp: getNow().toISOString()
          },
          created_by: userId || null,
          created_at: getNow()
        }
      });

      console.log(`✅ [VersionService] 版本快照创建成功: v${nextVersion} (ID: ${version.id})`);

      return {
        id: version.id,
        case_id: version.case_id,
        version: version.version,
        steps: version.steps,
        tags: version.tags,
        system: version.system,
        module: version.module,
        meta: version.meta,
        created_by: version.created_by,
        created_at: version.created_at
      };

    } catch (error: any) {
      console.error(`❌ [VersionService] 创建版本快照失败: ${error.message}`);
      throw new Error(`创建版本快照失败: ${error.message}`);
    }
  }

  /**
   * 获取测试用例的版本历史
   * @param caseId 测试用例ID
   * @returns 版本历史列表
   */
  async getVersionHistory(caseId: number): Promise<CaseVersion[]> {
    console.log(`📋 [VersionService] 获取用例 ${caseId} 的版本历史...`);

    try {
      const versions = await this.prisma.case_versions.findMany({
        where: { case_id: caseId },
        include: {
          users: {
            select: { email: true }
          }
        },
        orderBy: { version: 'desc' }
      });

      console.log(`📊 [VersionService] 找到 ${versions.length} 个历史版本`);

      return versions.map(v => ({
        id: v.id,
        case_id: v.case_id,
        version: v.version,
        steps: v.steps,
        tags: v.tags,
        system: v.system,
        module: v.module,
        meta: v.meta,
        created_by: v.created_by,
        created_at: v.created_at,
        created_by_name: v.users?.email || '系统'
      }));

    } catch (error: any) {
      console.error(`❌ [VersionService] 获取版本历史失败: ${error.message}`);
      throw new Error(`获取版本历史失败: ${error.message}`);
    }
  }

  /**
   * 比较两个版本的差异
   * @param caseId 测试用例ID
   * @param fromVersion 源版本
   * @param toVersion 目标版本
   * @returns 版本差异详情
   */
  async compareVersions(caseId: number, fromVersion: number, toVersion: number): Promise<VersionDiff> {
    console.log(`🔍 [VersionService] 比较用例 ${caseId} 的版本: v${fromVersion} vs v${toVersion}`);

    try {
      // 获取两个版本的数据
      const [fromVersionData, toVersionData] = await Promise.all([
        this.prisma.case_versions.findFirst({
          where: { case_id: caseId, version: fromVersion }
        }),
        this.prisma.case_versions.findFirst({
          where: { case_id: caseId, version: toVersion }
        })
      ]);

      if (!fromVersionData || !toVersionData) {
        throw new Error('指定的版本不存在');
      }

      // 简单的差异计算（实际项目中可以使用更复杂的diff算法）
      const changes = this.calculateDifferences(
        fromVersionData.steps,
        toVersionData.steps
      );

      console.log(`📊 [VersionService] 发现 ${changes.length} 处变更`);

      return {
        case_id: caseId,
        from_version: fromVersion,
        to_version: toVersion,
        changes
      };

    } catch (error: any) {
      console.error(`❌ [VersionService] 版本比较失败: ${error.message}`);
      throw new Error(`版本比较失败: ${error.message}`);
    }
  }

  /**
   * 回滚测试用例到指定版本
   * @param caseId 测试用例ID
   * @param toVersion 目标版本号
   * @param userId 操作用户ID
   * @returns 回滚结果
   */
  async rollbackTestCase(caseId: number, toVersion: number, userId?: number): Promise<RollbackResult> {
    console.log(`🔄 [VersionService] 回滚用例 ${caseId} 到版本 v${toVersion}...`);

    try {
      // 获取目标版本数据
      const targetVersion = await this.prisma.case_versions.findFirst({
        where: { case_id: caseId, version: toVersion }
      });

      if (!targetVersion) {
        throw new Error(`版本 v${toVersion} 不存在`);
      }

      // 先创建当前状态的备份版本
      const backupVersion = await this.createVersion(caseId, userId);

      // 更新测试用例到目标版本的内容
      await this.prisma.test_cases.update({
        where: { id: caseId },
        data: {
          steps: targetVersion.steps,
          tags: targetVersion.tags,
          system: targetVersion.system,
          module: targetVersion.module
        }
      });

      console.log(`✅ [VersionService] 成功回滚到 v${toVersion}，备份版本: v${backupVersion.version}`);

      return {
        success: true,
        case_id: caseId,
        rolled_back_to_version: toVersion,
        new_version: backupVersion.version
      };

    } catch (error: any) {
      console.error(`❌ [VersionService] 回滚失败: ${error.message}`);
      return {
        success: false,
        case_id: caseId,
        rolled_back_to_version: toVersion,
        new_version: 0,
        error: error.message
      };
    }
  }

  /**
   * 计算内容哈希（用于检测变更）
   * @param content 内容对象
   * @returns SHA256哈希值
   */
  public calculateHash(content: any): string {
    const contentStr = JSON.stringify(content, Object.keys(content).sort());
    return crypto.createHash('sha256').update(contentStr).digest('hex');
  }

  /**
   * 检查用例是否有未保存的变更
   * @param caseId 测试用例ID
   * @returns 是否有变更
   */
  async hasUncommittedChanges(caseId: number): Promise<boolean> {
    try {
      // 获取当前用例内容
      const currentCase = await this.prisma.test_cases.findUnique({
        where: { id: caseId }
      });

      if (!currentCase) {
        return false;
      }

      // 获取最新版本
      const latestVersion = await this.prisma.case_versions.findFirst({
        where: { case_id: caseId },
        orderBy: { version: 'desc' }
      });

      if (!latestVersion) {
        return true; // 没有版本历史，说明有变更
      }

      // 比较哈希值
      const currentHash = this.calculateHash({
        steps: currentCase.steps,
        tags: currentCase.tags,
        system: currentCase.system,
        module: currentCase.module
      });

      const versionHash = this.calculateHash({
        steps: latestVersion.steps,
        tags: latestVersion.tags,
        system: latestVersion.system,
        module: latestVersion.module
      });

      return currentHash !== versionHash;

    } catch (error: any) {
      console.error(`❌ [VersionService] 检查变更状态失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 简单的内容差异计算
   * @private
   */
  private calculateDifferences(fromContent: any, toContent: any): Array<any> {
    const changes: Array<any> = [];

    // 简化的差异检测（实际项目中可以使用更复杂的算法）
    if (JSON.stringify(fromContent) !== JSON.stringify(toContent)) {
      changes.push({
        type: 'modified',
        path: '/steps',
        old_value: fromContent,
        new_value: toContent
      });
    }

    return changes;
  }

  /**
   * 批量创建版本（用于批量更新前的备份）
   * @param caseIds 测试用例ID列表
   * @param userId 用户ID
   * @returns 创建的版本列表
   */
  async createBatchVersions(caseIds: number[], userId?: number): Promise<CaseVersion[]> {
    console.log(`🔄 [VersionService] 批量创建版本快照，共 ${caseIds.length} 个用例...`);

    const results: CaseVersion[] = [];
    const errors: string[] = [];

    for (const caseId of caseIds) {
      try {
        const version = await this.createVersion(caseId, userId);
        results.push(version);
      } catch (error: any) {
        errors.push(`用例 ${caseId}: ${error.message}`);
        console.error(`❌ [VersionService] 用例 ${caseId} 版本创建失败: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      console.warn(`⚠️ [VersionService] 批量版本创建部分失败: ${errors.length} 个错误`);
    }

    console.log(`✅ [VersionService] 批量版本创建完成: ${results.length}/${caseIds.length} 成功`);
    return results;
  }
}
import { Router, Request, Response } from 'express';
import { axureUpload, axureMultiUpload } from '../middleware/upload.js';
import { AxureParseService } from '../services/axureParseService.js';
import { functionalTestCaseAIService } from '../services/functionalTestCaseAIService.js';
import { aiPreAnalysisService } from '../services/aiPreAnalysisService.js';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { DatabaseService } from '../services/databaseService.js';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

/**
 * Axure相关API路由
 */
export function createAxureRoutes(): Router {
  const router = Router();
  const parseService = new AxureParseService();
  const prisma = DatabaseService.getInstance().getClient();

  /**
   * POST /api/v1/axure/parse
   * 上传并解析Axure HTML文件
   */
  router.post('/parse', axureUpload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: '未上传文件'
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '未授权'
        });
      }

      console.log(`📤 收到文件上传: ${req.file.originalname}, 大小: ${req.file.size} bytes`);

      const filePath = req.file.path;

      // 解析Axure文件
      const parseResult = await parseService.parseHtmlFile(filePath);

      // 创建AI生成会话记录
      await prisma.ai_generation_sessions.create({
        data: {
          id: parseResult.sessionId,
          user_id: req.user.id,
          axure_filename: req.file.originalname,
          axure_file_size: req.file.size,
          page_count: parseResult.pageCount,
          element_count: parseResult.elementCount,
          interaction_count: parseResult.interactionCount
        }
      });

      // 解析完成后删除临时文件
      await fs.unlink(filePath);
      console.log(`🗑️  临时文件已删除: ${filePath}`);

      res.json({
        success: true,
        data: parseResult
      });
    } catch (error: any) {
      console.error('❌ 解析Axure文件失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/axure/parse-multi
   * 上传并解析多个Axure文件（HTML + JS）
   */
  router.post('/parse-multi', axureMultiUpload.array('files', 20), async (req: Request, res: Response) => {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: '未上传文件'
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '未授权'
        });
      }

      console.log(`📤 收到多文件上传: ${req.files.length} 个文件`);

      // 获取页面名称
      const pageName = req.body.pageName || '';
      if (pageName) {
        console.log(`📝 用户指定页面名称: "${pageName}"`);
      }

      // 分类文件
      const htmlFiles = req.files.filter(f => f.originalname.toLowerCase().endsWith('.html') || f.originalname.toLowerCase().endsWith('.htm'));
      const jsFiles = req.files.filter(f => f.originalname.toLowerCase().endsWith('.js'));

      if (htmlFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: '至少需要一个 HTML 文件'
        });
      }

      console.log(`  - HTML 文件: ${htmlFiles.length} 个`);
      console.log(`  - JS 文件: ${jsFiles.length} 个`);

      // 解析Axure文件
      const parseResult = await parseService.parseMultipleFiles(
        htmlFiles.map(f => f.path),
        jsFiles.map(f => f.path),
        pageName // 传递页面名称
      );

      // 创建AI生成会话记录
      const totalSize = req.files.reduce((sum, f) => sum + f.size, 0);
      await prisma.ai_generation_sessions.create({
        data: {
          id: parseResult.sessionId,
          user_id: req.user.id,
          axure_filename: `${req.files.length} files (${htmlFiles.length} HTML, ${jsFiles.length} JS)`,
          axure_file_size: totalSize,
          page_count: parseResult.pageCount,
          element_count: parseResult.elementCount,
          interaction_count: parseResult.interactionCount
        }
      });

      // 解析完成后删除临时文件
      for (const file of req.files) {
        await fs.unlink(file.path);
      }
      console.log(`🗑️  临时文件已删除`);

      res.json({
        success: true,
        data: parseResult
      });
    } catch (error: any) {
      console.error('❌ 解析Axure文件失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/axure/generate-requirement
   * 生成需求文档
   */
  router.post('/generate-requirement', async (req: Request, res: Response) => {
    try {
      const { sessionId, axureData, projectInfo } = req.body;

      if (!sessionId || !axureData || !projectInfo) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      console.log(`📝 开始生成需求文档，会话ID: ${sessionId}`);

      // 调用AI服务生成需求文档
      const result = await functionalTestCaseAIService.generateRequirementDoc(
        axureData,
        projectInfo
      );

      // 更新会话信息
      await prisma.ai_generation_sessions.update({
        where: { id: sessionId },
        data: {
          project_name: projectInfo.systemName || '',    // 使用系统名称
          system_type: projectInfo.moduleName || '',     // 使用模块名称
          business_domain: '',                           // 不再使用
          requirement_doc: result.requirementDoc
        }
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('❌ 生成需求文档失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 🆕 POST /api/v1/axure/pre-analyze
   * AI预分析（识别不确定信息）
   */
  router.post('/pre-analyze', async (req: Request, res: Response) => {
    try {
      const { sessionId, axureData } = req.body;

      if (!sessionId || !axureData) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      console.log(`🔍 开始AI预分析，会话ID: ${sessionId}`);

      // 调用AI预分析服务
      const preAnalysisResult = await aiPreAnalysisService.preAnalyze(
        sessionId,
        axureData
      );

      // 保存预分析结果到数据库
      await prisma.ai_generation_sessions.update({
        where: { id: sessionId },
        data: {
          pre_analysis_result: JSON.stringify(preAnalysisResult)
        }
      });

      res.json({
        success: true,
        data: preAnalysisResult
      });
    } catch (error: any) {
      console.error('❌ AI预分析失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 🆕 POST /api/v1/axure/generate-requirement-enhanced
   * 生成需求文档（增强版 - 支持用户确认信息）
   */
  router.post('/generate-requirement-enhanced', async (req: Request, res: Response) => {
    try {
      const { sessionId, axureData, projectInfo, enhancedData } = req.body;

      if (!sessionId || !axureData || !projectInfo) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      console.log(`📝 开始生成需求文档（增强版），会话ID: ${sessionId}`);
      if (enhancedData) {
        console.log(`   ✅ 使用用户确认的增强数据`);
      }

      // 调用AI服务生成需求文档（传入增强数据）
      const result = await functionalTestCaseAIService.generateRequirementDoc(
        axureData,
        projectInfo,
        enhancedData  // 🆕 传入用户确认的增强数据
      );

      // 更新会话信息
      await prisma.ai_generation_sessions.update({
        where: { id: sessionId },
        data: {
          project_name: projectInfo.systemName || '',
          system_type: projectInfo.moduleName || '',
          requirement_doc: result.requirementDoc,
          enhanced_data: enhancedData ? JSON.stringify(enhancedData) : null
        }
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('❌ 生成需求文档失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/axure/plan-batches
   * 规划分批策略
   */
  router.post('/plan-batches', async (req: Request, res: Response) => {
    try {
      const { sessionId, requirementDoc } = req.body;

      if (!sessionId || !requirementDoc) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      console.log(`📋 开始规划分批策略，会话ID: ${sessionId}`);

      // 调用AI服务规划分批
      const batches = await functionalTestCaseAIService.planBatchStrategy(requirementDoc);

      // 更新会话信息
      await prisma.ai_generation_sessions.update({
        where: { id: sessionId },
        data: {
          batches: JSON.stringify(batches)
        }
      });

      res.json({
        success: true,
        data: { batches }
      });
    } catch (error: any) {
      console.error('❌ 规划分批策略失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/axure/generate-batch
   * 生成单个批次的测试用例
   */
  router.post('/generate-batch', async (req: Request, res: Response) => {
    try {
      const { sessionId, batchId, scenarios, requirementDoc, existingCases, systemName, moduleName } = req.body;

      if (!sessionId || !batchId || !scenarios || !requirementDoc) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      console.log(`🤖 开始生成批次: ${batchId}, 系统: ${systemName || '未指定'}, 模块: ${moduleName || '未指定'}`);

      // 调用AI服务生成测试用例
      const testCases = await functionalTestCaseAIService.generateBatch(
        batchId,
        scenarios,
        requirementDoc,
        existingCases || [],
        systemName,
        moduleName
      );

      // 更新会话统计
      await prisma.ai_generation_sessions.update({
        where: { id: sessionId },
        data: {
          total_generated: {
            increment: testCases.length
          }
        }
      });

      res.json({
        success: true,
        data: { testCases }
      });
    } catch (error: any) {
      console.error('❌ 生成批次失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/axure/regenerate-cases
   * 重新生成指定的测试用例
   */
  router.post('/regenerate-cases', async (req: Request, res: Response) => {
    try {
      const { originalCases, instruction, requirementDoc } = req.body;

      if (!originalCases || !requirementDoc) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      console.log(`🔄 重新生成${originalCases.length}个测试用例`);

      // 调用AI服务重新生成
      const testCases = await functionalTestCaseAIService.regenerateCases(
        originalCases,
        instruction || '',
        requirementDoc
      );

      res.json({
        success: true,
        data: { testCases }
      });
    } catch (error: any) {
      console.error('❌ 重新生成失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 🆕 POST /api/v1/axure/generate-from-html-direct
   * 直接从HTML文件生成需求文档（不经过解析，直接传文本给AI）
   */
  router.post('/generate-from-html-direct', axureUpload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: '未上传文件'
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '未授权'
        });
      }

      const { systemName, moduleName, pageMode = 'new', platformType = 'web', businessRules } = req.body;

      // 验证 pageMode
      if (pageMode && !['new', 'modify'].includes(pageMode)) {
        return res.status(400).json({
          success: false,
          error: 'pageMode 必须是 new 或 modify'
        });
      }

      // 验证 platformType
      if (platformType && !['web', 'mobile'].includes(platformType)) {
        return res.status(400).json({
          success: false,
          error: 'platformType 必须是 web 或 mobile'
        });
      }

      console.log(`📤 收到HTML文件: ${req.file.originalname}, 大小: ${req.file.size} bytes`);
      console.log(`   平台类型: ${platformType === 'web' ? 'Web端' : '移动端'}`);
      console.log(`   页面模式: ${pageMode === 'new' ? '新增页面' : '修改页面'}`);
      console.log(`   系统名称: ${systemName || '未指定'}, 模块名称: ${moduleName || '未指定'}`);
      if (businessRules) {
        console.log(`   补充业务规则: ${businessRules.split('\n').length} 行`);
      }

      const filePath = req.file.path;

      // 读取HTML文件内容
      const htmlContent = await fs.readFile(filePath, 'utf-8');
      console.log(`📄 HTML文件读取成功，长度: ${htmlContent.length} 字符`);

      // 将补充业务规则转换为数组（按行分割，过滤空行）
      const businessRulesArray = businessRules
        ? businessRules.split('\n').map((r: string) => r.trim()).filter((r: string) => r.length > 0)
        : [];

      // 直接调用AI生成需求文档（传递 pageMode、platformType 和 businessRules）
      const result = await functionalTestCaseAIService.generateRequirementFromHtmlDirect(
        htmlContent,
        {
          systemName,
          moduleName,
          pageMode: pageMode as 'new' | 'modify', // 传递页面模式
          platformType: platformType as 'web' | 'mobile', // 传递平台类型
          businessRules: businessRulesArray // 传递补充业务规则
        }
      );

      // 创建会话记录
      const sessionId = uuidv4();
      await prisma.ai_generation_sessions.create({
        data: {
          id: sessionId,
          user_id: req.user.id,
          axure_filename: req.file.originalname,
          axure_file_size: req.file.size,
          project_name: systemName || '',
          system_type: moduleName || '',
          requirement_doc: result.requirementDoc,
          page_count: 0,
          element_count: 0,
          interaction_count: 0
        }
      });

      // 删除临时文件
      await fs.unlink(filePath);
      console.log(`🗑️  临时文件已删除: ${filePath}`);

      res.json({
        success: true,
        data: {
          sessionId,
          requirementDoc: result.requirementDoc,
          sections: result.sections
        }
      });
    } catch (error: any) {
      console.error('❌ 直接生成需求文档失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

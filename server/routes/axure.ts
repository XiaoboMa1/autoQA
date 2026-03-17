import { Router, Request, Response } from 'express';
import { axureUpload, axureMultiUpload } from '../middleware/upload.js';
import { AxureParseService } from '../services/axureParseService.js';
import { FunctionalTestCaseAIService } from '../services/functionalTestCaseAIService.js';
import { AIPreAnalysisService } from '../services/aiPreAnalysisService.js';
import { DatabaseService } from '../services/databaseService.js';
import fs from 'fs/promises';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import pdfParse from 'pdf-parse';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import mammoth from 'mammoth';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';

/**
 * 最终备用方案：从损坏的 DOCX 中尽力提取文本
 * 直接搜索 XML 文本节点，不依赖 ZIP 解压
 */
function extractTextFromCorruptedDocx(buffer: Buffer): string {
  console.log('   🔧 使用最终备用方案（原始字节提取）...');
  
  // 显示文件前200字节内容（十六进制和文本）
  const preview = buffer.slice(0, 200);
  console.log(`   📋 文件前200字节(hex): ${preview.toString('hex').substring(0, 100)}...`);
  console.log(`   📋 文件前200字节(text): ${preview.toString('utf8').substring(0, 100).replace(/[^\x20-\x7E]/g, '.')}...`);
  
  // 将 buffer 转为字符串，寻找 XML 文本节点
  const content = buffer.toString('utf8', 0, Math.min(buffer.length, 10 * 1024 * 1024)); // 最多读取10MB
  
  // 尝试多种模式提取文本
  
  // 模式1: 标准 DOCX 格式 <w:t>
  let textMatches = content.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
  
  // 模式2: 可能的其他 XML 格式
  if (!textMatches || textMatches.length === 0) {
    console.log('   🔍 尝试其他 XML 模式...');
    textMatches = content.match(/<text[^>]*>([^<]+)<\/text>/gi);
  }
  
  // 模式3: 搜索 word/document.xml 字符串
  if (!textMatches || textMatches.length === 0) {
    console.log('   🔍 搜索 word/document.xml 标记...');
    const docXmlIndex = content.indexOf('word/document.xml');
    if (docXmlIndex >= 0) {
      console.log(`   ✅ 找到 word/document.xml 标记在位置 ${docXmlIndex}`);
      // 尝试从该位置附近提取内容
      const snippet = content.substring(docXmlIndex, Math.min(docXmlIndex + 1000, content.length));
      console.log(`   📋 附近内容: ${snippet.substring(0, 200)}...`);
    }
  }
  
  // 模式4: 搜索任何可读的文本片段（连续的可打印字符）
  if (!textMatches || textMatches.length === 0) {
    console.log('   🔍 搜索可读文本片段...');
    // 🔥 改进：提取更长的可读文本，并过滤噪音
    const readableText = content.match(/[\x20-\x7E\u4e00-\u9fa5]{15,}/g); // 降低到至少15字符
    if (readableText && readableText.length > 0) {
      console.log(`   ✅ 找到 ${readableText.length} 个可读文本片段`);
      
      // 🔥 显示前5个片段用于调试
      console.log(`   📋 前5个片段预览:`);
      readableText.slice(0, 5).forEach((text, i) => {
        const preview = text.substring(0, 60).replace(/\n/g, ' ');
        console.log(`      ${i + 1}. ${preview}${text.length > 60 ? '...' : ''}`);
      });
      
      // 🔥 改进：更宽松的过滤条件
      const filteredText = readableText.filter(text => {
        // 过滤掉纯文件路径
        if (text.match(/^[\w/.]+\.(xml|rels|json|js)$/)) return false;
        // 过滤掉纯XML命名空间
        if (text.startsWith('xmlns:') || text.startsWith('http://') || text.startsWith('https://')) return false;
        // 过滤掉纯数字或特殊字符
        if (text.match(/^[\d\s\W]+$/)) return false;
        
        // 🔥 宽松保留：包含中文、或包含多个英文单词、或包含关键词
        const hasChinese = text.match(/[\u4e00-\u9fa5]/);
        const hasMultipleWords = text.split(/\s+/).filter(w => w.match(/[a-zA-Z]{2,}/)).length >= 2;
        const hasKeywords = text.match(/(登录|注册|用户|系统|功能|页面|按钮|输入|查询|列表|详情|编辑|删除|添加|保存|取消|确认|提交|审核|审批)/);
        
        return hasChinese || hasMultipleWords || hasKeywords;
      });
      
      console.log(`   🔍 过滤后剩余 ${filteredText.length} 个有效片段`);
      
      // 🔥 即使过滤后没有片段，也尝试使用原始片段（如果有足够长度）
      const textsToUse = filteredText.length > 0 ? filteredText : readableText;
      
      if (textsToUse.length > 0) {
        console.log(`   📊 使用 ${textsToUse.length} 个片段（${filteredText.length > 0 ? '已过滤' : '未过滤'}）`);
        
        // 🔥 显示将要使用的片段
        console.log(`   📋 将使用的片段示例:`);
        textsToUse.slice(0, 3).forEach((text, i) => {
          const preview = text.substring(0, 100).replace(/\n/g, ' ');
          console.log(`      ${i + 1}. ${preview}${text.length > 100 ? '...' : ''}`);
        });
        
        // 🔥 智能合并：添加适当的换行，而不是简单用空格连接
        const extractedText = textsToUse
          .map(text => text.trim())
          .filter(text => text.length > 0)
          .join('\n\n') // 使用双换行分隔，保持段落结构
          .replace(/\n{3,}/g, '\n\n') // 移除过多的换行
          .trim();
        
        if (extractedText.length > 20) {  // 降低阈值到20字符
          console.log(`   ✅ 提取到 ${extractedText.length} 字符的文本（${textsToUse.length} 个段落）`);
          return extractedText;
        } else {
          console.log(`   ⚠️  提取的文本太短 (${extractedText.length} 字符)，继续尝试...`);
        }
      }
    }
  }
  
  if (textMatches && textMatches.length > 0) {
    const extractedText = textMatches
      .map(match => match.replace(/<[^>]+>([^<]+)<\/[^>]+>/, '$1'))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`   ✅ 原始提取成功，找到 ${textMatches.length} 个文本节点，总长度: ${extractedText.length} 字符`);
    return extractedText;
  }
  
  // 🔥 最终兜底：如果前面所有方法都失败，尝试提取任何可能的文本
  console.log('   🔧 尝试最终兜底方案...');
  const allReadableText = content.match(/[\x20-\x7E\u4e00-\u9fa5]{10,}/g);
  if (allReadableText && allReadableText.length > 0) {
    const combinedText = allReadableText.join(' ').trim();
    if (combinedText.length > 10) {
      console.log(`   ⚠️  最终兜底：提取到 ${combinedText.length} 字符（未过滤）`);
      return combinedText;
    }
  }
  
  throw new Error('无法从文件中提取任何文本（未找到任何可识别的文本模式）');
}

/**
 * 备用方案：使用 JSZip 直接提取 DOCX 文本
 * 当 mammoth 失败时使用此方法
 */
async function extractDocxTextWithJSZip(buffer: Buffer): Promise<string> {
  try {
    console.log('   🔧 使用备用方案 (JSZip) 提取DOCX文本...');
    
    // 诊断 ZIP 文件结构
    console.log('   🔍 诊断文件结构...');
    const header = buffer.slice(0, 4).toString('hex');
    const tail = buffer.slice(-22).toString('hex');  // ZIP 的 End of Central Directory 至少 22 字节
    console.log(`      - 文件头: ${header} (标准: 504b0304)`);
    console.log(`      - 文件尾(22字节): ${tail}`);
    
    // 查找 ZIP End of Central Directory 签名 (504b0506)
    const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
    let eocdIndex = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
      if (buffer.slice(i, i + 4).equals(eocdSignature)) {
        eocdIndex = i;
        break;
      }
    }
    console.log(`      - EOCD位置: ${eocdIndex >= 0 ? eocdIndex : '未找到'}`);
    
    // 尝试使用宽松选项加载
    const zip = await JSZip.loadAsync(buffer, {
      checkCRC32: false,  // 不检查 CRC32，可能跳过一些损坏
      createFolders: true
    });
    
    console.log('   📂 ZIP解压成功，列出文件...');
    const fileNames = Object.keys(zip.files);
    console.log(`      - 文件数量: ${fileNames.length}`);
    console.log(`      - 主要文件: ${fileNames.slice(0, 5).join(', ')}`);
    
    // 读取 word/document.xml
    const documentXml = await zip.file('word/document.xml')?.async('string');
    
    if (!documentXml) {
      throw new Error('找不到 word/document.xml，可能不是有效的 DOCX 文件');
    }
    
    // 简单的 XML 文本提取（移除所有标签）
    const text = documentXml
      .replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, '$1')  // 提取文本节点
      .replace(/<[^>]+>/g, '')  // 移除所有其他标签
      .replace(/\s+/g, ' ')  // 规范化空格
      .trim();
    
    console.log(`   ✅ JSZip提取成功，文本长度: ${text.length} 字符`);
    return text;
  } catch (error: any) {
    console.error('   ❌ JSZip提取失败:', error.message);
    
    // 最终尝试：原始字节提取
    try {
      return extractTextFromCorruptedDocx(buffer);
    } catch (finalError: any) {
      console.error('   ❌ 原始提取也失败:', finalError.message);
      throw error;  // 抛出原始的 JSZip 错误
    }
  }
}

/**
 * Axure相关API路由
 */
export function createAxureRoutes(): Router {
  const router = Router();
  const parseService = new AxureParseService();
  
  // 延迟获取服务实例（避免模块加载时初始化）
  const getAIService = () => new FunctionalTestCaseAIService();
  const getPreAnalysisService = () => new AIPreAnalysisService();
  const getPrisma = () => DatabaseService.getInstance().getClient();

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
      await getPrisma().ai_generation_sessions.create({
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
      await getPrisma().ai_generation_sessions.create({
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
      const result = await getAIService().generateRequirementDoc(
        axureData,
        projectInfo
      );

      // 更新会话信息
      await getPrisma().ai_generation_sessions.update({
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
      const preAnalysisResult = await getPreAnalysisService().preAnalyze(
        sessionId,
        axureData
      );

      // 保存预分析结果到数据库
      await getPrisma().ai_generation_sessions.update({
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
      const result = await getAIService().generateRequirementDoc(
        axureData,
        projectInfo,
        enhancedData  // 🆕 传入用户确认的增强数据
      );

      // 更新会话信息
      await getPrisma().ai_generation_sessions.update({
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
      const batches = await getAIService().planBatchStrategy(requirementDoc);

      // 更新会话信息
      await getPrisma().ai_generation_sessions.update({
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
      const testCases = await getAIService().generateBatch(
        batchId,
        scenarios,
        requirementDoc,
        existingCases || [],
        systemName,
        moduleName
      );

      // 更新会话统计
      await getPrisma().ai_generation_sessions.update({
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
      const testCases = await getAIService().regenerateCases(
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

      const ext = path.extname(req.file.originalname).toLowerCase();
      const filePath = req.file.path;

      console.log(`📤 收到文件: ${req.file.originalname}, 大小: ${req.file.size} bytes`);
      console.log(`   平台类型: ${platformType === 'web' ? 'Web端' : '移动端'}`);
      console.log(`   页面模式: ${pageMode === 'new' ? '新增页面' : '修改页面'}`);
      console.log(`   系统名称: ${systemName || '未指定'}, 模块名称: ${moduleName || '未指定'}`);
      if (businessRules) {
        console.log(`   补充业务规则: ${businessRules.split('\n').length} 行`);
      }

      // 按文件类型读取内容
      let docContent = '';
      let contentSourceType: 'html' | 'pdf' | 'docx' | 'markdown' | 'text' = 'html';
      let extractionMethod = ''; // 记录提取方法
      
      if (ext === '.html' || ext === '.htm') {
        docContent = await fs.readFile(filePath, 'utf-8');
        console.log(`📄 HTML文件读取成功，长度: ${docContent.length} 字符`);
        
        // 🔥 过滤掉base64图片，只保留图片位置标记
        const originalLength = docContent.length;
        let imageCount = 0;
        
        docContent = docContent.replace(/<img\s+([^>]*?)src="data:image\/[^;]+;base64,[^"]*"([^>]*)>/gi, (match) => {
          imageCount++;
          const altMatch = match.match(/alt="([^"]*)"/i);
          const altText = altMatch ? altMatch[1] : '';
          return `<img src="[图片${imageCount}${altText ? ': ' + altText : ''}]" alt="${altText || '图片' + imageCount}" />`;
        });
        
        // 处理超长src属性（可能是base64）
        docContent = docContent.replace(/<img\s+([^>]*?)src="[^"]{1000,}"([^>]*)>/gi, (match) => {
          imageCount++;
          const altMatch = match.match(/alt="([^"]*)"/i);
          const altText = altMatch ? altMatch[1] : '';
          return `<img src="[图片${imageCount}${altText ? ': ' + altText : ''}]" alt="${altText || '图片' + imageCount}" />`;
        });
        
        if (imageCount > 0) {
          console.log(`   🖼️  已过滤 ${imageCount} 个base64图片`);
          console.log(`   📊 过滤前: ${originalLength} 字符，过滤后: ${docContent.length} 字符`);
          console.log(`   📉 减少: ${originalLength - docContent.length} 字符 (${((1 - docContent.length / originalLength) * 100).toFixed(1)}%)`);
        }
        
        contentSourceType = 'html';
        extractionMethod = 'direct';
      } else if (ext === '.pdf') {
        const pdfBuffer = await fs.readFile(filePath);
        const parsed = await pdfParse(pdfBuffer);
        docContent = parsed.text || '';
        console.log(`📄 PDF提取成功，文本长度: ${docContent.length} 字符`);
        contentSourceType = 'pdf';
        extractionMethod = 'pdf-parse';
      } else if (ext === '.docx' || ext === '.doc') {
        // 等待文件完全写入磁盘（multer可能还在写入）
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 读取文件 buffer（一次性读取，避免重复IO）
        const docxBuffer = await fs.readFile(filePath);
        console.log(`📄 读取${ext.toUpperCase()}文件，大小: ${docxBuffer.length} 字节`);
        
        // 验证文件大小
        if (docxBuffer.length === 0) {
          throw new Error('文件为空');
        }
        
        // 检测文件格式
        const fileHeader = docxBuffer.slice(0, 4).toString('hex');
        const fileHeader2Bytes = docxBuffer.slice(0, 2).toString('hex');
        console.log(`   文件头标识(4字节): ${fileHeader}`);
        console.log(`   文件头标识(2字节): ${fileHeader2Bytes}`);
        
        // 检测是否为旧的 .doc 格式（二进制格式）
        // .doc 文件通常以 D0CF11E0 开头（Microsoft Office 二进制格式）
        if (fileHeader === 'd0cf11e0') {
          throw new Error(
            `检测到旧版 Word 文档格式 (.doc)，无法直接处理。\n\n` +
            `请使用以下方法之一：\n` +
            `1. 在 Word 中打开该文件，另存为 .docx 格式\n` +
            `2. 将文件另存为 PDF 格式上传\n` +
            `3. 将文件另存为 TXT 纯文本格式上传`
          );
        }
        
        // 验证文件头（DOCX文件应该以PK开头，因为它是ZIP格式）
        if (fileHeader2Bytes !== '504b') {
          throw new Error(
            `文件格式不正确（文件头: ${fileHeader}）。\n\n` +
            `DOCX 文件应该是 ZIP 格式（以 504b 开头）。\n` +
            `当前文件可能已损坏或格式不正确。\n\n` +
            `建议：在 Word 中重新保存为标准 DOCX 格式，或转换为 PDF/TXT 格式上传。`
          );
        }
        
        // 尝试方案1：使用 mammoth 转换为HTML（保留结构和图片位置）
        try {
          console.log('   📝 方案1: 尝试使用 mammoth 转换为HTML...');
          const extracted = await mammoth.convertToHtml({ buffer: docxBuffer });
          let htmlContent = extracted.value || '';
          console.log(`   ✅ mammoth 转换成功，HTML长度: ${htmlContent.length} 字符`);
          
          // 🔥 过滤掉base64图片，只保留图片位置标记
          let imageCount = 0;
          const originalLength = htmlContent.length;
          
          // 匹配所有 <img> 标签，特别是包含 base64 的
          htmlContent = htmlContent.replace(/<img\s+([^>]*?)src="data:image\/[^;]+;base64,[^"]*"([^>]*)>/gi, (match) => {
            imageCount++;
            // 保留其他属性（如果有），但用简单的标记替换base64
            const altMatch = match.match(/alt="([^"]*)"/i);
            const altText = altMatch ? altMatch[1] : '';
            return `<img src="[图片${imageCount}${altText ? ': ' + altText : ''}]" alt="${altText || '图片' + imageCount}" />`;
          });
          
          // 也处理可能的其他格式的base64图片
          htmlContent = htmlContent.replace(/<img\s+([^>]*?)src="[^"]{1000,}"([^>]*)>/gi, (match) => {
            imageCount++;
            const altMatch = match.match(/alt="([^"]*)"/i);
            const altText = altMatch ? altMatch[1] : '';
            return `<img src="[图片${imageCount}${altText ? ': ' + altText : ''}]" alt="${altText || '图片' + imageCount}" />`;
          });
          
          if (imageCount > 0) {
            console.log(`   🖼️  已过滤 ${imageCount} 个base64图片`);
            console.log(`   📊 过滤前: ${originalLength} 字符，过滤后: ${htmlContent.length} 字符`);
            console.log(`   📉 减少: ${originalLength - htmlContent.length} 字符 (${((1 - htmlContent.length / originalLength) * 100).toFixed(1)}%)`);
          }
          
          docContent = htmlContent;
          contentSourceType = 'docx';
          extractionMethod = 'mammoth-html';
        } catch (mammothError: any) {
          console.warn(`   ⚠️ mammoth 提取失败: ${mammothError.message}`);
          
          // 尝试方案2：使用 JSZip 直接解压（备用方案）
          try {
            console.log('   📝 方案2: 尝试使用 JSZip 直接提取...');
            docContent = await extractDocxTextWithJSZip(docxBuffer);
            contentSourceType = 'docx';
            extractionMethod = 'jszip';
          } catch (jszipError: any) {
            console.error(`   ❌ JSZip 提取也失败: ${jszipError.message}`);
            extractionMethod = 'raw-bytes';
            
            // 保存问题文件供诊断
            const debugPath = filePath.replace(/\.(docx)$/i, '_debug.$1');
            try {
              await fs.copyFile(filePath, debugPath);
              console.log(`   💾 问题文件已保存到: ${debugPath}`);
            } catch (copyError) {
              console.warn('   ⚠️ 无法保存问题文件:', copyError);
            }
            
            // 两种方案都失败，提供详细错误信息
            throw new Error(
              `无法解析DOCX文件。已尝试：\n` +
              `1. mammoth: ${mammothError.message}\n` +
              `2. JSZip: ${jszipError.message}\n\n` +
              `可能原因：\n` +
              `- 文件在传输过程中损坏\n` +
              `- 文件被加密或密码保护\n` +
              `- 文件格式不标准或使用了特殊编码\n` +
              `- 文件实际上不是 DOCX 格式\n\n` +
              `建议解决方案：\n` +
              `1. 在 Word 中打开该文件，另存为新的 DOCX 文件\n` +
              `2. 将文件另存为 PDF 格式上传\n` +
              `3. 将文件另存为 TXT 纯文本格式上传\n` +
              `4. 使用在线工具检查文件是否损坏`
            );
          }
        }
      } else if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
        docContent = await fs.readFile(filePath, 'utf-8');
        console.log(`📄 文本/Markdown读取成功，长度: ${docContent.length} 字符`);
        
        // 🔥 如果是Markdown文件，过滤掉base64图片
        if (ext === '.md' || ext === '.markdown') {
          const originalLength = docContent.length;
          let imageCount = 0;
          
          // Markdown格式: ![alt](data:image/...)
          docContent = docContent.replace(/!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]*\)/gi, (match, altText) => {
            imageCount++;
            return `![${altText || '图片' + imageCount}]([图片${imageCount}${altText ? ': ' + altText : ''}])`;
          });
          
          // 处理超长URL（可能是base64）
          docContent = docContent.replace(/!\[([^\]]*)\]\(([^)]{1000,})\)/gi, (match, altText) => {
            imageCount++;
            return `![${altText || '图片' + imageCount}]([图片${imageCount}${altText ? ': ' + altText : ''}])`;
          });
          
          // HTML格式的图片在Markdown中
          docContent = docContent.replace(/<img\s+([^>]*?)src="data:image\/[^;]+;base64,[^"]*"([^>]*)>/gi, (match) => {
            imageCount++;
            const altMatch = match.match(/alt="([^"]*)"/i);
            const altText = altMatch ? altMatch[1] : '';
            return `<img src="[图片${imageCount}${altText ? ': ' + altText : ''}]" alt="${altText || '图片' + imageCount}" />`;
          });
          
          if (imageCount > 0) {
            console.log(`   🖼️  已过滤 ${imageCount} 个base64图片`);
            console.log(`   📊 过滤前: ${originalLength} 字符，过滤后: ${docContent.length} 字符`);
            console.log(`   📉 减少: ${originalLength - docContent.length} 字符 (${((1 - docContent.length / originalLength) * 100).toFixed(1)}%)`);
          }
        }
        
        contentSourceType = ext === '.txt' ? 'text' : 'markdown';
        extractionMethod = 'direct';
      } else {
        return res.status(400).json({
          success: false,
          error: '暂不支持该文件格式'
        });
      }

      // 🔥 添加详细的内容预览日志
      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║                    📋 文档内容提取结果                           ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log(`📊 提取信息:`);
      console.log(`   - 文件名: ${req.file.originalname}`);
      console.log(`   - 文件类型: ${contentSourceType.toUpperCase()}`);
      console.log(`   - 提取方法: ${extractionMethod}`);
      console.log(`   - 内容长度: ${docContent.length} 字符`);
      console.log(`   - 内容行数: ${docContent.split('\n').length} 行`);
      
      // 显示前500字符的内容
      const previewLength = 500;
      const preview = docContent.substring(0, previewLength);
      const hasMore = docContent.length > previewLength;
      
      console.log(`\n📝 内容预览 (前${previewLength}字符):`);
      console.log('─'.repeat(60));
      console.log(preview + (hasMore ? '...' : ''));
      console.log('─'.repeat(60));
      
      // 分析内容质量
      const chineseChars = (docContent.match(/[\u4e00-\u9fa5]/g) || []).length;
      const englishWords = (docContent.match(/[a-zA-Z]+/g) || []).length;
      const numbers = (docContent.match(/\d+/g) || []).length;
      
      console.log(`\n📈 内容分析:`);
      console.log(`   - 中文字符: ${chineseChars} 个`);
      console.log(`   - 英文单词: ${englishWords} 个`);
      console.log(`   - 数字: ${numbers} 个`);
      
      // 质量评估
      if (docContent.length < 100) {
        console.log(`   ⚠️  内容过少，可能提取失败`);
      } else if (chineseChars === 0 && englishWords < 10) {
        console.log(`   ⚠️  内容质量较差，可能包含大量噪音`);
      } else {
        console.log(`   ✅ 内容质量良好`);
      }
      console.log('═'.repeat(60));
      console.log('');

      // 🆕 内容长度安全检查（在过滤图片后仍然超长时才截断）
      const MAX_CONTENT_LENGTH = 200000; // 保守限制为20万字符（系统提示词+用户提示词总共约25万）
      let processedContent = docContent;

      if (docContent.length > MAX_CONTENT_LENGTH) {
        console.log(`\n⚠️  【内容长度安全检查】即使过滤图片后，文档内容仍然过长`);
        console.log(`   - 当前长度: ${docContent.length} 字符`);
        console.log(`   - AI模型限制: ${MAX_CONTENT_LENGTH} 字符`);
        console.log(`   - 超出: ${docContent.length - MAX_CONTENT_LENGTH} 字符`);
        console.log(`   - 说明: 已过滤base64图片，但文本内容本身过多`);

        // 智能截断策略：保留开头70%和结尾30%的内容
        const keepStart = Math.floor(MAX_CONTENT_LENGTH * 0.7);
        const keepEnd = MAX_CONTENT_LENGTH - keepStart;
        
        const startContent = docContent.substring(0, keepStart);
        const endContent = docContent.substring(docContent.length - keepEnd);
        
        processedContent = startContent + 
          '\n\n[... 文档中间部分因长度限制已省略 ...]\n\n' + 
          endContent;
        
        console.log(`   ✅ 已截断，新长度: ${processedContent.length} 字符`);
        console.log(`   - 保留开头: ${keepStart} 字符 (70%)`);
        console.log(`   - 保留结尾: ${keepEnd} 字符 (30%)`);
        console.log(`   💡 建议: 将文档拆分为多个小文档分别上传处理\n`);
      }

      // 将补充业务规则转换为数组（按行分割，过滤空行）
      const businessRulesArray = businessRules
        ? businessRules.split('\n').map((r: string) => r.trim()).filter((r: string) => r.length > 0)
        : [];

      // 直接调用AI生成需求文档（传递 pageMode、platformType 和 businessRules）
      const result = await getAIService().generateRequirementFromHtmlDirect(
        processedContent,
        {
          systemName,
          moduleName,
          pageMode: pageMode as 'new' | 'modify', // 传递页面模式
          platformType: platformType as 'web' | 'mobile', // 传递平台类型
          businessRules: businessRulesArray, // 传递补充业务规则
          contentSourceType
        }
      );

      // 创建会话记录
      const sessionId = uuidv4();
      await getPrisma().ai_generation_sessions.create({
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
          sections: result.sections,
          contentSourceType // 🆕 返回文件类型
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

  /**
   * 🆕 POST /api/v1/axure/generate-from-text
   * 直接从文本生成需求文档（不需要上传文件）
   */
  router.post('/generate-from-text', async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '未授权'
        });
      }

      const { text, systemName, moduleName, pageMode = 'new', platformType = 'web', businessRules } = req.body;

      if (!text || !text.trim()) {
        return res.status(400).json({
          success: false,
          error: '请输入文本内容'
        });
      }

      console.log(`📝 收到文本输入，长度: ${text.length} 字符`);
      console.log(`   平台类型: ${platformType === 'web' ? 'Web端' : '移动端'}`);
      console.log(`   页面模式: ${pageMode === 'new' ? '新增页面' : '修改页面'}`);
      console.log(`   系统名称: ${systemName || '未指定'}, 模块名称: ${moduleName || '未指定'}`);

      // 🔥 先过滤文本中的base64图片
      let processedText = text;
      const originalTextLength = text.length;
      let imageCount = 0;

      // Markdown格式: ![alt](data:image/...)
      processedText = processedText.replace(/!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]*\)/gi, (match, altText) => {
        imageCount++;
        return `![${altText || '图片' + imageCount}]([图片${imageCount}${altText ? ': ' + altText : ''}])`;
      });
      
      // 处理超长URL（可能是base64）
      processedText = processedText.replace(/!\[([^\]]*)\]\(([^)]{1000,})\)/gi, (match, altText) => {
        imageCount++;
        return `![${altText || '图片' + imageCount}]([图片${imageCount}${altText ? ': ' + altText : ''}])`;
      });
      
      // HTML格式的图片
      processedText = processedText.replace(/<img\s+([^>]*?)src="data:image\/[^;]+;base64,[^"]*"([^>]*)>/gi, (match) => {
        imageCount++;
        const altMatch = match.match(/alt="([^"]*)"/i);
        const altText = altMatch ? altMatch[1] : '';
        return `<img src="[图片${imageCount}${altText ? ': ' + altText : ''}]" alt="${altText || '图片' + imageCount}" />`;
      });
      
      // 处理超长src属性（可能是base64）
      processedText = processedText.replace(/<img\s+([^>]*?)src="[^"]{1000,}"([^>]*)>/gi, (match) => {
        imageCount++;
        const altMatch = match.match(/alt="([^"]*)"/i);
        const altText = altMatch ? altMatch[1] : '';
        return `<img src="[图片${imageCount}${altText ? ': ' + altText : ''}]" alt="${altText || '图片' + imageCount}" />`;
      });
      
      if (imageCount > 0) {
        console.log(`\n🖼️  【文本图片过滤】检测到并过滤了base64图片`);
        console.log(`   - 图片数量: ${imageCount} 个`);
        console.log(`   📊 过滤前: ${originalTextLength} 字符`);
        console.log(`   📊 过滤后: ${processedText.length} 字符`);
        console.log(`   📉 减少: ${originalTextLength - processedText.length} 字符 (${((1 - processedText.length / originalTextLength) * 100).toFixed(1)}%)\n`);
      }

      // 🆕 内容长度安全检查（在过滤图片后）
      const MAX_CONTENT_LENGTH = 200000; // 保守限制为20万字符（系统提示词+用户提示词总共约25万）

      if (processedText.length > MAX_CONTENT_LENGTH) {
        console.log(`\n⚠️  【内容长度安全检查】即使过滤图片后，文本内容仍然过长`);
        console.log(`   - 当前长度: ${processedText.length} 字符`);
        console.log(`   - AI模型限制: ${MAX_CONTENT_LENGTH} 字符`);
        console.log(`   - 超出: ${processedText.length - MAX_CONTENT_LENGTH} 字符`);
        console.log(`   - 说明: 已过滤base64图片，但文本内容本身过多`);

        // 智能截断策略：保留开头70%和结尾30%的内容
        const keepStart = Math.floor(MAX_CONTENT_LENGTH * 0.7);
        const keepEnd = MAX_CONTENT_LENGTH - keepStart;
        
        const startContent = processedText.substring(0, keepStart);
        const endContent = processedText.substring(processedText.length - keepEnd);
        
        processedText = startContent + 
          '\n\n[... 文本中间部分因长度限制已省略 ...]\n\n' + 
          endContent;
        
        console.log(`   ✅ 已截断，新长度: ${processedText.length} 字符`);
        console.log(`   - 保留开头: ${keepStart} 字符 (70%)`);
        console.log(`   - 保留结尾: ${keepEnd} 字符 (30%)`);
        console.log(`   💡 建议: 将内容拆分为多个部分分别处理\n`);
      }

      // 将补充业务规则转换为数组
      const businessRulesArray = businessRules
        ? (Array.isArray(businessRules) ? businessRules : businessRules.split('\n').map((r: string) => r.trim()).filter((r: string) => r.length > 0))
        : [];

      // 调用AI生成需求文档
      const result = await getAIService().generateRequirementFromHtmlDirect(
        processedText,
        {
          systemName,
          moduleName,
          pageMode: pageMode as 'new' | 'modify',
          platformType: platformType as 'web' | 'mobile',
          businessRules: businessRulesArray,
          contentSourceType: 'text' // 标记为文本输入
        }
      );

      // 创建会话记录
      const sessionId = uuidv4();
      await getPrisma().ai_generation_sessions.create({
        data: {
          id: sessionId,
          user_id: req.user.id,
          axure_filename: '文本输入',
          axure_file_size: text.length,
          project_name: systemName || '',
          system_type: moduleName || '',
          requirement_doc: result.requirementDoc,
          page_count: 0,
          element_count: 0,
          interaction_count: 0
        }
      });

      res.json({
        success: true,
        data: {
          sessionId,
          requirementDoc: result.requirementDoc,
          sections: result.sections,
          contentSourceType: 'text',
          // 🆕 返回过滤信息，让前端知道发生了什么
          filterInfo: imageCount > 0 ? {
            imagesFiltered: imageCount,
            originalLength: originalTextLength,
            filteredLength: processedText.length,
            reductionPercent: ((1 - processedText.length / originalTextLength) * 100).toFixed(1)
          } : null
        }
      });
    } catch (error: any) {
      console.error('❌ 从文本生成需求文档失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Input, Radio, Select } from 'antd';
import {
  Sparkles, Upload as UploadIcon, FileText, Zap, Shield,
  ArrowLeft, ArrowRight, Save, FileX, CheckCircle
} from 'lucide-react';
import { functionalTestCaseService } from '../services/functionalTestCaseService';
import * as systemService from '../services/systemService';
import { showToast } from '../utils/toast';
import { Button } from '../components/ui/button';
import { ProgressIndicator } from '../components/ai-generator/ProgressIndicator';
import { StepCard } from '../components/ai-generator/StepCard';
import { AIThinking } from '../components/ai-generator/AIThinking';
import { DraftCaseCard } from '../components/ai-generator/DraftCaseCard';
import { MultiFileUpload } from '../components/ai-generator/MultiFileUpload';
import { MarkdownEditor } from '../components/ai-generator/MarkdownEditor';
import { TestCaseDetailModal } from '../components/ai-generator/TestCaseDetailModal';
import { SmartCompletionModal } from '../components/ai-generator/SmartCompletionModal';
import type { PreAnalysisResult, UserConfirmation, EnhancedAxureData } from '../types/aiPreAnalysis';
import { clsx } from 'clsx';

const { TextArea } = Input;

// 步骤定义
const STEPS = [
  { name: '上传原型', description: '上传 Axure 文件' },
  { name: '需求文档', description: 'AI 生成需求' },
  { name: '生成用例', description: '批量生成' }
];

/**
 * AI测试用例生成器页面 - 重新设计版本
 */
export function FunctionalTestCaseGenerator() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  // 系统字典选项
  const [systemOptions, setSystemOptions] = useState<Array<{ id: number; name: string }>>([]);

  // 步骤1状态
  const [axureFiles, setAxureFiles] = useState<File[]>([]);
  const [pageName, setPageName] = useState(''); // 新增:页面名称
  const [pageMode, setPageMode] = useState<'new' | 'modify'>('new'); // 🆕 页面模式：新增/修改
  const [platformType, setPlatformType] = useState<'web' | 'mobile'>('web'); // 🆕 平台类型：Web端/移动端
  const [projectInfo, setProjectInfo] = useState({
    systemName: '',      // 系统名称
    moduleName: '',      // 模块名称
    businessRules: ''    // 补充业务规则
  });
  const [parseResult, setParseResult] = useState<any>(null);
  const [parsing, setParsing] = useState(false);

  // 加载系统字典选项
  useEffect(() => {
    const loadSystems = async () => {
      try {
        const systems = await systemService.getActiveSystems();
        setSystemOptions(systems);
      } catch (error) {
        console.error('加载系统列表失败:', error);
        showToast.error('加载系统列表失败');
      }
    };
    loadSystems();
  }, []);

  // 步骤2状态
  const [requirementDoc, setRequirementDoc] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sessionId, setSessionId] = useState('');

  // 🆕 预分析相关状态（智能补全）
  const [preAnalysisResult, setPreAnalysisResult] = useState<PreAnalysisResult | null>(null);
  const [preAnalyzing, setPreAnalyzing] = useState(false);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [userConfirmations, setUserConfirmations] = useState<UserConfirmation[]>([]);

  // 步骤3状态 - 🆕 三阶段渐进式
  const [testModules, setTestModules] = useState<any[]>([]); // 测试模块列表
  const [analyzingModules, setAnalyzingModules] = useState(false); // 是否正在分析模块
  const [generatingPurposes, setGeneratingPurposes] = useState<Record<string, boolean>>({}); // 哪些模块正在生成测试目的
  const [generatingPoints, setGeneratingPoints] = useState<Record<string, boolean>>({}); // 哪些测试目的正在生成测试点
  const [batchGeneratingModule, setBatchGeneratingModule] = useState<string | null>(null); // 正在批量生成的模块ID
  const [batchGenerateProgress, setBatchGenerateProgress] = useState<{current: number, total: number}>({ current: 0, total: 0 }); // 批量生成进度
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({}); // 哪些模块是展开的
  const [draftCases, setDraftCases] = useState<any[]>([]); // 已生成的测试用例草稿
  const [selectedPurposes, setSelectedPurposes] = useState<Record<string, boolean>>({}); // 已选中的测试目的
  const [savedPurposes, setSavedPurposes] = useState<Record<string, boolean>>({}); // 🆕 已保存的测试目的
  const [saving, setSaving] = useState(false);

  // 详情对话框状态
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [currentDetailCase, setCurrentDetailCase] = useState<any>(null);

  // 步骤1：上传和解析 - 🆕 直接生成需求文档（跳过解析和二次确认）
  const handleParse = async () => {
    if (axureFiles.length === 0) {
      showToast.error('请先上传Axure文件');
      return;
    }

    // 验证至少有一个 HTML 文件
    const htmlFile = axureFiles.find(f => f.name.toLowerCase().endsWith('.html') || f.name.toLowerCase().endsWith('.htm'));
    if (!htmlFile) {
      showToast.error('至少需要一个 HTML 文件');
      return;
    }

    // 验证必填字段
    if (!projectInfo.systemName.trim()) {
      showToast.error('请填写系统名称');
      return;
    }
    if (!projectInfo.moduleName.trim()) {
      showToast.error('请填写模块名称');
      return;
    }

    // 🔥 修复：先进入步骤2，再显示loading，避免在步骤1下方显示loading
    setCurrentStep(1);
    setParsing(true);
    setGenerating(true);

    try {
      console.log('🚀 使用新的直接生成模式（跳过解析和二次确认）');

      // 🆕 直接调用新API，跳过解析和智能补全
      const result = await functionalTestCaseService.generateFromHtmlDirect(
        htmlFile,
        projectInfo.systemName,
        projectInfo.moduleName,
        pageMode, // 传递页面模式
        projectInfo.businessRules, // 传递补充业务规则
        platformType // 传递平台类型
      );

      // 设置会话ID和需求文档
      setSessionId(result.data.sessionId);
      setRequirementDoc(result.data.requirementDoc);

      showToast.success(`需求文档生成成功！识别到 ${result.data.sections.length} 个章节`);
    } catch (error: any) {
      showToast.error('生成需求文档失败：' + error.message);
      // 失败时回退到步骤1
      setCurrentStep(0);
    } finally {
      setParsing(false);
      setGenerating(false);
    }
  };

  // 🆕 执行AI预分析（智能补全）
  const performPreAnalysis = async (axureData: any, sid: string) => {
    setPreAnalyzing(true);
    try {
      console.log('🔍 开始AI预分析...');
      const result = await functionalTestCaseService.preAnalyze(sid, axureData);

      setPreAnalysisResult(result.data);

      // 如果有不确定信息，打开智能补全对话框
      if (result.data.uncertainInfo && result.data.uncertainInfo.length > 0) {
        console.log(`📋 识别到 ${result.data.uncertainInfo.length} 个不确定信息`);
        setCompletionModalOpen(true);
      } else {
        // 没有不确定信息，直接生成需求文档
        console.log('✅ 没有不确定信息，直接生成需求文档');
        showToast.info('原型信息完整，直接生成需求文档');
        await generateRequirementDoc(axureData, sid);
      }
    } catch (error: any) {
      console.error('❌ AI预分析失败:', error);
      showToast.warning('AI预分析失败，将使用原始方式生成需求文档');
      // 预分析失败，回退到原始流程
      await generateRequirementDoc(axureData, sid);
    } finally {
      setPreAnalyzing(false);
    }
  };

  // 🆕 处理用户确认（智能补全）
  const handleConfirmations = async (confirmations: UserConfirmation[]) => {
    setUserConfirmations(confirmations);
    setCompletionModalOpen(false);

    console.log('✅ 用户确认完成，开始生成增强需求文档');
    console.log('📊 确认数量:', confirmations.length);
    console.log('📋 确认详情:', confirmations);

    // 构建增强数据
    const enhancedData = buildEnhancedData(confirmations);

    console.log('🔥 增强数据构建完成:');
    console.log('   - 页面类型:', enhancedData.enrichedInfo.pageType);
    console.log('   - 确认的枚举:', enhancedData.enrichedInfo.confirmedEnums);
    console.log('   - 确认的规则:', enhancedData.enrichedInfo.confirmedRules);

    // 使用增强API生成需求文档
    await generateRequirementDocEnhanced(parseResult, sessionId, enhancedData);
  };

  // 🆕 跳过智能补全
  const handleSkipCompletion = async () => {
    setCompletionModalOpen(false);
    showToast.info('已跳过智能补全，使用原始数据生成需求文档');
    await generateRequirementDoc(parseResult, sessionId);
  };

  // 🆕 构建增强数据
  const buildEnhancedData = (confirmations: UserConfirmation[]): EnhancedAxureData => {
    if (!preAnalysisResult) {
      throw new Error('预分析结果不存在');
    }

    const enrichedInfo = {
      pageType: undefined as string | undefined,
      confirmedEnums: {} as Record<string, string[]>,
      confirmedRules: [] as Array<{ field: string; rule: string }>,
      confirmedMeanings: {} as Record<string, string>,
      confirmedValidations: [] as Array<{ field: string; validation: string }>
    };

    // 处理每个用户确认
    confirmations.forEach(conf => {
      if (!conf.confirmed || !conf.userValue) return;

      const uncertainInfo = preAnalysisResult.uncertainInfo.find(u => u.id === conf.id);
      if (!uncertainInfo) return;

      switch (uncertainInfo.type) {
        case 'pageType':
          // 🔥 页面类型确认（最重要！）
          enrichedInfo.pageType = conf.userValue[0]; // 取第一个值（list/form/detail/mixed）
          break;
        case 'enumValues':
          if (uncertainInfo.field) {
            enrichedInfo.confirmedEnums[uncertainInfo.field] = conf.userValue;
          }
          break;
        case 'businessRule':
          if (uncertainInfo.field) {
            enrichedInfo.confirmedRules.push({
              field: uncertainInfo.field,
              rule: conf.userValue.join('; ')
            });
          }
          break;
        case 'fieldMeaning':
          if (uncertainInfo.field) {
            enrichedInfo.confirmedMeanings[uncertainInfo.field] = conf.userValue.join('; ');
          }
          break;
        case 'validationRule':
          if (uncertainInfo.field) {
            enrichedInfo.confirmedValidations.push({
              field: uncertainInfo.field,
              validation: conf.userValue.join('; ')
            });
          }
          break;
      }
    });

    return {
      originalData: parseResult,
      preAnalysis: preAnalysisResult,
      userConfirmations: confirmations,
      enrichedInfo
    };
  };

  // 🆕 生成需求文档（增强版）
  const generateRequirementDocEnhanced = async (
    axureData: any,
    sid: string,
    enhancedData: EnhancedAxureData
  ) => {
    setGenerating(true);
    try {
      const businessRules = (projectInfo.businessRules || '').split('\n').filter(r => r.trim());

      const result = await functionalTestCaseService.generateRequirementEnhanced(
        sid,
        axureData,
        {
          systemName: projectInfo.systemName || '',
          moduleName: projectInfo.moduleName || '',
          businessRules
        },
        enhancedData
      );

      setRequirementDoc(result.data.requirementDoc);
      showToast.success('增强需求文档生成成功！');
    } catch (error: any) {
      showToast.error('生成需求文档失败：' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  // 生成需求文档
  const generateRequirementDoc = async (axureData: any, sid?: string) => {
    setGenerating(true);
    try {
      // 安全处理业务规则，避免 undefined 错误
      const businessRules = (projectInfo.businessRules || '').split('\n').filter(r => r.trim());

      // 使用传入的 sessionId 或状态中的 sessionId
      const currentSessionId = sid || sessionId;

      const result = await functionalTestCaseService.generateRequirement(
        currentSessionId,
        axureData,
        {
          systemName: projectInfo.systemName || '',
          moduleName: projectInfo.moduleName || '',
          businessRules
        }
      );

      setRequirementDoc(result.data.requirementDoc);
    } catch (error: any) {
      showToast.error('生成需求文档失败：' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  // 🆕 阶段1：智能测试模块拆分
  const handleAnalyzeModules = async () => {
    setAnalyzingModules(true);
    setCurrentStep(2); // 进入步骤3

    try {
      console.log('🎯 阶段1：开始智能测试模块拆分...');
      const result = await functionalTestCaseService.analyzeTestModules(requirementDoc, sessionId);

      console.log('✅ 测试模块拆分完成:', result.data.modules);
      setTestModules(result.data.modules);
      showToast.success(`成功拆分 ${result.data.modules.length} 个测试模块`);
    } catch (error: any) {
      console.error('❌ 测试模块拆分失败:', error);
      showToast.error('测试模块拆分失败：' + error.message);
      setCurrentStep(1); // 失败回退到步骤2
    } finally {
      setAnalyzingModules(false);
    }
  };

  // 🆕 阶段2：为指定模块生成测试目的
  const handleGeneratePurposes = async (module: any) => {
    setGeneratingPurposes(prev => ({ ...prev, [module.id]: true }));

    try {
      console.log(`🎯 阶段2：为模块 "${module.name}" 生成测试目的...`);
      const result = await functionalTestCaseService.generateTestPurposes(
        module.id,
        module.name,
        module.description,
        requirementDoc,
        module.relatedSections,
        sessionId
      );

      console.log('✅ 测试目的生成完成:', result.data.purposes);

      // 更新模块，添加测试目的
      setTestModules(prev => prev.map(m =>
        m.id === module.id
          ? { ...m, testPurposes: result.data.purposes }
          : m
      ));

      // 自动展开该模块
      setExpandedModules(prev => ({ ...prev, [module.id]: true }));

      showToast.success(`为模块 "${module.name}" 生成了 ${result.data.purposes.length} 个测试目的`);
    } catch (error: any) {
      console.error('❌ 生成测试目的失败:', error);
      showToast.error('生成测试目的失败：' + error.message);
    } finally {
      setGeneratingPurposes(prev => ({ ...prev, [module.id]: false }));
    }
  };

  // 🆕 阶段3：为指定测试目的生成测试点
  const handleGeneratePoints = async (purpose: any, module: any) => {
    const purposeKey = `${module.id}-${purpose.id}`;
    setGeneratingPoints(prev => ({ ...prev, [purposeKey]: true }));

    try {
      console.log(`🎯 阶段3：为测试目的 "${purpose.name}" 生成测试点...`);
      const result = await functionalTestCaseService.generateTestPoints(
        purpose.id,
        purpose.name,
        purpose.description,
        requirementDoc,
        projectInfo.systemName,
        projectInfo.moduleName,
        module.relatedSections,
        sessionId
      );

      console.log('✅ 测试点生成完成:', result.data.testCase);

      const newCase = {
        ...result.data.testCase,
        id: `draft-${Date.now()}`,
        selected: true,
        moduleId: module.id,
        moduleName: module.name,
        purposeId: purpose.id,
        purposeName: purpose.name
      };

      // 添加到草稿箱
      setDraftCases(prev => [...prev, newCase]);

      // 更新测试目的，标记已生成
      setTestModules(prev => prev.map(m =>
        m.id === module.id
          ? {
              ...m,
              testPurposes: m.testPurposes?.map((p: any) =>
                p.id === purpose.id
                  ? { ...p, testCase: newCase }
                  : p
              )
            }
          : m
      ));

      showToast.success(`测试用例 "${newCase.name}" 生成成功！`);
    } catch (error: any) {
      console.error('❌ 生成测试点失败:', error);
      showToast.error('生成测试点失败：' + error.message);
    } finally {
      setGeneratingPoints(prev => ({ ...prev, [purposeKey]: false }));
    }
  };

  // 切换模块展开/折叠
  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  // 切换测试目的选中状态
  const togglePurposeSelect = (moduleId: string, purposeId: string) => {
    const purposeKey = `${moduleId}-${purposeId}`;
    setSelectedPurposes(prev => ({
      ...prev,
      [purposeKey]: !prev[purposeKey]
    }));
  };

  // 全选所有已生成测试用例的测试目的
  const selectAllPurposes = () => {
    const newSelections: Record<string, boolean> = {};
    testModules.forEach(module => {
      if (module.testPurposes) {
        module.testPurposes.forEach((purpose: any) => {
          if (purpose.testCase) {
            newSelections[`${module.id}-${purpose.id}`] = true;
          }
        });
      }
    });
    setSelectedPurposes(newSelections);
  };

  // 取消全选
  const deselectAllPurposes = () => {
    setSelectedPurposes({});
  };

  // 一键生成模块所有测试点（轮询方式）
  const handleBatchGenerateModulePoints = async (module: any) => {
    if (!module.testPurposes || module.testPurposes.length === 0) {
      showToast.warning('该模块暂无测试目的，请先生成测试目的');
      return;
    }

    // 筛选出还没生成测试用例的测试目的
    const pendingPurposes = module.testPurposes.filter((p: any) => !p.testCase);

    if (pendingPurposes.length === 0) {
      showToast.info('该模块所有测试目的的测试点已全部生成');
      return;
    }

    // 设置批量生成状态
    setBatchGeneratingModule(module.id);
    setBatchGenerateProgress({ current: 0, total: pendingPurposes.length });

    // 确保模块展开，以便用户看到生成过程
    setExpandedModules(prev => ({ ...prev, [module.id]: true }));

    console.log(`🚀 开始批量生成模块 [${module.name}] 的测试点，共 ${pendingPurposes.length} 个测试目的`);

    // 轮询生成每个测试目的的测试点
    for (let i = 0; i < pendingPurposes.length; i++) {
      const purpose = pendingPurposes[i];

      try {
        console.log(`📝 [${i + 1}/${pendingPurposes.length}] 正在生成测试目的: ${purpose.name}`);

        // 更新进度
        setBatchGenerateProgress({ current: i + 1, total: pendingPurposes.length });

        // 调用生成测试点的函数（复用现有逻辑）
        await handleGeneratePoints(purpose, module);

        console.log(`✅ [${i + 1}/${pendingPurposes.length}] 完成: ${purpose.name}`);

        // 每个测试目的生成完后稍微延迟，避免过快
        if (i < pendingPurposes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error: any) {
        console.error(`❌ [${i + 1}/${pendingPurposes.length}] 生成失败: ${purpose.name}`, error);
        showToast.error(`生成 "${purpose.name}" 失败: ${error.message}`);
        // 继续生成下一个，不中断整个流程
      }
    }

    // 完成批量生成
    setBatchGeneratingModule(null);
    setBatchGenerateProgress({ current: 0, total: 0 });

    showToast.success(`模块 "${module.name}" 的所有测试点已生成完毕！`);
    console.log(`🎉 批量生成完成！`);
  };

  // 生成当前批次
  const generateCurrentBatch = async () => {
    if (currentBatchIndex >= batches.length) {
      showToast.info('所有批次已生成完毕');
      return;
    }

    const currentBatch = batches[currentBatchIndex];
    console.log('📦 开始生成批次:', currentBatch);
    setGeneratingBatch(true);

    try {
      const result = await functionalTestCaseService.generateBatch(
        sessionId,
        currentBatch.id,
        currentBatch.scenarios,
        requirementDoc,
        draftCases,
        projectInfo.systemName,  // 传递系统名称
        projectInfo.moduleName   // 传递模块名称
      );

      console.log('✅ 批次生成结果:', result);
      console.log('📊 测试用例数组:', result.data.testCases);
      console.log('📏 生成了多少个用例:', result.data.testCases?.length);

      const newCases = result.data.testCases.map((tc: any, index: number) => ({
        ...tc,
        id: `draft-${Date.now()}-${index}`,
        batchNumber: currentBatchIndex + 1,
        selected: true
      }));

      console.log('🎨 处理后的用例数组:', newCases);

      setDraftCases(prev => {
        const updated = [...prev, ...newCases];
        console.log('📝 更新后的草稿箱:', updated);
        return updated;
      });
      setCurrentBatchIndex(prev => prev + 1);
      showToast.success(`第${currentBatchIndex + 1}批生成完成`);
    } catch (error: any) {
      console.error('❌ 生成批次失败:', error);
      showToast.error('生成失败：' + error.message);
    } finally {
      setGeneratingBatch(false);
    }
  };

  // 打开详情对话框
  const handleViewDetail = (testCase: any) => {
    setCurrentDetailCase(testCase);
    setDetailModalOpen(true);
  };

  // 保存详情修改
  const handleSaveDetail = (updatedTestCase: any) => {
    setDraftCases(prev =>
      prev.map(c => c.id === updatedTestCase.id ? updatedTestCase : c)
    );
    setDetailModalOpen(false);
    showToast.success('测试用例已更新');
  };

  // 保存选中用例（不跳转）- 基于测试目的维度
  const saveSelectedCases = async () => {
    // 1. 收集所有选中测试目的的测试用例和对应的purposeKey
    const selectedCases: any[] = [];
    const selectedPurposeKeys: string[] = [];

    testModules.forEach(module => {
      if (module.testPurposes) {
        module.testPurposes.forEach((purpose: any) => {
          const purposeKey = `${module.id}-${purpose.id}`;

          // 检查该测试目的是否被选中且已生成测试用例，且未被保存
          if (selectedPurposes[purposeKey] && purpose.testCase && !savedPurposes[purposeKey]) {
            selectedCases.push(purpose.testCase);
            selectedPurposeKeys.push(purposeKey);
          }
        });
      }
    });

    // 2. 验证选择
    if (selectedCases.length === 0) {
      showToast.warning('请至少选择一个未保存的测试用例');
      return;
    }

    // 3. 调用后端API保存
    setSaving(true);
    try {
      await functionalTestCaseService.batchSave(selectedCases, sessionId);
      showToast.success(`成功保存 ${selectedCases.length} 个测试用例`);

      // 4. 🆕 标记为已保存（不再移除）
      const newSavedPurposes = { ...savedPurposes };
      selectedPurposeKeys.forEach(key => {
        newSavedPurposes[key] = true;
      });
      setSavedPurposes(newSavedPurposes);

      // 5. 取消选中已保存的测试目的
      const newSelectedPurposes = { ...selectedPurposes };
      selectedPurposeKeys.forEach(key => {
        delete newSelectedPurposes[key];
      });
      setSelectedPurposes(newSelectedPurposes);

      // 6. 🆕 标记草稿箱中的用例为已保存（不移除，只标记）
      setDraftCases(prev =>
        prev.map(c => {
          const isSaved = selectedCases.some(sc => sc.id === c.id);
          return isSaved ? { ...c, saved: true, selected: false } : c;
        })
      );
    } catch (error: any) {
      showToast.error('保存失败：' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // 保存到用例库（并跳转）
  const saveToLibrary = async () => {
    const selectedCases = draftCases.filter(c => c.selected);

    if (selectedCases.length === 0) {
      showToast.warning('请至少选择一个用例');
      return;
    }

    setSaving(true);
    try {
      await functionalTestCaseService.batchSave(selectedCases, sessionId);
      showToast.success(`成功保存 ${selectedCases.length} 个用例`);

      setTimeout(() => {
        navigate('/functional-test-cases');
      }, 1500);
    } catch (error: any) {
      showToast.error('保存失败：' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // 切换用例选中状态
  const toggleCaseSelect = (id: string) => {
    setDraftCases(prev =>
      prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c)
    );
  };

  // 全选/取消全选
  const selectAll = () => {
    setDraftCases(prev => prev.map(c => ({ ...c, selected: true })));
  };

  const deselectAll = () => {
    setDraftCases(prev => prev.map(c => ({ ...c, selected: false })));
  };

  // 计算统计数据
  const selectedCount = draftCases.filter(c => c.selected).length;
  const avgQuality = draftCases.length > 0
    ? Math.round(draftCases.reduce((sum, c) => sum + (c.qualityScore || 85), 0) / draftCases.length)
    : 0;
  const totalTestPoints = draftCases.reduce((sum, c) => sum + (c.testPoints?.length || 0), 0);

  // 渲染步骤1：上传原型
  const renderStep1 = () => (
    <StepCard
      stepNumber={1}
      title="上传 Axure 原型"
      description="🆕 AI直接解析HTML，无需二次确认"
      onNext={handleParse}
      nextButtonText={(parsing || generating) ? 'AI生成中...' : '开始生成需求文档'}
      nextButtonDisabled={axureFiles.length === 0 || parsing || generating}
      hideActions={false}
    >
      {/* 左右分栏布局 */}
      <div className="grid grid-cols-[1.2fr,0.8fr] gap-8">
        {/* 左侧：文件上传区 + 解析结果 */}
        <div className="space-y-6">
          {/* 多文件上传组件 */}
          <MultiFileUpload
            onFilesChange={setAxureFiles}
            onPageNameChange={setPageName}
            pageMode={pageMode}
            onPageModeChange={setPageMode}
            maxFiles={20}
            maxSize={50 * 1024 * 1024}
          />

          {/* 🆕 AI生成需求文档进度 */}
          {(parsing || generating) && (
            <AIThinking
              title="正在直接生成需求文档..."
              subtitle="AI正在分析HTML并生成结构化需求，预计需要 1-3 分钟"
              progressItems={[
                { label: '读取HTML文件内容...', status: parsing ? 'processing' : 'completed' },
                { label: 'AI分析HTML结构和元素', status: generating ? 'processing' : 'pending' },
                { label: '生成章节化需求文档', status: 'pending' }
              ]}
            />
          )}

          {/* 🆕 生成成功提示 */}
          {requirementDoc && !parsing && !generating && (
            <motion.div
              className="bg-green-50 rounded-xl p-6 border border-green-200"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h4 className="font-semibold text-green-900 mb-3">需求文档生成成功！</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-700">{requirementDoc.length}</div>
                      <div className="text-sm text-green-600 mt-1">文档字符数</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-700">
                        {(requirementDoc.match(/###\s+[\d.]+/g) || []).length}
                      </div>
                      <div className="text-sm text-green-600 mt-1">识别章节数</div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-green-600 bg-green-100 rounded-lg p-3">
                    💡 AI已直接分析HTML并生成需求文档，无需二次确认！
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* 右侧：项目信息表单 */}
        <div className="space-y-6">
          {/* 表单卡片 */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 sticky top-24">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500
                              flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  补充项目信息
                </h3>
                <p className="text-sm text-gray-700">可选,帮助 AI 更好理解业务</p>
              </div>
            </div>

            <div className="space-y-5">
              {/* 平台类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  平台类型 <span className="text-red-500">*</span>
                </label>
                <Radio.Group
                  value={platformType}
                  onChange={e => setPlatformType(e.target.value)}
                  className="w-full"
                  buttonStyle="solid"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Radio.Button
                      value="web"
                      className="text-center h-10 leading-10"
                    >
                      🖥️ Web端
                    </Radio.Button>
                    <Radio.Button
                      value="mobile"
                      className="text-center h-10 leading-10"
                    >
                      📱 移动端
                    </Radio.Button>
                  </div>
                </Radio.Group>
                <p className="text-sm text-gray-700 mt-1">
                  {platformType === 'web' ?
                    '识别PC端Web页面（列表页、表单页、详情页、弹窗等）' :
                    '识别移动端页面（TabBar导航、卡片列表、长屏详情、多状态画面等）'}
                </p>
              </div>

              {/* 页面模式 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  页面模式 <span className="text-red-500">*</span>
                </label>
                <Radio.Group
                  value={pageMode}
                  onChange={e => setPageMode(e.target.value)}
                  className="w-full"
                  buttonStyle="solid"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Radio.Button
                      value="new"
                      className="text-center h-10 leading-10"
                    >
                      🆕 新增页面
                    </Radio.Button>
                    <Radio.Button
                      value="modify"
                      className="text-center h-10 leading-10"
                    >
                      ✏️ 修改页面
                    </Radio.Button>
                  </div>
                </Radio.Group>
                <p className="text-sm text-gray-700 mt-1">
                  {pageMode === 'new' ?
                    '完整解析页面所有元素和功能' :
                    '识别红色标记的变更点，生成变更摘要'}
                </p>
              </div>

              {/* 系统名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  系统名称 <span className="text-red-500">*</span>
                </label>
                <Select
                  className="w-full"
                  placeholder="请选择系统"
                  value={projectInfo.systemName || undefined}
                  onChange={(value) => setProjectInfo(prev => ({ ...prev, systemName: value }))}
                  showSearch
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={systemOptions.map(sys => ({
                    label: sys.name,
                    value: sys.name
                  }))}
                />
                <p className="text-sm text-gray-700 mt-1">生成的测试用例会自动填充此系统名称</p>
              </div>

              {/* 模块名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  模块名称 <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="例如：订单管理"
                  value={projectInfo.moduleName}
                  onChange={e => setProjectInfo(prev => ({ ...prev, moduleName: e.target.value }))}
                />
                <p className="text-sm text-gray-700 mt-1">生成的测试用例会自动填充此模块名称</p>
              </div>

              {/* 补充业务规则 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  补充业务规则 <span className="text-gray-600">(选填，辅助AI理解)</span>
                </label>
                <TextArea
                  rows={6}
                  placeholder="每行一条规则，例如：&#10;• 订单金额超过1000需审批&#10;• 库存不足时不能下单&#10;• 同一用户5分钟内不能重复下单&#10;• 支付超时30分钟自动取消订单"
                  value={projectInfo.businessRules}
                  onChange={e => setProjectInfo(prev => ({ ...prev, businessRules: e.target.value }))}
                />
                <p className="text-sm text-gray-700 mt-1">
                  💡 这些规则将作为AI提示词的一部分，帮助AI更准确地理解需求和生成测试点，不会直接出现在需求文档中
                </p>
              </div>

              {/* 提示信息 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">💡 填写说明</h4>
                <ul className="text-xs text-blue-700 space-y-1 leading-relaxed">
                  <li>• <strong>系统名称</strong> 和 <strong>模块名称</strong> 为必填项，会自动填充到生成的测试用例中</li>
                  <li>• <strong>补充业务规则</strong> 作为AI辅助提示，帮助生成更准确的边界条件、异常场景和风险测试点</li>
                  <li>• 页面名称会从 PRD 文档中自动提取，无需手动填写</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </StepCard>
  );

  // 渲染步骤2：需求文档
  const renderStep2 = () => (
    <StepCard
      stepNumber={2}
      title="AI 生成的需求文档"
      description="您可以编辑修改,以获得更精准的测试用例"
      onNext={handleAnalyzeModules}
      nextButtonText={analyzingModules ? '分析测试模块中...' : '立即生成测试用例 →'}
      nextButtonDisabled={analyzingModules}
      hideActions={preAnalyzing || generating || analyzingModules}
    >
      {preAnalyzing ? (
        <AIThinking
          title="AI 正在预分析原型..."
          subtitle="识别不确定的关键信息，预计需要 10 秒"
          progressItems={[
            { label: '分析原型结构和字段', status: 'processing' },
            { label: '识别不确定信息', status: 'pending' },
            { label: '生成确认问题', status: 'pending' }
          ]}
        />
      ) : generating ? (
        <AIThinking
          title="AI 正在生成需求文档..."
          subtitle="预计需要 30-90 秒，请耐心等待（最长3分钟）"
          progressItems={[
            { label: '已分析原型结构', status: 'completed' },
            { label: '正在理解业务逻辑...', status: 'processing' },
            { label: '生成详细需求文档（包含字段定义、校验规则等）', status: 'pending' }
          ]}
        />
      ) : (
        <div className="bg-gray-50 rounded-xl p-6">
          <MarkdownEditor
            value={requirementDoc}
            onChange={setRequirementDoc}
            placeholder="AI 正在生成需求文档..."
            rows={20}
          />
        </div>
      )}
    </StepCard>
  );

  // 渲染步骤3：三阶段渐进式生成
  const renderStep3 = () => {
    // 🆕 计算选中且未保存的测试目的数量
    const selectedCount = Object.keys(selectedPurposes).filter(
      key => selectedPurposes[key] && !savedPurposes[key]
    ).length;

    return (
      <div className="space-y-6">
        {/* 阶段1：分析测试模块中 */}
        {analyzingModules && (
          <AIThinking
            title="AI 正在分析测试模块..."
            subtitle="根据需求文档识别不同的测试模块（查询条件、列表展示、操作按钮等）"
            progressItems={[
              { label: '分析需求文档结构', status: 'processing' },
              { label: '识别页面类型', status: 'pending' },
              { label: '拆分测试模块', status: 'pending' }
            ]}
          />
        )}

        {/* 测试模块列表 */}
        {testModules.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                测试模块（共 {testModules.length} 个）
              </h3>
              <span className="text-sm text-gray-500">
                点击"生成测试目的"按钮开始第二阶段
              </span>
            </div>

            {/* 模块卡片列表 */}
            {testModules.map((module) => {
              const isExpanded = expandedModules[module.id];
              const isGeneratingPurposes = generatingPurposes[module.id];
              const hasPurposes = module.testPurposes && module.testPurposes.length > 0;

              return (
                <motion.div
                  key={module.id}
                  className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {/* 模块头部 */}
                  <div className="p-5 bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={clsx(
                            "px-3 py-1 rounded-full text-xs font-medium",
                            module.priority === 'high' && "bg-red-100 text-red-700",
                            module.priority === 'medium' && "bg-yellow-100 text-yellow-700",
                            module.priority === 'low' && "bg-green-100 text-green-700"
                          )}>
                            {module.priority === 'high' ? '高优先级' : module.priority === 'medium' ? '中优先级' : '低优先级'}
                          </span>
                          <span className="text-sm text-gray-700">
                            关联章节: {module.relatedSections.join(', ')}
                          </span>
                        </div>
                        <h4 className="text-lg font-semibold text-gray-900 mb-2">
                          {module.name}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {module.description}
                        </p>
                        {hasPurposes && (
                          <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                            <CheckCircle className="w-4 h-4" />
                            <span>已生成 {module.testPurposes.length} 个测试目的</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* 一键生成所有测试点按钮 */}
                        {hasPurposes && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleBatchGenerateModulePoints(module)}
                            isLoading={batchGeneratingModule === module.id}
                            disabled={batchGeneratingModule === module.id}
                          >
                            {batchGeneratingModule === module.id
                              ? `生成中 (${batchGenerateProgress.current}/${batchGenerateProgress.total})`
                              : '一键生成所有测试点'}
                          </Button>
                        )}

                        {!hasPurposes && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleGeneratePurposes(module)}
                            isLoading={isGeneratingPurposes}
                            disabled={isGeneratingPurposes}
                          >
                            {isGeneratingPurposes ? '生成中...' : '生成测试目的'}
                          </Button>
                        )}
                        {hasPurposes && (
                          <button
                            onClick={() => toggleModule(module.id)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <motion.div
                              animate={{ rotate: isExpanded ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ArrowRight className="w-5 h-5 text-gray-600" />
                            </motion.div>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 测试目的列表（可展开） */}
                  <AnimatePresence>
                    {isExpanded && hasPurposes && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="border-t border-gray-200 bg-gray-50"
                      >
                        <div className="p-5 space-y-3">
                          <p className="text-sm font-medium text-gray-700 mb-3">
                            测试目的列表（共 {module.testPurposes.length} 个）
                          </p>

                          {module.testPurposes.map((purpose: any) => {
                            const purposeKey = `${module.id}-${purpose.id}`;
                            const isGeneratingPoints = generatingPoints[purposeKey];
                            const hasTestCase = purpose.testCase;
                            const isSelected = selectedPurposes[purposeKey];
                            const isSaved = savedPurposes[purposeKey]; // 🆕 是否已保存

                            return (
                              <div
                                key={purpose.id}
                                className={clsx(
                                  "rounded-lg p-4 border transition-all",
                                  isSaved
                                    ? "bg-green-50 border-green-300"  // 🆕 已保存样式
                                    : isSelected
                                    ? "bg-purple-50 border-purple-500 shadow-md"
                                    : "bg-white border-gray-200 hover:border-purple-300"
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  {/* 复选框 */}
                                  <div className="pt-1">
                                    <input
                                      type="checkbox"
                                      checked={isSelected || false}
                                      disabled={!hasTestCase || isSaved}  // 🆕 已保存时禁用
                                      onChange={() => togglePurposeSelect(module.id, purpose.id)}
                                      className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    />
                                  </div>

                                  {/* 内容区域 */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                      <h5 className="font-medium text-gray-900">
                                        {purpose.name}
                                      </h5>
                                      <span className={clsx(
                                        "px-2 py-0.5 rounded text-xs font-medium",
                                        purpose.priority === 'high' && "bg-red-100 text-red-700",
                                        purpose.priority === 'medium' && "bg-yellow-100 text-yellow-700",
                                        purpose.priority === 'low' && "bg-green-100 text-green-700"
                                      )}>
                                        {purpose.priority}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-600 mb-2">
                                      {purpose.description}
                                    </p>
                                    <div className="flex items-center gap-4 text-sm text-gray-700">
                                      <span>覆盖范围: {purpose.coverageAreas}</span>
                                      <span>预估 {purpose.estimatedTestPoints} 个测试点</span>
                                    </div>
                                    {hasTestCase && !isSaved && (
                                      <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                                        <CheckCircle className="w-4 h-4" />
                                        <span>已生成测试用例</span>
                                      </div>
                                    )}
                                    {isSaved && (
                                      <div className="mt-2 flex items-center gap-2 text-sm font-medium text-green-700">
                                        <CheckCircle className="w-4 h-4 fill-green-700" />
                                        <span>✅ 已保存到用例库</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* 操作按钮 */}
                                  <div className="flex-shrink-0">
                                    <Button
                                      variant={hasTestCase ? "outline" : "default"}
                                      size="sm"
                                      onClick={() => {
                                        if (hasTestCase) {
                                          handleViewDetail(hasTestCase);
                                        } else {
                                          handleGeneratePoints(purpose, module);
                                        }
                                      }}
                                      isLoading={isGeneratingPoints}
                                      disabled={isGeneratingPoints}
                                    >
                                      {isGeneratingPoints ? '生成中...' : hasTestCase ? '查看用例' : '生成测试点'}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* 草稿箱 */}
        {draftCases.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mt-6">
            {/* 头部 */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                  {draftCases.length}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">测试用例草稿箱</h3>
                  <p className="text-sm text-gray-500">
                    已生成 {draftCases.length} 个用例，选中 {selectedCount} 个测试目的
                  </p>
                </div>
              </div>

              <Button
                variant="default"
                size="lg"
                icon={<Save className="w-5 h-5" />}
                onClick={saveSelectedCases}
                isLoading={saving}
                disabled={selectedCount === 0}
              >
                💾 保存选中用例 ({selectedCount})
              </Button>
            </div>

            {/* 用例列表 */}
            <div className="space-y-4">
              {draftCases.map((testCase) => (
                <DraftCaseCard
                  key={testCase.id}
                  testCase={testCase}
                  onToggleSelect={() => {
                    setDraftCases(prev =>
                      prev.map(c => c.id === testCase.id ? { ...c, selected: !c.selected } : c)
                    );
                  }}
                  onView={() => handleViewDetail(testCase)}
                  onDelete={() => {
                    setDraftCases(prev => prev.filter(c => c.id !== testCase.id));
                    showToast.success('用例已删除');
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* 空状态提示 */}
        {!analyzingModules && testModules.length === 0 && draftCases.length === 0 && (
          <div className="bg-white rounded-2xl p-16 text-center">
            <FileX className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              暂无测试模块
            </h3>
            <p className="text-sm text-gray-600">
              点击上方"立即生成测试用例"按钮开始分析
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* 页面头部 */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          {/* 标题区 */}
          <div className="flex items-center gap-4 mb-4">
            {/* AI 图标 */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Sparkles className="w-6 h-6 text-white" />
            </div>

            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                AI 测试用例生成器
              </h1>
              <p className="text-sm text-gray-500">
                从 Axure 原型到完整测试用例,一站式 AI 驱动
              </p>
            </div>
          </div>

          {/* 进度指示器 */}
          <ProgressIndicator
            currentStep={currentStep}
            totalSteps={STEPS.length}
            steps={STEPS}
          />
        </div>
      </header>

      {/* 内容区 */}
      <div className={clsx(
        "mx-auto px-6 py-8",
        currentStep === 0 && "max-w-7xl",
        currentStep === 1 && "max-w-4xl",
        currentStep === 2 && "max-w-6xl"
      )}>
        <AnimatePresence mode="wait">
          {/* 步骤1 */}
          {currentStep === 0 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {renderStep1()}
            </motion.div>
          )}

          {/* 步骤2 */}
          {currentStep === 1 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* 已完成的步骤1 */}
              <StepCard
                stepNumber={1}
                title="上传 Axure 原型"
                isCompleted={true}
                completedSummary={`已上传 ${axureFiles.length} 个文件`}
                onEdit={() => setCurrentStep(0)}
              />
              {renderStep2()}
            </motion.div>
          )}

          {/* 步骤3 */}
          {currentStep === 2 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* 已完成的步骤1和2 */}
              <StepCard
                stepNumber={1}
                title="上传 Axure 原型"
                isCompleted={true}
                completedSummary={`已上传 ${axureFiles.length} 个文件`}
                onEdit={() => setCurrentStep(0)}
              />
              <StepCard
                stepNumber={2}
                title="AI 生成需求文档"
                isCompleted={true}
                completedSummary={`需求文档已生成 (${requirementDoc.length} 字)`}
                onEdit={() => setCurrentStep(1)}
              />
              {renderStep3()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 底部固定操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg
                      border-t border-gray-200 shadow-2xl z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* 左侧统计 */}
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{draftCases.length}</div>
                  <div className="text-sm text-gray-700">总用例</div>
                </div>
              </div>

              <div className="w-px h-10 bg-gray-200" />

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{selectedCount}</div>
                  <div className="text-sm text-gray-700">已选中</div>
                </div>
              </div>

              {draftCases.length > 0 && (
                <>
                  <div className="w-px h-10 bg-gray-200" />
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{avgQuality}</div>
                      <div className="text-sm text-gray-700">平均质量</div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 右侧操作 */}
            <div className="flex items-center gap-3">
              {currentStep > 0 && currentStep < 2 && (
                <Button
                  variant="outline"
                  icon={<ArrowLeft className="w-4 h-4" />}
                  onClick={() => setCurrentStep(prev => prev - 1)}
                >
                  上一步
                </Button>
              )}

              {currentStep === 2 && draftCases.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(1)}
                  >
                    修改需求
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    icon={<Save className="w-5 h-5" />}
                    isLoading={saving}
                    disabled={selectedCount === 0}
                    onClick={saveSelectedCases}
                    className="px-6"
                  >
                    💾 保存选中用例 ({selectedCount})
                  </Button>
                  <Button
                    variant="default"
                    size="lg"
                    icon={<CheckCircle className="w-5 h-5" />}
                    isLoading={saving}
                    disabled={selectedCount === 0}
                    onClick={saveToLibrary}
                    className="px-8 shadow-lg"
                  >
                    ✅ 保存并完成 ({selectedCount})
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 🆕 智能补全对话框 */}
      {preAnalysisResult && (
        <SmartCompletionModal
          open={completionModalOpen}
          preAnalysisResult={preAnalysisResult}
          onConfirm={handleConfirmations}
          onSkip={handleSkipCompletion}
          loading={generating}
        />
      )}

      {/* 测试用例详情对话框 */}
      <TestCaseDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        testCase={currentDetailCase}
        onSave={handleSaveDetail}
      />

      {/* 自定义样式 */}
      <style>{`
        .requirement-editor {
          font-family: 'JetBrains Mono', 'Consolas', monospace;
          font-size: 14px;
          line-height: 1.75;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          transition: all 0.2s ease;
        }

        .requirement-editor:focus {
          border-color: #8b5cf6;
          box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.1);
        }
      `}</style>
    </div>
  );
}

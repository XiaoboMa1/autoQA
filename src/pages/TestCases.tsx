import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Filter,
  Play,
  Edit3,
  Trash2,
  Tag,
  Clock,
  User,
  FileText,
  Code,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FolderOpen,
  Package,
  HelpCircle,
  Bot,
  RotateCcw,
  Table,
  AlignLeft
} from 'lucide-react';
import { clsx } from 'clsx';
import { Layout } from '../components/Layout';
import { testService } from '../services/testService';
import * as systemService from '../services/systemService';
import type { TestCase, TestSuite as TestSuiteType, TestStepRow, SystemOption } from '../types/test';
import { useNavigate } from 'react-router-dom';
import { Modal, ConfirmModal } from '../components/ui/modal';
import { Button } from '../components/ui/button';
import { showToast } from '../utils/toast';
import { aiBulkUpdateService } from '../services/aiBulkUpdateService';
import { TagInput } from '../components/ui/TagInput';
import { TestCaseTable } from '../components/TestCaseTable';
import { StepTableEditor } from '../components/StepTableEditor';
import { parseStepsText, serializeStepsToText } from '../utils/stepConverter';
import { useAuth } from '../contexts/AuthContext';

// 表单数据接口
interface CreateTestCaseForm {
  name: string;
  steps: string;
  assertions: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'draft' | 'disabled';
  tags: string;
  system: string;
  module: string;
}

// 🔥 新增：测试套件表单接口
interface CreateTestSuiteForm {
  name: string;
  description: string;
  testCases: number[];
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'draft' | 'disabled';
  tags: string;
}

export function TestCases() {
  // 🔥 获取当前用户信息
  const { user } = useAuth();

  // 🔥 新增: 导航钩子
  const navigate = useNavigate();

  // 🔥 新增：Tab状态管理
  const [activeTab, setActiveTab] = useState<'cases' | 'suites'>('cases');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedSystem, setSelectedSystem] = useState('');
  const [runningTestId, setRunningTestId] = useState<number | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [testCasesLoading, setTestCasesLoading] = useState(false);

  // 🔥 新增：分页状态管理
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0
  });
  const [editingTestCase, setEditingTestCase] = useState<TestCase | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingTestCase, setDeletingTestCase] = useState<TestCase | null>(null);
  
  // 🔥 新增：测试套件状态管理
  const [testSuites, setTestSuites] = useState<TestSuiteType[]>([]);
  const [editingTestSuite, setEditingTestSuite] = useState<TestSuiteType | null>(null);
  const [deletingTestSuite, setDeletingTestSuite] = useState<TestSuiteType | null>(null);
  const [runningSuiteId, setRunningSuiteId] = useState<number | null>(null);
  
  // 🔥 新增：AI批量更新状态管理
  const [aiFeatureAvailable, setAiFeatureAvailable] = useState(false);
  const [checkingFeature, setCheckingFeature] = useState(true);

  // 🔥 新增：系统字典列表
  const [systemOptions, setSystemOptions] = useState<SystemOption[]>([]);

  const [formData, setFormData] = useState<CreateTestCaseForm>({
    name: '',
    steps: '',
    assertions: '',
    priority: 'medium',
    status: 'draft',
    tags: '',
    system: '',
    module: ''
  });

  // 🔥 新增：测试套件表单数据
  const [suiteFormData, setSuiteFormData] = useState<CreateTestSuiteForm>({
    name: '',
    description: '',
    testCases: [],
    priority: 'medium',
    status: 'draft',
    tags: ''
  });
  const [formDirty, setFormDirty] = useState(false);
  const [suiteFormDirty, setSuiteFormDirty] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const suiteNameInputRef = useRef<HTMLInputElement>(null);
  const stepsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [stepsTouched, setStepsTouched] = useState(false);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [stepsSoftWrap, setStepsSoftWrap] = useState(true);
  const [suiteNameTouched, setSuiteNameTouched] = useState(false);
  const [suiteCaseSearch, setSuiteCaseSearch] = useState('');
  const [stepsHelpOpen, setStepsHelpOpen] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  // 🔥 新增：步骤编辑器模式和结构化数据
  const [stepsEditorMode, setStepsEditorMode] = useState<'text' | 'table'>('table'); // 默认表格模式
  const [stepsData, setStepsData] = useState<TestStepRow[]>([]);

  // 🔥 新增：加载系统字典列表
  useEffect(() => {
    const loadSystems = async () => {
      try {
        const systems = await systemService.getActiveSystems();
        setSystemOptions(systems);
      } catch (error) {
        console.error('加载系统列表失败:', error);
        showToast('加载系统列表失败', 'error');
      }
    };
    loadSystems();
  }, []);

  // 🔥 新增：初始化时加载用户偏好的编辑器模式
  useEffect(() => {
    const savedMode = localStorage.getItem('stepsEditorMode') as 'text' | 'table' | null;
    if (savedMode) {
      setStepsEditorMode(savedMode);
    }
  }, []);

  // 🔥 新增：当编辑现有用例时，解析步骤数据
  useEffect(() => {
    if (editingTestCase && showCreateModal) {
      // 如果是表格模式，解析文本为结构化数据
      if (stepsEditorMode === 'table') {
        const parsed = parseStepsText(editingTestCase.steps);
        setStepsData(parsed);
      }
    } else if (!showCreateModal) {
      // 关闭弹窗时清空数据
      setStepsData([]);
    }
  }, [editingTestCase, showCreateModal, stepsEditorMode]);

  // 🔥 新增：检查AI批量更新功能可用性
  const checkAIBulkUpdateAvailability = async () => {
    try {
      setCheckingFeature(true);
      console.log('🔍 [AI_Bulk_Update] 检查功能可用性...');

      // 调用真实的AI服务检查功能可用性
      const available = await aiBulkUpdateService.checkFeatureAvailability();
      setAiFeatureAvailable(available);

      console.log('✅ [AI_Bulk_Update] 功能检查完成，可用状态:', available);
      
    } catch (error) {
      console.error('❌ [AI_Bulk_Update] 检查功能可用性失败:', error);
      setAiFeatureAvailable(false);
    } finally {
      setCheckingFeature(false);
    }
  };

  // 🔥 初始化加载 - 默认加载第一页10条数据
  useEffect(() => {
    // 设置默认分页参数
    setPagination({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
    loadTestCases({ page: 1, pageSize: 10, resetPagination: true });
    loadTestSuites();
    checkAIBulkUpdateAvailability();
    
    // 🔥 添加WebSocket连接状态检查
    const initWebSocket = async () => {
      try {
        await testService.initializeWebSocket();
        console.log('✅ WebSocket连接已初始化');
      } catch (error) {
        console.error('❌ WebSocket连接初始化失败:', error);
      }
    };
    
    // 初始化WebSocket
    initWebSocket();
    
    // 设置定期检查WebSocket连接状态
    const wsCheckInterval = setInterval(() => {
      if (!testService.isWebSocketConnected()) {
        console.log('⚠️ WebSocket连接已断开，尝试重连...');
        initWebSocket();
      }
    }, 10000); // 每10秒检查一次
    
    // 🔥 添加状态清理超时机制 - 防止状态永久卡住
    const stateCleanupTimeouts: ReturnType<typeof setTimeout>[] = [];
    
    // 监听 runningTestId 变化，设置清理超时
    if (runningTestId !== null) {
      const timeout = setTimeout(() => {
        console.warn('⚠️ 测试运行状态超时，强制清理');
        setRunningTestId(null);
      }, 10 * 60 * 1000); // 10分钟超时
      stateCleanupTimeouts.push(timeout);
    }
    
    // 监听 runningSuiteId 变化，设置清理超时  
    if (runningSuiteId !== null) {
      const timeout = setTimeout(() => {
        console.warn('⚠️ 套件运行状态超时，强制清理');
        setRunningSuiteId(null);
      }, 15 * 60 * 1000); // 15分钟超时（套件可能运行更久）
      stateCleanupTimeouts.push(timeout);
    }
    
    // 清理函数
    return () => {
      clearInterval(wsCheckInterval);
      stateCleanupTimeouts.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  // 🔥 新增：分页加载测试用例
  const loadTestCases = async (params?: {
    page?: number;
    pageSize?: number;
    resetPagination?: boolean;
  }) => {
    try {
      console.log('🔄 [TestCases] 开始重新加载测试用例...');
      setTestCasesLoading(true);

      const currentPage = params?.page ?? pagination.page;
      const currentPageSize = params?.pageSize ?? pagination.pageSize;

      const result = await testService.getTestCasesPaginated({
        page: currentPage,
        pageSize: currentPageSize,
        search: searchTerm, // 🔥 改为使用searchTerm而非searchQuery
        tag: selectedTag,
        priority: selectedPriority,
        status: '',
        system: selectedSystem
      });

      console.log('📊 [TestCases] 获取到分页数据:', {
        count: result.data?.length || 0,
        total: result.pagination.total,
        page: result.pagination.page
      });

      setTestCases(result.data || []);

      // 更新分页信息
      if (params?.resetPagination) {
        setPagination({
          page: 1,
          pageSize: currentPageSize,
          total: result.pagination.total,
          totalPages: result.pagination.totalPages
        });
      } else {
        setPagination({
          page: result.pagination.page,
          pageSize: result.pagination.pageSize,
          total: result.pagination.total,
          totalPages: result.pagination.totalPages
        });
      }

      console.log('✅ [TestCases] 测试用例状态已更新');
    } catch (error) {
      console.error('❌ [TestCases] 加载测试用例失败:', error);
      setTestCases([]);
      setPagination(prev => ({ ...prev, total: 0, totalPages: 0 }));
    } finally {
      setTestCasesLoading(false);
    }
  };

  // 🔥 新增：加载测试套件
  const loadTestSuites = async () => {
    try {
      console.log('🔄 [TestCases] 开始重新加载测试套件...');
      setLoading(true);
      const suites = await testService.getTestSuites();
      console.log('📊 [TestCases] 获取到测试套件数量:', suites?.length || 0);
      setTestSuites(suites || []);
      console.log('✅ [TestCases] 测试套件状态已更新');
    } catch (error) {
      console.error('❌ [TestCases] 加载测试套件失败:', error);
      setTestSuites([]);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 新增：切换编辑器模式（文本 ↔ 表格）
  const handleToggleEditorMode = () => {
    const newMode = stepsEditorMode === 'text' ? 'table' : 'text';

    // 从文本模式切换到表格模式：解析文本为结构化数据
    if (newMode === 'table') {
      const parsed = parseStepsText(formData.steps);
      setStepsData(parsed);
    }
    // 从表格模式切换到文本模式：序列化结构化数据为文本
    else {
      const serialized = serializeStepsToText(stepsData);
      setFormData(prev => ({ ...prev, steps: serialized }));
    }

    setStepsEditorMode(newMode);
    localStorage.setItem('stepsEditorMode', newMode); // 记住用户偏好
  };

  // 🔥 新增：表格数据变化时同步到文本字段
  const handleStepsDataChange = (newStepsData: TestStepRow[]) => {
    setStepsData(newStepsData);
    // 同步更新文本格式（保持兼容性）
    const serialized = serializeStepsToText(newStepsData);
    setFormData(prev => ({ ...prev, steps: serialized }));
    setFormDirty(true);
  };

  const handleCreateTestCase = async (keepOpen = false) => {
    // 🔥 防重复点击检查
    if (loading) {
      console.log('⚠️ 操作正在进行中，忽略重复点击');
      return;
    }

    if (!formData.name.trim()) {
      showToast.warning('请输入测试用例名称');
      setNameTouched(true);
      setTimeout(() => nameInputRef.current?.focus(), 0);
      return;
    }
    
    if (!formData.steps.trim()) {
      showToast.warning('请输入测试步骤');
      setStepsTouched(true);
      setTimeout(() => {
        stepsTextareaRef.current?.focus();
        stepsTextareaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 0);
      return;
    }

    try {
      setLoading(true);
      
      if (editingTestCase) {
        // 编辑模式
        const updatedTestCase = {
          ...editingTestCase,
          name: formData.name.trim(),
          steps: formData.steps.trim(),
          assertions: formData.assertions.trim(),
          priority: formData.priority,
          status: formData.status,
          tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0),
          system: formData.system.trim() || undefined,
          module: formData.module.trim() || undefined
        };

        try {
          await testService.updateTestCase(editingTestCase.id, updatedTestCase);
          await loadTestCases();
          resetForm();
          showToast.success('测试用例更新成功！');
        } catch (error: any) {
          throw new Error(error.message || '更新失败');
        }
      } else {
        // 创建模式
        const newTestCase = {
          name: formData.name.trim(),
          steps: formData.steps.trim(),
          assertions: formData.assertions.trim(),
          priority: formData.priority,
          status: formData.status,
          tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0),
          system: formData.system.trim() || undefined,
          module: formData.module.trim() || undefined,
          department: user?.department || undefined, // 🔥 添加当前用户的部门
          author: '当前用户',
          created: new Date().toISOString().split('T')[0],
          lastRun: '从未运行',
          success_rate: 0
        };

        try {
          await testService.createTestCase(newTestCase);
          await loadTestCases();
          if (keepOpen) {
            setFormData({
              name: '',
              steps: '',
              assertions: '',
              priority: 'medium',
              status: 'draft',
              tags: '',
              system: '',
              module: ''
            });
            setFormDirty(false);
            setEditingTestCase(null);
            showToast.success('测试用例已创建，已为你保留表单，便于继续录入');
            setTimeout(() => nameInputRef.current?.focus(), 0);
          } else {
            resetForm();
            showToast.success('测试用例创建成功！');
          }
        } catch (error: any) {
          throw new Error(error.message || '创建失败');
        }
      }
    } catch (error: any) {
      console.error('操作测试用例失败:', error);
      showToast.error(`操作失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 处理测试用例数据中的可选字段 - 改为导航到编辑页面
  const handleEditTestCase = (testCase: TestCase) => {
    navigate(`/test-cases/${testCase.id}/edit`);
  };

  const handleDeleteTestCase = (testCase: TestCase) => {
    setDeletingTestCase(testCase);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deletingTestCase) return;

    try {
      setLoading(true);
      
      try {
        await testService.deleteTestCase(deletingTestCase.id);
        await loadTestCases();
        setShowDeleteModal(false);
        setDeletingTestCase(null);
        showToast.success('测试用例删除成功！');
      } catch (error: any) {
        throw new Error(error.message || '删除失败');
      }
    } catch (error: any) {
      console.error('删除测试用例失败:', error);
      showToast.error(`删除失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      steps: '',
      assertions: '',
      priority: 'medium',
      status: 'draft',
      tags: '',
      system: '',
      module: ''
    });
    setShowCreateModal(false);
    setEditingTestCase(null);
    setFormDirty(false);
  };

  // 🔥 新增：重置套件表单
  const resetSuiteForm = () => {
    setSuiteFormData({
      name: '',
      description: '',
      testCases: [],
      priority: 'medium',
      status: 'draft',
      tags: ''
    });
    setShowCreateModal(false);
    setEditingTestSuite(null);
    setSuiteFormDirty(false);
  };

  // 关闭创建/编辑弹窗（包含未保存更改提示）
  const handleCloseModal = () => {
    if (activeTab === 'cases') {
      if (formDirty) {
        setShowUnsavedConfirm(true);
        return;
      }
      resetForm();
      setFormDirty(false);
    } else {
      if (suiteFormDirty) {
        setShowUnsavedConfirm(true);
        return;
      }
      resetSuiteForm();
      setSuiteFormDirty(false);
    }
  };

  // 🔥 新增：创建/编辑测试套件
  const handleCreateTestSuite = async (keepOpen = false) => {
    // 🔥 防重复点击检查
    if (loading) {
      console.log('⚠️ 操作正在进行中，忽略重复点击');
      return;
    }

    if (!suiteFormData.name.trim()) {
      showToast.warning('请输入测试套件名称');
      setSuiteNameTouched(true);
      setTimeout(() => suiteNameInputRef.current?.focus(), 0);
      return;
    }
    
    if (suiteFormData.testCases.length === 0) {
      showToast.warning('请选择至少一个测试用例');
      return;
    }

    try {
      setLoading(true);
      
      if (editingTestSuite) {
        // 编辑模式
        const updatedSuite = {
          ...editingTestSuite,
          name: suiteFormData.name.trim(),
          description: suiteFormData.description.trim(),
          testCaseIds: suiteFormData.testCases, // 🔥 修复：使用正确的字段名
          priority: suiteFormData.priority,
          status: suiteFormData.status,
          tags: suiteFormData.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
        };

        try {
          await testService.updateTestSuite(editingTestSuite.id, updatedSuite);
          await loadTestSuites();
          resetSuiteForm();
          showToast.success('测试套件更新成功！');
        } catch (error: any) {
          throw new Error(error.message || '更新失败');
        }
      } else {
        // 创建模式
        const newSuite = {
          name: suiteFormData.name.trim(),
          description: suiteFormData.description.trim(),
          testCaseIds: suiteFormData.testCases, // 🔥 修复：使用正确的字段名
          priority: suiteFormData.priority,
          status: suiteFormData.status,
          tags: suiteFormData.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0),
          department: user?.department || undefined, // 🔥 添加当前用户的部门
          author: '当前用户',
          created: new Date().toISOString().split('T')[0]
        };

        try {
          await testService.createTestSuite(newSuite);
          await loadTestSuites();
          if (keepOpen) {
            setSuiteFormData({
              name: '',
              description: '',
              testCases: [],
              priority: 'medium',
              status: 'draft',
              tags: ''
            });
            setSuiteFormDirty(false);
            setEditingTestSuite(null);
            showToast.success('测试套件已创建，已为你保留表单，便于继续录入');
            setTimeout(() => suiteNameInputRef.current?.focus(), 0);
          } else {
            resetSuiteForm();
            showToast.success('测试套件创建成功！');
          }
        } catch (error: any) {
          throw new Error(error.message || '创建失败');
        }
      }
    } catch (error: any) {
      console.error('操作测试套件失败:', error);
      showToast.error(`操作失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 新增：编辑测试套件
  const handleEditTestSuite = (testSuite: TestSuiteType) => {
    setEditingTestSuite(testSuite);
    setSuiteFormData({
      name: testSuite.name,
      description: testSuite.description || '',
      testCases: testSuite.testCaseIds,
      priority: testSuite.priority || 'medium',
      status: testSuite.status || 'active',
      tags: testSuite.tags?.join(', ') || ''
    });
    setShowCreateModal(true);
  };

  // 🔥 新增：删除测试套件
  const handleDeleteTestSuite = (testSuite: TestSuiteType) => {
    setDeletingTestSuite(testSuite);
    setShowDeleteModal(true);
  };

  // 🔥 新增：确认删除套件
  const confirmDeleteSuite = async () => {
    if (!deletingTestSuite) return;

    try {
      setLoading(true);
      
      try {
        await testService.deleteTestSuite(deletingTestSuite.id);
        await loadTestSuites();
        setShowDeleteModal(false);
        setDeletingTestSuite(null);
        showToast.success('测试套件删除成功！');
      } catch (error: any) {
        throw new Error(error.message || '删除失败');
      }
      
    } catch (error: any) {
      console.error('删除测试套件失败:', error);
      showToast.error(`删除失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 新增：运行测试套件 - 使用WebSocket监听而非模拟通知
  const handleRunTestSuite = async (testSuite: TestSuiteType) => {
    if (runningSuiteId) {
      showToast.warning('已有套件在运行中，请等待完成');
      return;
    }

    setRunningSuiteId(testSuite.id);
    let suiteRunId = '';
    
    try {
      console.log(`🚀 开始执行测试套件: ${testSuite.name}`);
      
      try {
        // 添加一次性监听器，用于接收套件完成通知
        const listenerId = `suite-run-${testSuite.id}-${Date.now()}`;
        let messageReceivedFlag = false;
        
        testService.addMessageListener(listenerId, (message) => {
          console.log(`📣 [TestSuite] 收到WebSocket消息:`, message);
          messageReceivedFlag = true;
          
          // 🔥 立即重置loading状态，无论消息格式如何
          // 🔥 任何测试相关的消息都应该重置loading状态
          const shouldReset = 
            message.type === 'suiteUpdate' ||
            message.type === 'test_complete' ||
            message.type === 'test_error' ||
            (message.data && (message.data.status === 'completed' || message.data.status === 'failed' || message.data.status === 'error' || message.data.status === 'cancelled'));
          
          if (shouldReset) {
            console.log(`✅ 收到测试完成通知，重置状态:`, message);
            setRunningSuiteId(null);
            testService.removeMessageListener(listenerId);
            
            // 根据状态显示不同消息
            const status = message.data?.status || 'completed';
            if (status === 'failed' || status === 'error') {
              showToast.error(`❌ 测试套件执行失败: ${testSuite.name}`);
            } else if (status === 'cancelled') {
              showToast.warning(`⚠️ 测试套件执行被取消: ${testSuite.name}`);
            } else {
              showToast.success(`🎉 测试套件执行完成: ${testSuite.name}`);
            }
            
            // 导航到测试运行页面
            navigate('/test-runs');
          }
        });
        
        // 启动测试套件
        const response = await testService.runTestSuite(testSuite.id);
        suiteRunId = response.runId;
        showToast.info(`✅ 测试套件开始执行: ${testSuite.name}\n运行ID: ${response.runId}`);
        console.log('套件运行ID:', response.runId);
        
        // 设置安全超时（5分钟），以防WebSocket消息丢失
        setTimeout(() => {
          if (runningSuiteId === testSuite.id) {
            console.warn('⚠️ 套件执行超时保护触发，重置状态');
            setRunningSuiteId(null);
            testService.removeMessageListener(listenerId);
            
            if (!messageReceivedFlag) {
              // 从未收到任何消息，可能是WebSocket彻底断开了
              showToast.warning('⚠️ 未收到任何WebSocket消息，可能连接已断开。已重置界面状态。');
              testService.initializeWebSocket().catch(e => console.error('重连失败:', e));
            } else {
              showToast.warning('测试套件执行超时，已重置界面状态。请检查测试运行页面查看实际执行结果。');
            }
          }
        }, 3 * 60 * 1000); // 3分钟超时
        
        // 添加周期性状态检查，防止消息丢失
        let checkCount = 0;
        const maxChecks = 10;
        const statusCheckInterval = setInterval(async () => {
          checkCount++;
          
          // 如果已经超出检查次数或者套件不再运行，停止检查
          if (checkCount > maxChecks || runningSuiteId !== testSuite.id) {
            clearInterval(statusCheckInterval);
            return;
          }
          
          // 检查套件状态
          if (suiteRunId) {
            try {
              const suiteStatus = await testService.getSuiteRun(suiteRunId);
              console.log(`🔍 定期检查套件状态: ${suiteStatus?.status}`);
              
              if (suiteStatus && (suiteStatus.status === 'completed' || 
                  suiteStatus.status === 'failed' || 
                  suiteStatus.status === 'cancelled')) {
                console.log('✅ 定期检查发现套件已完成');
                clearInterval(statusCheckInterval);
                setRunningSuiteId(null);
                testService.removeMessageListener(listenerId);
                showToast.success(`🎉 测试套件执行完成: ${testSuite.name} (通过定期检查发现)`);
                navigate('/test-runs');
              }
            } catch (error) {
              console.error('定期检查套件状态失败:', error);
            }
          }
        }, 30000); // 每30秒检查一次
        
      } catch (error: any) {
        setRunningSuiteId(null);
        throw new Error(error.message || '启动测试套件失败');
      }
      
    } catch (error: any) {
      console.error('执行测试套件失败:', error);
      showToast.error(`❌ 执行测试套件失败: ${error.message}`);
      setRunningSuiteId(null);
    }
  };

  const allTags = Array.from(new Set(testCases.flatMap(tc => tc.tags)));
  const allSuiteTags = Array.from(new Set(testSuites.flatMap(suite => suite.tags || [])));
  const moduleOptions = Array.from(new Set(testCases.map(tc => tc.module).filter(Boolean)));

  // 🔥 移除前端过滤逻辑：现在由后端分页API处理所有过滤

  // 🔥 新增：过滤测试套件
  const filteredTestSuites = testSuites.filter(testSuite => {
    const matchesSearch = testSuite.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (testSuite.description && testSuite.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesTag = selectedTag === '' || (testSuite.tags && testSuite.tags.includes(selectedTag));
    const matchesPriority = selectedPriority === '' || testSuite.priority === selectedPriority;
    
    return matchesSearch && matchesTag && matchesPriority;
  });

  // 🔥 运行测试用例 - 使用WebSocket监听而非模拟通知
  const handleRunTest = async (testCase: TestCase) => {
    if (runningTestId) {
      showToast.warning('已有测试在运行中，请等待完成');
      return;
    }

    setRunningTestId(testCase.id);
    
    try {
      console.log(`🚀 开始执行测试: ${testCase.name}`);
      
      try {
        // 启动WebSocket监听器来跟踪测试运行
        const listenerId = `test-run-${testCase.id}`;
        
        // 添加一次性监听器，用于接收测试完成通知
        testService.addMessageListener(listenerId, (message) => {
          console.log(`📣 [TestCase] 收到WebSocket消息:`, message);
          
          // 立即重置loading状态，无论消息格式如何
          // 任何测试相关的消息都应该重置loading状态
          const shouldReset = 
            message.type === 'test_complete' ||
            message.type === 'test_update' ||
            message.type === 'test_error' ||
            message.type === 'suiteUpdate' ||
            (message.data && (message.data.status === 'completed' || message.data.status === 'failed' || message.data.status === 'error' || message.data.status === 'cancelled'));
          
          if (shouldReset) {
            console.log(`✅ 收到测试完成通知，重置状态:`, message);
            setRunningTestId(null);
            testService.removeMessageListener(listenerId);
            
            // 根据状态显示不同消息
            const status = message.data?.status || 'completed';
            if (status === 'failed' || status === 'error') {
              showToast.error(`❌ 测试执行失败: ${testCase.name}`);
            } else if (status === 'cancelled') {
              showToast.warning(`⚠️ 测试执行被取消: ${testCase.name}`);
            } else {
              showToast.success(`🎉 测试执行完成: ${testCase.name}`);
            }
            
            // 导航到测试运行页面
            navigate('/test-runs');
          }
        });
        
        // 启动测试
        const response = await testService.runTestCase(testCase.id);
        showToast.info(`✅ 测试开始执行: ${testCase.name}\n运行ID: ${response.runId}`);
        console.log('测试运行ID:', response.runId);
      } catch (error: any) {
        setRunningTestId(null);
        throw new Error(error.message || '启动测试失败');
      }
      
    } catch (error: any) {
      console.error('执行测试失败:', error);
      showToast.error(`❌ 执行测试失败: ${error.message}`);
      setRunningTestId(null);
    }
  };

  // 规范化“1、xxx 2、xxx …”步骤文本为多行
  const normalizeSteps = (text: string) => {
    if (!text) return '';
    let normalized = text.replace(/\r\n/g, '\n').trim();
    // 仅拆分“行首编号”：1. / 1、 / 1)
    normalized = ('\n' + normalized)
      .replace(/\n\s*(\d+[\.、\)])/g, '\n$1 ')
      .replace(/\n{2,}/g, '\n')
      .trim();
    return normalized;
  };

  // 粘贴时自动解析为多行步骤
  const handleStepsPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;
    if (/\d+[\.\、\)]/.test(pasted)) {
      e.preventDefault();
      const normalized = normalizeSteps(pasted);
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      const current = formData.steps || '';
      const next = current.slice(0, start) + normalized + current.slice(end);
      setFormData(prev => ({ ...prev, steps: next }));
      setFormDirty(true);
    }
  };

  // 弹窗打开自动聚焦 + 快捷键提交（Ctrl/Cmd + Enter）
  useEffect(() => {
    if (!showCreateModal) return;
    try {
      if (activeTab === 'cases') {
        nameInputRef?.current?.focus();
      } else {
        suiteNameInputRef?.current?.focus();
      }
    } catch {}
  }, [showCreateModal, activeTab]);

  useEffect(() => {
    if (!showCreateModal) return;
    const handler = (e: KeyboardEvent) => {
      // 提交：Ctrl/Cmd + Enter
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (activeTab === 'cases') {
          if (!loading && formData.name.trim() && formData.steps.trim()) {
            handleCreateTestCase();
          }
        } else {
          if (!loading && suiteFormData.name.trim() && suiteFormData.testCases.length > 0) {
            handleCreateTestSuite();
          }
        }
      }
      // 切换展开编辑：Alt + E
      if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        if (activeTab === 'cases') {
          setStepsExpanded(v => !v);
        }
      }
      // 切换软换行：Alt + W
      if (e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        if (activeTab === 'cases') {
          setStepsSoftWrap(v => !v);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showCreateModal, activeTab, loading, formData.name, formData.steps, suiteFormData.name, suiteFormData.testCases]);

  useEffect(() => {
    if (showCreateModal && activeTab === 'cases' && stepsExpanded) {
      try {
        stepsTextareaRef.current?.focus();
        stepsTextareaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {}
    }
  }, [showCreateModal, activeTab, stepsExpanded]);

  // 🔥 新增：分页控制函数
  const handlePageChange = (page: number) => {
    console.log('📄 [TestCases] 切换页码:', page);
    loadTestCases({ page });
  };

  const handlePageSizeChange = (pageSize: number) => {
    console.log('📏 [TestCases] 切换页面大小:', pageSize);
    loadTestCases({ page: 1, pageSize, resetPagination: true });
  };

  // 🔥 新增：手动搜索功能
  const handleSearch = () => {
    console.log('🔍 [TestCases] 执行手动搜索:', { searchTerm, selectedTag, selectedPriority, selectedSystem });
    loadTestCases({ page: 1, resetPagination: true });
  };

  // 🔥 新增：重置功能
  const handleReset = () => {
    console.log('🔄 [TestCases] 重置搜索条件');
    setSearchTerm('');
    setSelectedTag('');
    setSelectedPriority('');
    setSelectedSystem('');
    // 延时执行以确保状态更新完成
    setTimeout(() => loadTestCases({ page: 1, resetPagination: true }), 10);
  };

  // 🔥 移除自动搜索逻辑，改为手动搜索

  // 已移除自动高度，改为 CSS min-height 控制

  const getPriorityColor = (priority: string | undefined) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string | undefined) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      case 'disabled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">测试管理</h2>
          <p className="text-gray-600">创建、编辑和管理您的自动化测试用例和测试套件</p>
        </div>
        <div className="flex space-x-2">
          {/* 🔥 新增: 重置按钮 */}
          {(runningTestId || runningSuiteId) && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                if (window.confirm('确定要重置执行状态吗？如果测试仍在运行，这可能会导致界面状态不同步。')) {
                  setRunningTestId(null);
                  setRunningSuiteId(null);
                  showToast.info('已重置执行状态');
                  console.log('✅ 手动重置了测试执行状态');
                }
              }}
              className="inline-flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              title="如果测试已完成但loading状态未消失，请点击此按钮重置"
            >
              <AlertTriangle className="h-5 w-5 mr-2" />
              重置状态
            </motion.button>
          )}
          
          {/* 🔥 新增: AI批量更新按钮 */}
          {activeTab === 'cases' && aiFeatureAvailable && !checkingFeature && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/ai-bulk-update')}
              className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              title="使用AI批量更新测试用例"
            >
              <Bot className="h-5 w-5 mr-2" />
              AI批量更新
            </motion.button>
          )}
          
          {/* 🔥 新增: 手动刷新按钮 */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              console.log(`🔄 手动刷新${activeTab === 'cases' ? '测试用例' : '测试套件'}`);
              if (activeTab === 'cases') {
                loadTestCases();
                showToast.info('正在刷新测试用例数据...');
              } else {
                loadTestSuites();
                showToast.info('正在刷新测试套件数据...');
              }
            }}
            className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            title={`手动刷新${activeTab === 'cases' ? '测试用例' : '测试套件'}数据`}
          >
            <Clock className="h-5 w-5 mr-2" />
            刷新
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (activeTab === 'cases') {
                navigate('/test-cases/new');
              } else {
                setShowCreateModal(true);
              }
            }}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5 mr-2" />
            {activeTab === 'cases' ? '创建测试用例' : '创建测试套件'}
          </motion.button>
        </div>
      </div>

      {/* 🔥 新增：Tab切换 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => {
              if (showCreateModal) {
                showToast.warning('请先关闭当前表单再切换');
                return;
              }
              setActiveTab('cases');
            }}
            className={clsx(
              'flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'cases'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <FileText className="h-5 w-5 mr-2" />
            测试用例
            <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
              {testCases.length}
            </span>
          </button>
          <button
            onClick={() => {
              if (showCreateModal) {
                showToast.warning('请先关闭当前表单再切换');
                return;
              }
              setActiveTab('suites');
            }}
            className={clsx(
              'flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'suites'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <Package className="h-5 w-5 mr-2" />
            测试套件
            <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
              {testSuites.length}
            </span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-600" />
            <input
              type="text"
              placeholder={activeTab === 'cases' ? '搜索测试用例...' : '搜索测试套件...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Tag Filter */}
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={(activeTab === 'cases' ? allTags : allSuiteTags).length === 0}
          >
            <option value="">所有标签</option>
            {(activeTab === 'cases' ? allTags : allSuiteTags).map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">所有优先级</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>

          {/* System Filter */}
          <select
            value={selectedSystem}
            onChange={(e) => setSelectedSystem(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">所有系统</option>
            {systemOptions.map(sys => (
              <option key={sys.id} value={sys.name}>{sys.name}</option>
            ))}
          </select>

          {/* 🔥 新增：搜索和重置按钮 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSearch}
              className="flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              <Search className="h-4 w-4 mr-2" />
              搜索
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              重置
            </button>
          </div>
        </div>

        {/* 🔥 新增：统计信息行 */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            {activeTab === 'cases' && pagination.total > 0 && (
              `显示第 ${Math.min((pagination.page - 1) * pagination.pageSize + 1, pagination.total)} 到 ${Math.min(pagination.page * pagination.pageSize, pagination.total)} 条，共 ${pagination.total} 条用例`
            )}
            {activeTab === 'suites' && (
              `显示 ${filteredTestSuites.length} / ${testSuites.length} 个套件`
            )}
          </div>
          <div className="text-sm text-gray-700">
            {(searchTerm || selectedTag || selectedPriority || selectedSystem) && (
              `已应用 ${[searchTerm, selectedTag, selectedPriority, selectedSystem].filter(Boolean).length} 个筛选条件`
            )}
          </div>
        </div>
      </div>

      {/* 🔥 Tab内容区域 */}
      {activeTab === 'cases' ? (
        <>
          {/* Empty State - Test Cases */}
          {testCases.length === 0 && !testCasesLoading && (
            <div className="text-center py-16">
              <div className="mx-auto w-32 h-32 mb-6 rounded-full bg-gray-100 flex items-center justify-center">
                <FileText className="h-16 w-16 text-gray-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">暂无测试用例</h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                您还没有创建任何测试用例。点击下方按钮创建您的第一个自动化测试用例，开始您的测试之旅。
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/test-cases/new')}
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus className="h-5 w-5 mr-2" />
                创建第一个测试用例
              </motion.button>
              
              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mb-3 mx-auto">
                    <Code className="h-5 w-5 text-blue-600" />
                  </div>
                  <h4 className="font-medium text-gray-900 mb-1">简单易用</h4>
                  <p className="text-sm text-gray-600">直观的界面，无需编程知识即可创建测试用例</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mb-3 mx-auto">
                    <Play className="h-5 w-5 text-green-600" />
                  </div>
                  <h4 className="font-medium text-gray-900 mb-1">自动执行</h4>
                  <p className="text-sm text-gray-600">基于 Playwright 的自动化测试引擎</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mb-3 mx-auto">
                    <CheckCircle className="h-5 w-5 text-purple-600" />
                  </div>
                  <h4 className="font-medium text-gray-900 mb-1">实时反馈</h4>
                  <p className="text-sm text-gray-600">测试结果实时更新，快速定位问题</p>
                </div>
              </div>
            </div>
          )}

          {/* Loading */}
          {testCasesLoading && (
            <div className="text-center py-16">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-gray-600">加载中...</p>
            </div>
          )}

          {/* Test Cases Table */}
          {!testCasesLoading && testCases.length > 0 && (
            <TestCaseTable
              testCases={testCases}
              onRunTest={handleRunTest}
              onEditTestCase={handleEditTestCase}
              onDeleteTestCase={handleDeleteTestCase}
              runningTestId={runningTestId}
              loading={loading}
              pagination={pagination}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </>
      ) : (
        <>
          {/* 测试套件列表 */}
          {activeTab === 'suites' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold">测试套件列表</h2>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-2 bg-blue-600 text-white rounded-md flex items-center gap-2 hover:bg-blue-700"
                    onClick={() => { setShowCreateModal(true); setEditingTestSuite(null); }}
                  >
                    <Plus size={16} />
                    <span>创建套件</span>
                  </button>
                  <button
                    className="px-3 py-2 bg-gray-200 text-gray-800 rounded-md flex items-center gap-2 hover:bg-gray-300"
                    onClick={loadTestSuites}
                  >
                    <Clock size={16} />
                    <span>刷新列表</span>
                  </button>
                </div>
              </div>
              {/* Empty State - Test Suites */}
              {testSuites.length === 0 && !loading && (
                <div className="text-center py-16">
                  <div className="mx-auto w-32 h-32 mb-6 rounded-full bg-gray-100 flex items-center justify-center">
                    <Package className="h-16 w-16 text-gray-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">暂无测试套件</h3>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    您还没有创建任何测试套件。测试套件可以帮您批量管理和执行相关的测试用例。
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    创建第一个测试套件
                  </motion.button>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="text-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
                  <p className="text-gray-600">加载中...</p>
                </div>
              )}

              {/* Test Suites Grid */}
              {!loading && filteredTestSuites.length > 0 && (
                <div className="grid gap-6">
                  <AnimatePresence>
                    {filteredTestSuites.map((testSuite, index) => (
                      <motion.div
                        key={testSuite.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 mb-2">{testSuite.name}</h3>
                            <p className="text-sm text-gray-600 mb-3">{testSuite.description || '暂无描述'}</p>
                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                              <span className="flex items-center">
                                <FileText className="h-4 w-4 mr-1" />
                                {testSuite.testCaseIds.length} 个测试用例
                              </span>
                              <span className="flex items-center">
                                <User className="h-4 w-4 mr-1" />
                                {testSuite.owner || '未知作者'}
                              </span>
                              <span className="flex items-center">
                                <Clock className="h-4 w-4 mr-1" />
                                {new Date(testSuite.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleRunTestSuite(testSuite)}
                              disabled={runningSuiteId === testSuite.id}
                              className={clsx(
                                "p-1 transition-colors",
                                runningSuiteId === testSuite.id 
                                  ? "text-blue-600 cursor-not-allowed" 
                                  : "text-gray-600 hover:text-blue-600"
                              )}
                              title={runningSuiteId === testSuite.id ? "执行中..." : "运行套件"}
                            >
                              {runningSuiteId === testSuite.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleEditTestSuite(testSuite)}
                              className="p-1 text-gray-600 hover:text-green-600 transition-colors"
                              title="编辑测试套件"
                            >
                              <Edit3 className="h-4 w-4" />
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleDeleteTestSuite(testSuite)}
                              className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                              title="删除测试套件"
                            >
                              <Trash2 className="h-4 w-4" />
                            </motion.button>
                          </div>
                        </div>

                        {/* Tags */}
                        {testSuite.tags && testSuite.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-4">
                            {testSuite.tags.map((tag, tagIndex) => (
                              <span
                                key={tagIndex}
                                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800"
                              >
                                <Tag className="h-3 w-3 mr-1" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Status and Priority */}
                        <div className="flex items-center justify-between">
                          <span className={clsx(
                            'inline-flex px-2 py-1 rounded-full text-xs font-medium',
                            getPriorityColor(testSuite.priority)
                          )}>
                            优先级: {testSuite.priority === 'high' ? '高' : testSuite.priority === 'medium' ? '中' : '低'}
                          </span>
                          <span className={clsx(
                            'inline-flex px-2 py-1 rounded-full text-xs font-medium',
                            getStatusColor(testSuite.status)
                          )}>
                            {testSuite.status === 'active' ? '活跃' : testSuite.status === 'draft' ? '草稿' : '禁用'}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}
        </>
      )}



      {/* Create/Edit Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={handleCloseModal}
        title={activeTab === 'cases'
          ? (editingTestCase ? '编辑测试用例' : '创建新测试用例')
          : (editingTestSuite ? '编辑测试套件' : '创建新测试套件')
        }
        closeOnClickOutside={false}
        size="wide"
        contentPadding="md"
        footer={
          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={handleCloseModal}
              disabled={loading}
            >
              取消
            </Button>
            {activeTab === 'cases' && !editingTestCase && (
              <Button
                variant="outline"
                onClick={() => handleCreateTestCase(true)}
                disabled={loading || !formData.name.trim() || !formData.steps.trim()}
              >
                保存并继续
              </Button>
            )}
            {activeTab === 'suites' && !editingTestSuite && (
              <Button
                variant="outline"
                onClick={() => handleCreateTestSuite(true)}
                disabled={loading || !suiteFormData.name.trim() || suiteFormData.testCases.length === 0}
              >
                保存并继续
              </Button>
            )}
            <Button
              onClick={activeTab === 'cases' ? handleCreateTestCase : handleCreateTestSuite}
              disabled={loading || (activeTab === 'cases' 
                ? (!formData.name.trim() || !formData.steps.trim())
                : (!suiteFormData.name.trim() || suiteFormData.testCases.length === 0)
              )}
              isLoading={loading}
            >
              {activeTab === 'cases' 
                ? (editingTestCase ? '更新用例' : '创建用例')
                : (editingTestSuite ? '更新套件' : '创建套件')
              }
            </Button>
          </div>
        }
      >
        {activeTab === 'cases' ? (
          // 🔥 测试用例表单
          <div className={clsx("grid gap-4", !stepsExpanded && "xl:grid-cols-3")}>
            {/* 左侧主区：名称 + 步骤 + 断言 */}
            <div className="space-y-3 xl:col-span-2">
              <div>
                <label htmlFor="caseName" className="block text-sm font-medium text-gray-700 mb-2">
                  用例名称 *
                </label>
                <input
                  id="caseName"
                  ref={nameInputRef}
                  type="text"
                  value={formData.name}
                  onChange={(e) => { setFormData(prev => ({ ...prev, name: e.target.value })); setFormDirty(true); }}
                  onBlur={() => setNameTouched(true)}
                  aria-invalid={nameTouched && !formData.name.trim() ? 'true' : 'false'}
                  aria-describedby="caseName-error"
                  className={clsx(
                    "w-full px-3 py-2 border rounded-lg focus:ring-2",
                    nameTouched && !formData.name.trim()
                      ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                      : "border-gray-300 focus:ring-blue-500 focus:border-transparent"
                  )}
                  placeholder="输入测试用例名称"
                />
                {nameTouched && !formData.name.trim() && (
                  <p id="caseName-error" className="mt-1 text-sm text-red-600 font-medium">请输入测试用例名称</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="caseSteps" className="block text-sm font-medium text-gray-700">
                    测试步骤 *
                  </label>
                  <div className="flex items-center gap-2 relative">
                    {/* 🔥 新增：切换编辑器模式按钮 */}
                    <button
                      type="button"
                      onClick={handleToggleEditorMode}
                      className="inline-flex items-center text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                      title={stepsEditorMode === 'table' ? '切换为文本模式' : '切换为表格模式'}
                    >
                      {stepsEditorMode === 'table' ? (
                        <>
                          <AlignLeft className="h-3.5 w-3.5 mr-1" />
                          文本
                        </>
                      ) : (
                        <>
                          <Table className="h-3.5 w-3.5 mr-1" />
                          表格
                        </>
                      )}
                    </button>

                    {/* 仅在文本模式显示这些按钮 */}
                    {stepsEditorMode === 'text' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const n = normalizeSteps(formData.steps);
                            setFormData(prev => ({ ...prev, steps: n }));
                            setFormDirty(true);
                            showToast.info('已格式化步骤');
                          }}
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                          title='将"1、xxx 2、xxx ..."自动拆分为多行'
                        >
                          格式化步骤
                        </button>
                        <button
                          type="button"
                          onClick={() => setStepsSoftWrap(v => !v)}
                          aria-pressed={stepsSoftWrap}
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                          title={stepsSoftWrap ? '软换行：开（Alt+W）' : '软换行：关（Alt+W）'}
                        >
                          {stepsSoftWrap ? '软换行：开' : '软换行：关'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStepsExpanded(v => {
                              const next = !v;
                              if (!v) {
                                setTimeout(() => {
                                  try {
                                    stepsTextareaRef.current?.focus();
                                    stepsTextareaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                                  } catch {}
                                }, 0);
                              }
                              return next;
                            });
                          }}
                          aria-pressed={stepsExpanded}
                          aria-controls="caseSteps"
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                          title={stepsExpanded ? '收起编辑区域（Alt+E）' : '展开为更大编辑区域（Alt+E）'}
                        >
                          {stepsExpanded ? '收起编辑' : '展开编辑'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setStepsHelpOpen(v => !v)}
                          aria-expanded={stepsHelpOpen}
                          className="inline-flex items-center text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                          title="查看步骤输入帮助与快捷键"
                        >
                          <HelpCircle className="h-3.5 w-3.5 mr-1" />
                          帮助
                        </button>
                        {stepsHelpOpen && (
                          <div className="absolute right-0 top-8 z-20 w-72 rounded-lg border border-gray-200 bg-white shadow-lg p-3 text-xs leading-5">
                            <div className="font-medium text-gray-900 mb-1">步骤输入帮助</div>
                            <ul className="list-disc pl-5 text-gray-700 space-y-1">
                              <li>支持编号：1. / 1、 / 1)</li>
                              <li>粘贴自动分行，建议每步一句</li>
                              <li>快捷键：Alt+E 展开/收起，Alt+W 软换行，Ctrl/Cmd+Enter 提交</li>
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* 🔥 条件渲染：表格模式或文本模式 */}
                {stepsEditorMode === 'table' ? (
                  <>
                    <StepTableEditor
                      steps={stepsData}
                      onChange={handleStepsDataChange}
                    />
                    {stepsTouched && stepsData.length === 0 && (
                      <p className="mt-1 text-sm text-red-600 font-medium">请添加至少一个测试步骤</p>
                    )}
                  </>
                ) : (
                  <>
                    <textarea
                      id="caseSteps"
                      ref={stepsTextareaRef}
                      rows={12}
                      value={formData.steps}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, steps: e.target.value }));
                        setFormDirty(true);
                      }}
                      onBlur={() => setStepsTouched(true)}
                      onPaste={handleStepsPaste}
                      wrap={stepsSoftWrap ? "soft" : "off"}
                      aria-invalid={stepsTouched && !formData.steps.trim() ? 'true' : 'false'}
                      aria-describedby="caseSteps-error"
                      className={clsx(
                        "w-full px-3 py-2 font-mono border rounded-lg focus:ring-2 leading-6 resize-y",
                        (stepsTouched && !formData.steps.trim())
                          ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                          : "border-gray-300 focus:ring-blue-500 focus:border-transparent",
                        "min-h-[32vh] sm:min-h-[38vh] md:min-h-[42vh] xl:min-h-[44vh]",
                        !stepsSoftWrap && "overflow-x-auto",
                        stepsExpanded && "h-[68vh]"
                      )}
                      placeholder="例如：&#10;1、打开登录页面&#10;2、输入用户名和密码&#10;3、点击登录按钮&#10;4、验证页面跳转"
                    />
                    {stepsTouched && !formData.steps.trim() && (
                      <p id="caseSteps-error" className="mt-1 text-sm text-red-600 font-medium">请输入测试步骤</p>
                    )}
                    <div className="mt-1 flex justify-between text-sm text-gray-700">
                      <span>行数: {formData.steps ? formData.steps.split(/\r\n|\n/).length : 0} · 支持数字编号粘贴自动拆分</span>
                      <span>字符: {formData.steps.length}</span>
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  断言预期
                </label>
                <textarea
                  value={formData.assertions}
                  onChange={(e) => setFormData(prev => ({ ...prev, assertions: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none h-32 overflow-y-auto"
                  placeholder="例如：&#10;• 页面成功跳转到首页&#10;• 显示用户昵称&#10;• 退出按钮可见"
                />
                <div className="mt-1 flex justify-between text-sm text-gray-700">
                  <span>行数: {formData.assertions ? formData.assertions.split(/\r\n|\n/).length : 0}</span>
                  <span>字符: {formData.assertions.length}</span>
                </div>
              </div>
            </div>

            {/* 右侧辅区：系统/模块/优先级/状态/标签 */}
            <div className={clsx("space-y-3 xl:col-span-1", stepsExpanded && "hidden")}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  系统
                </label>
                <select
                  value={formData.system}
                  onChange={(e) => setFormData(prev => ({ ...prev, system: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">请选择系统</option>
                  {systemOptions.map((sys) => (
                    <option key={sys.id} value={sys.name}>{sys.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  模块
                </label>
                <input
                  type="text"
                  list="moduleOptions"
                  value={formData.module}
                  onChange={(e) => setFormData(prev => ({ ...prev, module: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="如：商品管理"
                />
                <datalist id="moduleOptions">
                  {moduleOptions.map((opt) => (
                    <option key={opt as string} value={opt as string}></option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  优先级
                </label>
                <select 
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as 'high' | 'medium' | 'low' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  状态
                </label>
                <select 
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as 'active' | 'draft' | 'disabled' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="draft">草稿</option>
                  <option value="active">活跃</option>
                  <option value="disabled">禁用</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  标签
                </label>
                <TagInput
                  value={formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : []}
                  onChange={(tags) => { setFormData(prev => ({ ...prev, tags: tags.join(', ') })); setFormDirty(true); }}
                  placeholder="输入后按 Enter 或逗号添加标签"
                />
              </div>
            </div>
          </div>
        ) : (
          // 🔥 测试套件表单
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                套件名称 *
              </label>
              <input
                ref={suiteNameInputRef}
                type="text"
                value={suiteFormData.name}
                onChange={(e) => { setSuiteFormData(prev => ({ ...prev, name: e.target.value })); setSuiteFormDirty(true); }}
                onBlur={() => setSuiteNameTouched(true)}
                aria-invalid={suiteNameTouched && !suiteFormData.name.trim() ? 'true' : 'false'}
                aria-describedby="suiteName-error"
                className={clsx(
                  "w-full px-3 py-2 border rounded-lg focus:ring-2",
                  suiteNameTouched && !suiteFormData.name.trim()
                    ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300 focus:ring-blue-500 focus:border-transparent"
                )}
                placeholder="输入测试套件名称"
              />
              {suiteNameTouched && !suiteFormData.name.trim() && (
                <p id="suiteName-error" className="mt-1 text-sm text-red-600 font-medium">请输入测试套件名称</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                套件描述
              </label>
              <textarea
                rows={4}
                value={suiteFormData.description}
                onChange={(e) => setSuiteFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                placeholder="描述这个测试套件的用途和覆盖范围"
              />
              <div className="mt-1 flex justify-between text-sm text-gray-700">
                <span>行数: {suiteFormData.description ? suiteFormData.description.split(/\r\n|\n/).length : 0}</span>
                <span>字符: {suiteFormData.description.length}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                选择测试用例 *
              </label>
              <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-600" />
                  <input
                    type="text"
                    value={suiteCaseSearch}
                    onChange={(e) => setSuiteCaseSearch(e.target.value)}
                    placeholder="搜索用例名称..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <span className="text-sm text-gray-700 whitespace-nowrap">
                  匹配 {testCases.filter(tc => tc.name.toLowerCase().includes(suiteCaseSearch.toLowerCase())).length} 条
                </span>
                <button
                  type="button"
                  className="px-3 py-2 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                  onClick={() => {
                    const visibleIds = testCases
                      .filter(tc => tc.name.toLowerCase().includes(suiteCaseSearch.toLowerCase()))
                      .map(tc => tc.id);
                    setSuiteFormData(prev => ({
                      ...prev,
                      testCases: Array.from(new Set([...(prev.testCases || []), ...visibleIds]))
                    }));
                    setSuiteFormDirty(true);
                  }}
                >
                  全选可见
                </button>
                <button
                  type="button"
                  className="px-3 py-2 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                  onClick={() => {
                    const visibleIds = testCases
                      .filter(tc => tc.name.toLowerCase().includes(suiteCaseSearch.toLowerCase()))
                      .map(tc => tc.id);
                    setSuiteFormData(prev => ({
                      ...prev,
                      testCases: (prev.testCases || []).filter(id => !visibleIds.includes(id))
                    }));
                    setSuiteFormDirty(true);
                  }}
                >
                  全不选可见
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto border border-gray-300 rounded-lg p-3 space-y-2">
                {testCases.length === 0 ? (
                  <p className="text-gray-500 text-sm">暂无可用的测试用例，请先创建测试用例</p>
                  ) : (
                    testCases
                      .filter(tc => tc.name.toLowerCase().includes(suiteCaseSearch.toLowerCase()))
                      .sort((a, b) => (Number(suiteFormData.testCases.includes(b.id)) - Number(suiteFormData.testCases.includes(a.id))) || a.name.localeCompare(b.name))
                      .map((testCase) => (
                    <label key={testCase.id} className={clsx("flex items-center space-x-2 cursor-pointer rounded px-2 py-1", suiteFormData.testCases.includes(testCase.id) && "bg-blue-50 ring-1 ring-blue-200")}>
                      <input
                        type="checkbox"
                        checked={suiteFormData.testCases.includes(testCase.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSuiteFormData(prev => ({
                              ...prev,
                              testCases: [...prev.testCases, testCase.id]
                            }));
                          } else {
                            setSuiteFormData(prev => ({
                              ...prev,
                              testCases: prev.testCases.filter(id => id !== testCase.id)
                            }));
                          }
                          setSuiteFormDirty(true);
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{testCase.name}</span>
                      <span className={clsx(
                        'text-xs px-2 py-0.5 rounded-full',
                        getPriorityColor(testCase.priority)
                      )}>
                        {testCase.priority === 'high' ? '高' : testCase.priority === 'medium' ? '中' : '低'}
                      </span>
                    </label>
                  ))
                )}
              </div>
              {suiteFormData.testCases.length > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  已选择 {suiteFormData.testCases.length} 个测试用例
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  优先级
                </label>
                <select 
                  value={suiteFormData.priority}
                  onChange={(e) => setSuiteFormData(prev => ({ ...prev, priority: e.target.value as 'high' | 'medium' | 'low' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  状态
                </label>
                <select 
                  value={suiteFormData.status}
                  onChange={(e) => setSuiteFormData(prev => ({ ...prev, status: e.target.value as 'active' | 'draft' | 'disabled' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="draft">草稿</option>
                  <option value="active">活跃</option>
                  <option value="disabled">禁用</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                标签
              </label>
              <TagInput
                value={suiteFormData.tags ? suiteFormData.tags.split(',').map(t => t.trim()).filter(Boolean) : []}
                onChange={(tags) => { setSuiteFormData(prev => ({ ...prev, tags: tags.join(', ') })); setSuiteFormDirty(true); }}
                placeholder="输入后按 Enter 或逗号添加标签"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal && (deletingTestCase !== null || deletingTestSuite !== null)}
        onClose={() => {
          setShowDeleteModal(false);
          setDeletingTestCase(null);
          setDeletingTestSuite(null);
        }}
        title="确认删除"
        description={
          <div className="space-y-2">
            <p>
              您确定要删除{deletingTestCase ? '测试用例' : '测试套件'} "
              <span className="font-medium">
                {deletingTestCase ? deletingTestCase?.name : deletingTestSuite?.name}
              </span>" 吗？
              此操作无法撤销。
            </p>
            {deletingTestSuite && (
              <p className="text-sm text-amber-600">
                注意：删除套件不会删除其中的测试用例，但会移除套件与用例的关联。
              </p>
            )}
          </div>
        }
        onConfirm={deletingTestCase ? confirmDelete : confirmDeleteSuite}
        confirmText="确认删除"
        cancelText="取消"
        variant="destructive"
        isLoading={loading}
        size="sm"
      />

      {/* 未保存更改拦截确认 */}
      <ConfirmModal
        isOpen={showUnsavedConfirm}
        onClose={() => setShowUnsavedConfirm(false)}
        title="确认关闭"
        description="有未保存的更改，确认关闭吗？"
        onConfirm={() => {
          if (activeTab === 'cases') {
            resetForm();
            setFormDirty(false);
          } else {
            resetSuiteForm();
            setSuiteFormDirty(false);
          }
          setShowUnsavedConfirm(false);
        }}
        confirmText="确认关闭"
        cancelText="继续编辑"
        size="sm"
      />

    </div>
  );
}

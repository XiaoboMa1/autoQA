import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Bot,
  Edit3,
  Trash2,
  Clock,
  User,
  Filter,
  X,
  List as ListIcon,
  Target
} from 'lucide-react';
import { clsx } from 'clsx';
import { functionalTestCaseService } from '../services/functionalTestCaseService';
import * as systemService from '../services/systemService';
import type { SystemOption } from '../types/test';
import { showToast } from '../utils/toast';
import { useAuth } from '../contexts/AuthContext';
import { TestCaseDetailModal } from '../components/ai-generator/TestCaseDetailModal';

/**
 * 功能测试用例列表页面
 */
export function FunctionalTestCases() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [testCases, setTestCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0
  });
  const [filters, setFilters] = useState({
    search: '',
    system: '',
    module: '',
    source: '',
    priority: '',
    status: '',
    tag: '',
    sectionName: '',
    createdBy: '',
    startDate: '',
    endDate: '',
    riskLevel: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  // 🔥 新增：系统字典列表
  const [systemOptions, setSystemOptions] = useState<SystemOption[]>([]);

  // 复选框状态
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // 详情弹窗状态
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [currentDetailCase, setCurrentDetailCase] = useState<any>(null);

  // 加载数据（使用平铺列表API）
  const loadData = async () => {
    setLoading(true);
    try {
      const result = await functionalTestCaseService.getFlatList({
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...filters
      });

      setTestCases(result.data || []);
      setPagination(prev => ({
        ...prev,
        total: result.pagination?.total || 0,
        totalPages: result.pagination?.totalPages || 0
      }));
    } catch (error: any) {
      showToast.error('加载失败：' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 新增：加载系统字典列表
  useEffect(() => {
    const loadSystems = async () => {
      try {
        const systems = await systemService.getActiveSystems();
        setSystemOptions(systems);
      } catch (error) {
        console.error('加载系统列表失败:', error);
      }
    };
    loadSystems();
  }, []);

  useEffect(() => {
    loadData();
  }, [pagination.page, pagination.pageSize, filters]);

  // 复选框处理函数
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedRows(new Set());
      setSelectAll(false);
    } else {
      const allIds = new Set(testCases.map(row => row.test_point_id));
      setSelectedRows(allIds);
      setSelectAll(true);
    }
  };

  const handleSelectRow = (testPointId: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(testPointId)) {
      newSelected.delete(testPointId);
    } else {
      newSelected.add(testPointId);
    }
    setSelectedRows(newSelected);
    setSelectAll(newSelected.size === testCases.length);
  };

  // 批量删除处理
  const handleBatchDelete = async () => {
    if (selectedRows.size === 0) {
      showToast.warning('请先选择要删除的测试点');
      return;
    }

    const confirmMessage = `确定要删除选中的 ${selectedRows.size} 个测试点吗？此操作不可恢复。`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const testPointIds = Array.from(selectedRows);
      await functionalTestCaseService.batchDelete(testPointIds);

      showToast.success(`已成功删除 ${testPointIds.length} 个测试点`);

      // 刷新数据
      await fetchTestCases();

      // 清空选择
      setSelectedRows(new Set());
      setSelectAll(false);
    } catch (error: any) {
      console.error('批量删除失败:', error);
      showToast.error(error.message || '批量删除失败');
    }
  };

  // 清空选择
  useEffect(() => {
    setSelectedRows(new Set());
    setSelectAll(false);
  }, [testCases]);

  // 查看详情
  const handleViewDetail = (testCase: any) => {
    setCurrentDetailCase(testCase);
    setDetailModalOpen(true);
  };

  // 保存详情修改
  const handleSaveDetail = async (updatedTestCase: any) => {
    try {
      await functionalTestCaseService.update(updatedTestCase.id, {
        name: updatedTestCase.name,
        description: updatedTestCase.description,
        testPoints: updatedTestCase.testPoints,
        system: updatedTestCase.system,
        module: updatedTestCase.module,
        priority: updatedTestCase.priority,
        tags: updatedTestCase.tags,
        sectionId: updatedTestCase.sectionId,
        sectionName: updatedTestCase.sectionName
      });
      showToast.success('测试用例已更新');
      setDetailModalOpen(false);
      loadData(); // 重新加载列表
    } catch (error: any) {
      showToast.error('保存失败：' + error.message);
    }
  };

  // 编辑用例
  const handleEdit = (id: number) => {
    const testCase = testCases.find(tc => tc.id === id);
    if (testCase) {
      handleViewDetail(testCase);
    }
  };

  // 删除用例
  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`确定要删除测试用例"${name}"吗？`)) {
      return;
    }

    try {
      await functionalTestCaseService.delete(id);
      showToast.success('删除成功');
      loadData();
    } catch (error: any) {
      showToast.error('删除失败：' + error.message);
    }
  };

  // 删除单个测试点
  const handleDeleteTestPoint = async (testPointId: number, testPointName: string) => {
    if (!window.confirm(`确定要删除测试点"${testPointName}"吗？此操作不可恢复。`)) {
      return;
    }

    try {
      await functionalTestCaseService.batchDelete([testPointId]);
      showToast.success('测试点已删除');
      loadData();
    } catch (error: any) {
      showToast.error('删除失败：' + error.message);
    }
  };

  // 格式化日期
  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PUBLISHED': return 'bg-green-100 text-green-800 border-green-200';
      case 'DRAFT': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'ARCHIVED': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // 状态文本
  const getStatusText = (status: string) => {
    switch (status) {
      case 'PUBLISHED': return '已发布';
      case 'DRAFT': return '草稿';
      case 'ARCHIVED': return '已归档';
      default: return status;
    }
  };

  // 优先级颜色
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // 优先级文本
  const getPriorityText = (priority: string) => {
    switch (priority) {
      case 'critical': return '紧急';
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': return '低';
      default: return priority;
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* 页面标题和操作按钮 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            功能测试用例
            {selectedRows.size > 0 && (
              <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-700
                             rounded-full text-sm font-medium">
                已选中 {selectedRows.size} 项
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-600 mt-1">管理和维护功能测试用例库</p>
        </div>
        <div className="flex gap-3">
          {selectedRows.size > 0 && (
            <button
              onClick={handleBatchDelete}
              className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg
                       hover:bg-red-700 transition-colors shadow-md hover:shadow-lg"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              批量删除 ({selectedRows.size})
            </button>
          )}
          <button
            onClick={() => navigate('/functional-test-cases/generator')}
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600
                     text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all
                     shadow-md hover:shadow-lg"
          >
            <Bot className="w-4 h-4 mr-2" />
            AI生成器
          </button>
          <button
            onClick={() => navigate('/functional-test-cases/create')}
            className="inline-flex items-center px-4 py-2 bg-white text-gray-700 rounded-lg
                     hover:bg-gray-50 transition-colors border border-gray-300"
          >
            <Plus className="w-4 h-4 mr-2" />
            手动创建
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="mb-4 bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-600" />
            <input
              type="text"
              placeholder="搜索用例名称或描述..."
              value={filters.search}
              onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && setPagination(prev => ({ ...prev, page: 1 }))}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2
                       focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              'inline-flex items-center px-4 py-2 rounded-lg transition-colors border',
              showFilters
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            )}
          >
            <Filter className="w-4 h-4 mr-2" />
            筛选
          </button>
          <button
            onClick={() => {
              setFilters({
                search: '', system: '', module: '', source: '', priority: '', status: '', tag: '',
                sectionName: '', createdBy: '', startDate: '', endDate: '', riskLevel: ''
              });
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            className="inline-flex items-center px-4 py-2 text-gray-600 hover:text-gray-900
                     border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <X className="w-4 h-4 mr-2" />
            重置
          </button>
        </div>

        {/* 展开的筛选项 */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 pt-3 border-t border-gray-200">
                {/* 第一行 */}
                <div className="grid grid-cols-5 gap-3">
                  <select
                    value={filters.system}
                    onChange={e => setFilters(prev => ({ ...prev, system: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">全部系统</option>
                    {systemOptions.map(sys => (
                      <option key={sys.id} value={sys.name}>{sys.name}</option>
                    ))}
                  </select>

                  <select
                    value={filters.module}
                    onChange={e => setFilters(prev => ({ ...prev, module: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">全部模块</option>
                  </select>

                  <input
                    type="text"
                    placeholder="页面名称..."
                    value={filters.sectionName}
                    onChange={e => setFilters(prev => ({ ...prev, sectionName: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                  />

                  <select
                    value={filters.priority}
                    onChange={e => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">全部优先级</option>
                    <option value="critical">紧急</option>
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>

                  <select
                    value={filters.status}
                    onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">全部状态</option>
                    <option value="PUBLISHED">已发布</option>
                    <option value="DRAFT">草稿</option>
                    <option value="ARCHIVED">已归档</option>
                  </select>
                </div>

                {/* 第二行 */}
                <div className="grid grid-cols-5 gap-3">
                  <select
                    value={filters.source}
                    onChange={e => setFilters(prev => ({ ...prev, source: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">全部来源</option>
                    <option value="AI_GENERATED">AI生成</option>
                    <option value="MANUAL">手动创建</option>
                  </select>

                  <select
                    value={filters.riskLevel}
                    onChange={e => setFilters(prev => ({ ...prev, riskLevel: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">全部风险等级</option>
                    <option value="high">高风险</option>
                    <option value="medium">中风险</option>
                    <option value="low">低风险</option>
                  </select>

                  <input
                    type="text"
                    placeholder="创建人..."
                    value={filters.createdBy}
                    onChange={e => setFilters(prev => ({ ...prev, createdBy: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                  />

                  <input
                    type="date"
                    placeholder="开始日期"
                    value={filters.startDate}
                    onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                  />

                  <input
                    type="date"
                    placeholder="结束日期"
                    value={filters.endDate}
                    onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* 第三行 - 标签 */}
                <div className="grid grid-cols-5 gap-3">
                  <input
                    type="text"
                    placeholder="标签筛选..."
                    value={filters.tag}
                    onChange={e => setFilters(prev => ({ ...prev, tag: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2
                             focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 数据表格 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-600 mt-2 text-base">加载中...</p>
          </div>
        ) : testCases.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-base">暂无测试用例数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    序号
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    测试目的
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    测试点名称
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    系统
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    模块
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    测试点序号
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider max-w-xs">
                    测试步骤
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider max-w-xs">
                    预期结果
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    风险级别
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    优先级
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    创建者
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    创建时间
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <AnimatePresence>
                  {testCases.map((row, idx) => {
                    // 判断是否是同一用例的第一行
                    const isFirstRow = idx === 0 || testCases[idx - 1].id !== row.id;

                    // 计算前端序号：从当前页的起始位置开始
                    const rowNumber = (pagination.page - 1) * pagination.pageSize + idx + 1;

                    return (
                      <motion.tr
                        key={`${row.id}-${row.test_point_index}-${idx}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={clsx(
                          'hover:bg-blue-50 transition-colors',
                          isFirstRow && idx !== 0 && 'border-t-2 border-gray-300'
                        )}
                      >
                        {/* 复选框 */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(row.test_point_id)}
                            onChange={() => handleSelectRow(row.test_point_id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>

                        {/* 前端序号 */}
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {rowNumber}
                        </td>

                        {/* 测试目的 */}
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                          <div className="line-clamp-2" title={row.test_purpose || '-'}>
                            {row.test_purpose || '-'}
                          </div>
                        </td>

                        {/* 测试点名称 */}
                        <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                          <div className="line-clamp-2 font-medium" title={row.test_point_name || '-'}>
                            {row.test_point_name || '-'}
                          </div>
                        </td>

                        {/* 系统 */}
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {row.system || '-'}
                        </td>

                        {/* 模块 */}
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {row.module || '-'}
                        </td>

                        {/* 测试点序号 */}
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                          {row.test_point_index > 0 && (
                            <span className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-700
                                           rounded-full text-xs font-medium">
                              {row.test_point_index}/{row.total_test_points}
                            </span>
                          )}
                        </td>

                        {/* 测试步骤 */}
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                          <div className="line-clamp-3 whitespace-pre-wrap" title={row.test_point_steps || '-'}>
                            {row.test_point_steps || '-'}
                          </div>
                        </td>

                        {/* 预期结果 */}
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                          <div className="line-clamp-3 whitespace-pre-wrap" title={row.test_point_expected_result || '-'}>
                            {row.test_point_expected_result || '-'}
                          </div>
                        </td>

                        {/* 风险级别 */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.test_point_risk_level && (
                            <span className={clsx(
                              'inline-flex px-2 py-1 text-xs font-medium rounded-md border',
                              row.test_point_risk_level === 'high' && 'bg-red-100 text-red-800 border-red-200',
                              row.test_point_risk_level === 'medium' && 'bg-orange-100 text-orange-800 border-orange-200',
                              row.test_point_risk_level === 'low' && 'bg-green-100 text-green-800 border-green-200'
                            )}>
                              {row.test_point_risk_level === 'high' ? '高' :
                               row.test_point_risk_level === 'medium' ? '中' : '低'}
                            </span>
                          )}
                        </td>

                        {/* 优先级 */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={clsx(
                            'inline-flex px-2 py-1 text-xs font-medium rounded-md border',
                            getPriorityColor(row.priority)
                          )}>
                            {getPriorityText(row.priority)}
                          </span>
                        </td>

                        {/* 创建者 */}
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center">
                            <User className="h-4 w-4 mr-1 text-gray-600" />
                            {row.users?.username || '-'}
                          </div>
                        </td>

                        {/* 创建时间 */}
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-1 text-gray-600" />
                            {formatDate(row.created_at)}
                          </div>
                        </td>

                        {/* 操作 */}
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => navigate(`/functional-test-cases/test-points/${row.test_point_id}/edit`)}
                              className="text-blue-600 hover:text-blue-900"
                              title="编辑测试点"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTestPoint(row.test_point_id, row.test_point_name)}
                              className="text-red-600 hover:text-red-900"
                              title="删除此测试点"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 分页器 */}
      {testCases.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            共 <span className="font-medium">{pagination.total}</span> 条记录，
            第 <span className="font-medium">{pagination.page}</span> / {pagination.totalPages} 页
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
              disabled={pagination.page === 1}
              className={clsx(
                'px-3 py-2 rounded-lg border transition-colors',
                pagination.page === 1
                  ? 'border-gray-200 text-gray-600 cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              )}
            >
              首页
            </button>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
              disabled={pagination.page === 1}
              className={clsx(
                'px-3 py-2 rounded-lg border transition-colors',
                pagination.page === 1
                  ? 'border-gray-200 text-gray-600 cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              )}
            >
              上一页
            </button>
            <span className="px-4 py-2 text-sm text-gray-700">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
              disabled={pagination.page >= pagination.totalPages}
              className={clsx(
                'px-3 py-2 rounded-lg border transition-colors',
                pagination.page >= pagination.totalPages
                  ? 'border-gray-200 text-gray-600 cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              )}
            >
              下一页
            </button>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.totalPages }))}
              disabled={pagination.page >= pagination.totalPages}
              className={clsx(
                'px-3 py-2 rounded-lg border transition-colors',
                pagination.page >= pagination.totalPages
                  ? 'border-gray-200 text-gray-600 cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              )}
            >
              末页
            </button>
            <select
              value={pagination.pageSize}
              onChange={e => setPagination(prev => ({ ...prev, pageSize: Number(e.target.value), page: 1 }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={10}>10条/页</option>
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
              <option value={100}>100条/页</option>
            </select>
          </div>
        </div>
      )}

      {/* 测试用例详情弹窗 */}
      <TestCaseDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        testCase={currentDetailCase}
        onSave={handleSaveDetail}
      />
    </div>
  );
}

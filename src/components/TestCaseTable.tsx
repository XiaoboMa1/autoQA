import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Edit3,
  Trash2,
  Tag,
  Clock,
  User,
  ChevronDown,
  ChevronRight,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronsLeft,
  ChevronRight as ChevronRightIcon,
  ChevronsRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { TestCase } from '../types/test';

interface TestCaseTableProps {
  testCases: TestCase[];
  onRunTest: (testCase: TestCase) => void;
  onEditTestCase: (testCase: TestCase) => void;
  onDeleteTestCase: (testCase: TestCase) => void;
  runningTestId: number | null;
  loading?: boolean;
  // 分页相关props
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

type SortField = 'name' | 'priority' | 'status' | 'created' | 'lastRun' | 'success_rate';
type SortDirection = 'asc' | 'desc';

export function TestCaseTable({
  testCases,
  onRunTest,
  onEditTestCase,
  onDeleteTestCase,
  runningTestId,
  loading = false,
  pagination,
  onPageChange,
  onPageSizeChange
}: TestCaseTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [sortField, setSortField] = useState<SortField>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const getPriorityColor = (priority: string | undefined) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string | undefined) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'draft': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'disabled': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityText = (priority: string | undefined) => {
    switch (priority) {
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': return '低';
      default: return '中';
    }
  };

  const getStatusText = (status: string | undefined) => {
    switch (status) {
      case 'active': return '活跃';
      case 'draft': return '草稿';
      case 'disabled': return '禁用';
      default: return '草稿';
    }
  };

  const formatDateTime = (dateTime: string | undefined) => {
    if (!dateTime) return '-';
    try {
      const date = new Date(dateTime);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateTime;
    }
  };

  const toggleRowExpansion = (testCaseId: number) => {
    setExpandedRows(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(testCaseId)) {
        newExpanded.delete(testCaseId);
      } else {
        newExpanded.add(testCaseId);
      }
      return newExpanded;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedTestCases = [...testCases].sort((a, b) => {
    let aValue: any = a[sortField];
    let bValue: any = b[sortField];

    // Handle undefined values
    if (aValue === undefined) aValue = '';
    if (bValue === undefined) bValue = '';

    // Special handling for different field types
    if (sortField === 'success_rate') {
      aValue = aValue || 0;
      bValue = bValue || 0;
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }

    if (sortField === 'priority') {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      aValue = priorityOrder[aValue as keyof typeof priorityOrder] || 2;
      bValue = priorityOrder[bValue as keyof typeof priorityOrder] || 2;
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }

    // Special handling for date fields
    if (sortField === 'created' || sortField === 'lastRun') {
      const aDate = aValue ? new Date(aValue).getTime() : 0;
      const bDate = bValue ? new Date(bValue).getTime() : 0;
      return sortDirection === 'asc' ? aDate - bDate : bDate - aDate;
    }

    // String comparison for other fields
    const comparison = String(aValue).localeCompare(String(bValue));
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 text-gray-600" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="h-4 w-4 text-blue-600" />
      : <ArrowDown className="h-4 w-4 text-blue-600" />;
  };

  if (testCases.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">暂无测试用例数据</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-12 px-4 py-3"></th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center space-x-2">
                  <span>用例名称</span>
                  <SortIcon field="name" />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                系统/模块
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('priority')}
              >
                <div className="flex items-center space-x-2">
                  <span>优先级</span>
                  <SortIcon field="priority" />
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center space-x-2">
                  <span>状态</span>
                  <SortIcon field="status" />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                标签
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('success_rate')}
              >
                <div className="flex items-center space-x-2">
                  <span>成功率</span>
                  <SortIcon field="success_rate" />
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('created')}
              >
                <div className="flex items-center space-x-2">
                  <span>创建时间</span>
                  <SortIcon field="created" />
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('lastRun')}
              >
                <div className="flex items-center space-x-2">
                  <span>最后运行</span>
                  <SortIcon field="lastRun" />
                </div>
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <AnimatePresence>
              {sortedTestCases.map((testCase, index) => (
                <React.Fragment key={testCase.id}>
                {/* Main Row */}
                <motion.tr
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className={clsx(
                    "hover:bg-gray-50 transition-colors",
                    expandedRows.has(testCase.id) && "bg-blue-25"
                  )}
                >
                  {/* Expand Toggle */}
                  <td className="px-4 py-4">
                    <button
                      onClick={() => toggleRowExpansion(testCase.id)}
                      className="text-gray-600 hover:text-gray-600 transition-colors"
                      title={expandedRows.has(testCase.id) ? "收起详情" : "展开详情"}
                    >
                      {expandedRows.has(testCase.id)
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />
                      }
                    </button>
                  </td>

                  {/* Test Case Name */}
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 max-w-xs truncate" title={testCase.name}>
                      {testCase.name}
                    </div>
                    {testCase.author && (
                      <div className="flex items-center text-sm text-gray-700 mt-1">
                        <User className="h-3 w-3 mr-1" />
                        {testCase.author}
                      </div>
                    )}
                  </td>

                  {/* System/Module */}
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {testCase.system && (
                        <div className="font-medium">{testCase.system}</div>
                      )}
                      {testCase.module && (
                        <div className="text-gray-500 text-xs">{testCase.module}</div>
                      )}
                      {!testCase.system && !testCase.module && (
                        <span className="text-gray-600 text-sm">-</span>
                      )}
                    </div>
                  </td>

                  {/* Priority */}
                  <td className="px-6 py-4">
                    <span className={clsx(
                      'inline-flex px-2 py-1 rounded-full text-xs font-medium border',
                      getPriorityColor(testCase.priority)
                    )}>
                      {getPriorityText(testCase.priority)}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    <span className={clsx(
                      'inline-flex px-2 py-1 rounded-full text-xs font-medium border',
                      getStatusColor(testCase.status)
                    )}>
                      {getStatusText(testCase.status)}
                    </span>
                  </td>

                  {/* Tags */}
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1 max-w-32">
                      {testCase.tags && testCase.tags.length > 0 ? (
                        testCase.tags.slice(0, 2).map((tag, tagIndex) => (
                          <span
                            key={tagIndex}
                            className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-800 border border-blue-200"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-600 text-sm">-</span>
                      )}
                      {testCase.tags && testCase.tags.length > 2 && (
                        <span className="text-sm text-gray-700">+{testCase.tags.length - 2}</span>
                      )}
                    </div>
                  </td>

                  {/* Success Rate */}
                  <td className="px-6 py-4">
                    {testCase.success_rate !== undefined && testCase.success_rate > 0 ? (
                      <div className="flex items-center">
                        <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className="bg-green-600 h-2 rounded-full transition-all"
                            style={{ width: `${testCase.success_rate}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-600 font-medium min-w-[2.5rem]">
                          {testCase.success_rate}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-600 text-sm">-</span>
                    )}
                  </td>

                  {/* Created Time */}
                  <td className="px-6 py-4">
                    <div className="flex items-center text-sm text-gray-500">
                      <Clock className="h-3 w-3 mr-1" />
                      <span className="truncate max-w-32" title={formatDateTime(testCase.created)}>
                        {formatDateTime(testCase.created)}
                      </span>
                    </div>
                  </td>

                  {/* Last Run */}
                  <td className="px-6 py-4">
                    <div className="flex items-center text-sm text-gray-500">
                      <Clock className="h-3 w-3 mr-1" />
                      <span className="truncate max-w-24" title={testCase.lastRun || '从未运行'}>
                        {testCase.lastRun || '从未运行'}
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => onRunTest(testCase)}
                        disabled={runningTestId === testCase.id}
                        className={clsx(
                          "p-1.5 rounded transition-colors",
                          runningTestId === testCase.id
                            ? "text-blue-600 cursor-not-allowed bg-blue-50"
                            : "text-gray-600 hover:text-blue-600 hover:bg-blue-50"
                        )}
                        title={runningTestId === testCase.id ? "执行中..." : "运行测试"}
                      >
                        {runningTestId === testCase.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => onEditTestCase(testCase)}
                        className="p-1.5 rounded text-gray-600 hover:text-green-600 hover:bg-green-50 transition-colors"
                        title="编辑测试用例"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDeleteTestCase(testCase)}
                        className="p-1.5 rounded text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="删除测试用例"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>

                {/* Expanded Row */}
                {expandedRows.has(testCase.id) && (
                  <tr className="bg-blue-50 border-t-0">
                    <td colSpan={10} className="px-6 py-4">
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
                      >
                        {/* Test Steps */}
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center">
                            <Tag className="h-4 w-4 mr-1" />
                            测试步骤
                          </h4>
                          <div className="bg-white rounded-lg p-3 border border-blue-200 max-h-48 overflow-y-auto">
                            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                              {testCase.steps || '暂无步骤描述'}
                            </pre>
                          </div>
                        </div>

                        {/* Assertions */}
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 mb-2">断言预期</h4>
                          <div className="bg-white rounded-lg p-3 border border-blue-200 max-h-48 overflow-y-auto">
                            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                              {testCase.assertions || '暂无断言预期'}
                            </pre>
                          </div>
                        </div>

                        {/* Metadata */}
                        {(testCase.created || testCase.tags?.length) && (
                          <div className="lg:col-span-2">
                            <div className="flex flex-wrap gap-4 text-sm text-gray-600 bg-white rounded-lg p-3 border border-blue-200">
                              {testCase.created && (
                                <div className="flex items-center">
                                  <Clock className="h-3 w-3 mr-1" />
                                  创建时间: {testCase.created}
                                </div>
                              )}
                              {testCase.tags && testCase.tags.length > 2 && (
                                <div className="flex items-center flex-wrap gap-1">
                                  <Tag className="h-3 w-3 mr-1" />
                                  <span>所有标签:</span>
                                  {testCase.tags.map((tag, tagIndex) => (
                                    <span
                                      key={tagIndex}
                                      className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* 分页控件 */}
      {pagination && (onPageChange || onPageSizeChange) && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          {/* 左侧：每页条数选择器 */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-700">每页显示</span>
            {onPageSizeChange && (
              <select
                value={pagination.pageSize}
                onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
                className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            )}
            <span className="text-sm text-gray-700">条</span>
          </div>

          {/* 中间：页码信息 */}
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700">
              显示第 {Math.min((pagination.page - 1) * pagination.pageSize + 1, pagination.total)} 到{' '}
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} 条，共 {pagination.total} 条
            </span>
          </div>

          {/* 右侧：分页按钮 */}
          {onPageChange && (
            <div className="flex items-center space-x-1">
              {/* 第一页 */}
              <button
                onClick={() => onPageChange(1)}
                disabled={pagination.page === 1}
                className={clsx(
                  'p-2 rounded',
                  pagination.page === 1
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
                title="第一页"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>

              {/* 上一页 */}
              <button
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className={clsx(
                  'p-2 rounded',
                  pagination.page === 1
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
                title="上一页"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {/* 页码输入框 */}
              <div className="flex items-center space-x-2 px-2">
                <input
                  type="number"
                  min={1}
                  max={pagination.totalPages}
                  value={pagination.page}
                  onChange={(e) => {
                    const page = parseInt(e.target.value);
                    if (page >= 1 && page <= pagination.totalPages) {
                      onPageChange(page);
                    }
                  }}
                  className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">/ {pagination.totalPages}</span>
              </div>

              {/* 下一页 */}
              <button
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                className={clsx(
                  'p-2 rounded',
                  pagination.page === pagination.totalPages
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
                title="下一页"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>

              {/* 最后一页 */}
              <button
                onClick={() => onPageChange(pagination.totalPages)}
                disabled={pagination.page === pagination.totalPages}
                className={clsx(
                  'p-2 rounded',
                  pagination.page === pagination.totalPages
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
                title="最后一页"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
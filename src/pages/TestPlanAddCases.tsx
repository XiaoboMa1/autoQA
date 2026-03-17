import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Plus,
  Check,
  FileText,
  Activity,
  Filter,
  Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { showToast } from '../utils/toast';
import { testPlanService } from '../services/testPlanService';
import { functionalTestCaseService } from '../services/functionalTestCaseService';
import { testService } from '../services/testService';
import type { TestPlanCase } from '../types/testPlan';
import { useTabs } from '../contexts/TabContext';

interface CaseItem {
  id: number;
  name: string;
  description?: string;
  module?: string;
  priority?: string;
  tags?: string[];
  selected?: boolean;
}

export function TestPlanAddCases() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const caseType = searchParams.get('type') as 'functional' | 'ui_auto' || 'functional';
  const { tabs, removeTab } = useTabs();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [selectedCases, setSelectedCases] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // 加载用例列表
  useEffect(() => {
    loadCases();
  }, [caseType]);

  const loadCases = async () => {
    setLoading(true);
    try {
      if (caseType === 'functional') {
        // 加载功能测试用例
        const response = await functionalTestCaseService.getList({
          page: 1,
          pageSize: 1000,
        });
        
        // response 格式: { success: true, data: [...], total, page, pageSize }
        const data = response.success ? response.data : [];
        
        setCases(data.map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          module: c.module,
          priority: c.priority,
          tags: c.tags ? (typeof c.tags === 'string' ? c.tags.split(',') : c.tags) : [],
        })));
      } else {
        // 加载UI自动化用例
        const response = await testService.getTestCases();
        
        setCases(response.map((c: any) => ({
          id: c.id,
          name: c.name || c.title,
          description: c.description,
          module: c.module,
          priority: c.priority,
          tags: c.tags || [],
        })));
      }
    } catch (error: any) {
      console.error('加载用例列表失败:', error);
      showToast.error('加载用例列表失败: ' + (error.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // 筛选用例
  const filteredCases = cases.filter((c) => {
    if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (filterModule && c.module !== filterModule) {
      return false;
    }
    if (filterPriority && c.priority !== filterPriority) {
      return false;
    }
    return true;
  });

  // 切换选择
  const toggleSelect = (caseId: number) => {
    const newSelected = new Set(selectedCases);
    if (newSelected.has(caseId)) {
      newSelected.delete(caseId);
    } else {
      newSelected.add(caseId);
    }
    setSelectedCases(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedCases.size === filteredCases.length) {
      setSelectedCases(new Set());
    } else {
      setSelectedCases(new Set(filteredCases.map((c) => c.id)));
    }
  };

  // 添加选中的用例
  const handleAddCases = async () => {
    if (selectedCases.size === 0) {
      showToast.warning('请至少选择一个用例');
      return;
    }

    setSaving(true);
    try {
      const casesToAdd = Array.from(selectedCases).map((caseId) => {
        const caseItem = cases.find((c) => c.id === caseId)!;
        return {
          case_id: caseId,
          case_type: caseType,
          case_name: caseItem.name,
        };
      });

      await testPlanService.addCasesToPlan(parseInt(id!), casesToAdd);
      showToast.success(`成功添加 ${casesToAdd.length} 个用例`);
      // 保存当前路径，用于关闭 tab
      const currentPath = location.pathname;
      // 跳转回测试计划详情页
      navigate(`/test-plans/${id}`);
      // 延迟关闭当前标签页，确保导航完成
      setTimeout(() => {
        const currentTab = tabs.find(tab => tab.path === currentPath);
        if (currentTab) {
          removeTab(currentTab.id);
        }
      }, 100);
    } catch (error: any) {
      console.error('添加用例失败:', error);
      showToast.error('添加用例失败');
    } finally {
      setSaving(false);
    }
  };

  // 获取模块列表
  const modules = Array.from(new Set(cases.map((c) => c.module).filter(Boolean)));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-7xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-6">
          <button
            onClick={() => navigate(`/test-plans/${id}`)}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            返回测试计划
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                添加{caseType === 'functional' ? '功能测试' : 'UI自动化'}用例
              </h1>
              <p className="text-gray-600">
                选择要添加到测试计划的用例
              </p>
            </div>
            <button
              onClick={handleAddCases}
              disabled={saving || selectedCases.size === 0}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  添加中...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  添加选中的用例 ({selectedCases.size})
                </>
              )}
            </button>
          </div>
        </div>

        {/* 工具栏 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4">
            {/* 搜索框 */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索用例..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 筛选器 */}
            <select
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">所有模块</option>
              {modules.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">所有优先级</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>

            <button
              onClick={toggleSelectAll}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {selectedCases.size === filteredCases.length && filteredCases.length > 0
                ? '取消全选'
                : '全选'}
            </button>
          </div>
        </div>

        {/* 用例列表 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-12">
              {caseType === 'functional' ? (
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              ) : (
                <Activity className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              )}
              <p className="text-gray-500">没有找到用例</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredCases.map((caseItem) => (
                <div
                  key={caseItem.id}
                  onClick={() => toggleSelect(caseItem.id)}
                  className={clsx(
                    'p-4 cursor-pointer transition-colors',
                    selectedCases.has(caseItem.id)
                      ? 'bg-blue-50 hover:bg-blue-100'
                      : 'hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* 选择框 */}
                    <div
                      className={clsx(
                        'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                        selectedCases.has(caseItem.id)
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300'
                      )}
                    >
                      {selectedCases.has(caseItem.id) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>

                    {/* 用例信息 */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium text-gray-900">{caseItem.name}</h3>
                          {caseItem.description && (
                            <p className="text-sm text-gray-600 mt-1">
                              {caseItem.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        {caseItem.module && (
                          <span className="inline-flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            {caseItem.module}
                          </span>
                        )}
                        {caseItem.priority && (
                          <span
                            className={clsx(
                              'px-2 py-0.5 rounded text-xs font-medium',
                              caseItem.priority === 'high' && 'bg-red-100 text-red-700',
                              caseItem.priority === 'medium' && 'bg-yellow-100 text-yellow-700',
                              caseItem.priority === 'low' && 'bg-green-100 text-green-700'
                            )}
                          >
                            {caseItem.priority === 'high' && '高'}
                            {caseItem.priority === 'medium' && '中'}
                            {caseItem.priority === 'low' && '低'}
                          </span>
                        )}
                        {caseItem.tags && caseItem.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            {caseItem.tags.slice(0, 3).map((tag, index) => (
                              <span
                                key={index}
                                className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                              >
                                {tag}
                              </span>
                            ))}
                            {caseItem.tags.length > 3 && (
                              <span className="text-xs text-gray-500">
                                +{caseItem.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 底部统计 */}
          {!loading && filteredCases.length > 0 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                共 {filteredCases.length} 个用例，已选择 {selectedCases.size} 个
              </div>
              <button
                onClick={handleAddCases}
                disabled={saving || selectedCases.size === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    添加中...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    添加选中的用例
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


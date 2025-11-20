import React, { useState, useEffect } from 'react';
import { Database, Plus, Edit2, Trash2, X, Save, Search, AlertCircle, CheckCircle } from 'lucide-react';
import * as systemService from '../services/systemService';
import type { System, CreateSystemInput, UpdateSystemInput } from '../types/test';

interface SystemFormData {
  name: string;
  description: string;
  status: 'active' | 'inactive';
  sort_order: number;
}

const INITIAL_FORM_DATA: SystemFormData = {
  name: '',
  description: '',
  status: 'active',
  sort_order: 0
};

export default function SystemManagement() {
  const [systems, setSystems] = useState<System[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // 弹窗状态
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<SystemFormData>(INITIAL_FORM_DATA);

  // 消息提示
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  // 加载系统列表
  const loadSystems = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        pageSize,
        search: searchTerm
      };

      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const response = await systemService.getSystems(params);
      setSystems(response.data);
      setTotalPages(response.totalPages);
    } catch (error) {
      showMessage('error', '加载系统列表失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSystems();
  }, [currentPage, statusFilter]);

  // 搜索（防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage === 1) {
        loadSystems();
      } else {
        setCurrentPage(1); // 重置到第一页，会触发loadSystems
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 显示消息提示
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 打开创建弹窗
  const openCreateModal = () => {
    setModalMode('create');
    setFormData({
      ...INITIAL_FORM_DATA,
      sort_order: systems.length * 10 // 自动设置排序号
    });
    setEditingId(null);
    setShowModal(true);
  };

  // 打开编辑弹窗
  const openEditModal = (system: System) => {
    setModalMode('edit');
    setFormData({
      name: system.name,
      description: system.description || '',
      status: system.status,
      sort_order: system.sort_order
    });
    setEditingId(system.id);
    setShowModal(true);
  };

  // 关闭弹窗
  const closeModal = () => {
    setShowModal(false);
    setFormData(INITIAL_FORM_DATA);
    setEditingId(null);
  };

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showMessage('error', '系统名称不能为空');
      return;
    }

    setSubmitting(true);

    try {
      if (modalMode === 'create') {
        const input: CreateSystemInput = {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          status: formData.status,
          sort_order: formData.sort_order
        };
        await systemService.createSystem(input);
        showMessage('success', '创建成功');
      } else if (editingId !== null) {
        const input: UpdateSystemInput = {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          status: formData.status,
          sort_order: formData.sort_order
        };
        await systemService.updateSystem(editingId, input);
        showMessage('success', '更新成功');
      }

      closeModal();
      loadSystems();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.message || '操作失败';
      showMessage('error', errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // 删除系统
  const handleDelete = async (system: System) => {
    if (!confirm(`确定要删除系统"${system.name}"吗？\n\n注意：如果该系统被测试用例引用，将无法删除。`)) {
      return;
    }

    try {
      await systemService.deleteSystem(system.id);
      showMessage('success', '删除成功');
      loadSystems();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || error?.message || '删除失败';
      showMessage('error', errorMessage);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Database className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">系统字典管理</h1>
        </div>
        <p className="text-gray-600">管理测试用例中使用的系统名称，配置后将自动应用到所有测试用例页面</p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <span className={message.type === 'success' ? 'text-green-800' : 'text-red-800'}>
            {message.text}
          </span>
        </div>
      )}

      {/* 工具栏 */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4 justify-between">
          {/* 搜索框 */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索系统名称或描述..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* 筛选和操作 */}
          <div className="flex gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部状态</option>
              <option value="active">启用</option>
              <option value="inactive">禁用</option>
            </select>

            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              新建系统
            </button>
          </div>
        </div>
      </div>

      {/* 系统列表 */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">加载中...</div>
        ) : systems.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Database className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p>暂无系统数据</p>
            <button
              onClick={openCreateModal}
              className="mt-4 text-blue-600 hover:text-blue-700"
            >
              创建第一个系统
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  排序
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  系统名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  描述
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  创建时间
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {systems.map((system) => (
                <tr key={system.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {system.sort_order}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{system.name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-md truncate">
                    {system.description || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      system.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {system.status === 'active' ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(system.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => openEditModal(system)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4 inline" />
                    </button>
                    <button
                      onClick={() => handleDelete(system)}
                      className="text-red-600 hover:text-red-900"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              第 {currentPage} 页，共 {totalPages} 页
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                上一页
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-2xl font-bold text-gray-900">
                {modalMode === 'create' ? '新建系统' : '编辑系统'}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* 系统名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  系统名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="如：电商系统"
                  required
                />
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="系统的详细描述（选填）"
                />
              </div>

              {/* 状态 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  状态
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">启用</option>
                  <option value="inactive">禁用</option>
                </select>
                <p className="mt-1 text-sm text-gray-500">
                  禁用后，该系统将不会在下拉选项中显示
                </p>
              </div>

              {/* 排序号 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  排序号
                </label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="数字越小越靠前"
                />
              </div>

              {/* 提交按钮 */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {submitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

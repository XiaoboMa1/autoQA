import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Calendar, Users, FileText } from 'lucide-react';
import { showToast } from '../utils/toast';
import { testPlanService } from '../services/testPlanService';
import * as systemService from '../services/systemService';
import { useAuth } from '../contexts/AuthContext';
import type { CreateTestPlanInput, TestPlanType, TestPlanStatus } from '../types/testPlan';
import type { SystemOption } from '../types/test';

export function TestPlanForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isEditMode = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<SystemOption[]>([]);

  // 表单数据
  const [formData, setFormData] = useState<CreateTestPlanInput>({
    name: '',
    short_name: '',
    description: '',
    project: '',
    plan_type: 'functional',
    status: 'not_started',
    members: [],
    owner_id: user?.id || 0,
    start_date: '',
    end_date: '',
  });

  // 加载项目列表
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const result = await systemService.getSystems();
      // result 是 SystemsResponse 类型，包含 data 数组
      if (result && result.data) {
        setProjects(result.data);
      }
    } catch (error) {
      console.error('加载项目列表失败:', error);
    }
  };

  // 加载测试计划数据（编辑模式）
  useEffect(() => {
    if (isEditMode && id) {
      loadTestPlan();
    }
  }, [isEditMode, id]);

  const loadTestPlan = async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      const response = await testPlanService.getTestPlanDetail(parseInt(id));
      const plan = response.plan;
      
      setFormData({
        name: plan.name,
        short_name: plan.short_name || '',
        description: plan.description || '',
        project: plan.project || '',
        plan_type: plan.plan_type,
        status: plan.status,
        members: plan.members || [],
        owner_id: plan.owner_id,
        start_date: plan.start_date ? plan.start_date.split('T')[0] : '',
        end_date: plan.end_date ? plan.end_date.split('T')[0] : '',
      });
    } catch (error) {
      console.error('加载测试计划失败:', error);
      showToast.error('加载测试计划失败');
      navigate('/test-plans');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 表单验证
    if (!formData.name.trim()) {
      showToast.error('请输入计划名称');
      return;
    }

    if (!formData.plan_type) {
      showToast.error('请选择计划类型');
      return;
    }

    if (!formData.owner_id) {
      showToast.error('请选择主负责人');
      return;
    }

    setSaving(true);
    try {
      if (isEditMode && id) {
        // 更新测试计划
        await testPlanService.updateTestPlan(parseInt(id), formData);
        showToast.success('测试计划已更新');
      } else {
        // 创建测试计划
        const newPlan = await testPlanService.createTestPlan(formData);
        showToast.success('测试计划已创建');
        navigate(`/test-plans/${newPlan.id}`);
        return;
      }
      
      navigate('/test-plans');
    } catch (error) {
      console.error('保存测试计划失败:', error);
      const errorMessage = error && typeof error === 'object' && 'response' in error 
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error 
        : '保存测试计划失败';
      showToast.error(errorMessage || '保存测试计划失败');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof CreateTestPlanInput, value: string | number | string[] | number[]) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-4xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-6">
          <button
            onClick={() => navigate(isEditMode ? `/test-plans/${id}` : '/test-plans')}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            返回列表
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {isEditMode ? '编辑测试计划' : '新建测试计划'}
          </h1>
          <p className="text-gray-600">
            {isEditMode ? '修改测试计划信息' : '创建一个新的测试计划'}
          </p>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="space-y-6">
            {/* 基本信息 */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                基本信息
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                {/* 计划名称 */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    计划名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="请输入计划名称"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* 计划简称 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    计划简称
                  </label>
                  <input
                    type="text"
                    value={formData.short_name}
                    onChange={(e) => handleChange('short_name', e.target.value)}
                    placeholder="请输入简称"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* 所属项目 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    所属项目
                  </label>
                  <select
                    value={formData.project}
                    onChange={(e) => handleChange('project', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">请选择项目</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.name}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 计划类型 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    计划类型 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.plan_type}
                    onChange={(e) => handleChange('plan_type', e.target.value as TestPlanType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="functional">功能测试</option>
                    <option value="ui_auto">UI自动化测试</option>
                    <option value="mixed">混合测试</option>
                    <option value="regression">回归测试</option>
                    <option value="smoke">冒烟测试</option>
                    <option value="integration">集成测试</option>
                  </select>
                </div>

                {/* 计划状态 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    计划状态
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleChange('status', e.target.value as TestPlanStatus)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {/* <option value="draft">草稿</option> */}
                    <option value="not_started">未开始</option>
                    <option value="active">进行中</option>
                    <option value="completed">已完成</option>
                    <option value="expired">已结束</option>
                    <option value="cancelled">已取消</option>
                    <option value="archived">已归档</option>
                  </select>
                </div>

                {/* 计划描述 */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    计划描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="请输入计划描述"
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* 时间安排 */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                时间安排
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                {/* 开始日期 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    开始日期
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => handleChange('start_date', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* 结束日期 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    结束日期
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => handleChange('end_date', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* 成员管理 */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                成员管理
              </h3>
              
              <div className="space-y-4">
                {/* 主负责人 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    主负责人 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-sm text-gray-500">
                    当前负责人: {user?.username || '未知'}
                  </p>
                  <input
                    type="hidden"
                    value={formData.owner_id}
                  />
                </div>

                {/* 测试成员 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    测试成员
                  </label>
                  <p className="text-sm text-gray-500">
                    此功能将在后续版本中完善，支持添加多个测试成员
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/test-plans')}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={saving}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {isEditMode ? '保存修改' : '创建计划'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


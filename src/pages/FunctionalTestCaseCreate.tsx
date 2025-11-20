import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, X, Loader2 } from 'lucide-react';
import { TestPointsEditor, TestPoint } from '../components/functional-test-case/TestPointsEditor';
import { functionalTestCaseService } from '../services/functionalTestCaseService';
import * as systemService from '../services/systemService';
import type { SystemOption } from '../types/test';
import { showToast } from '../utils/toast';

/**
 * 表单数据接口
 */
interface FormData {
  name: string;
  description: string;
  system: string;
  module: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  testType: string;
  tags: string;
  preconditions: string;
  testData: string;
  sectionName: string;
  coverageAreas: string;
  testPoints: TestPoint[];
}

/**
 * 功能测试用例创建页面
 */
export function FunctionalTestCaseCreate() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // 🔥 新增：系统字典列表
  const [systemOptions, setSystemOptions] = useState<SystemOption[]>([]);

  // 表单数据状态
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    system: '',
    module: '',
    priority: 'medium',
    status: 'DRAFT',
    testType: '',
    tags: '',
    preconditions: '',
    testData: '',
    sectionName: '',
    coverageAreas: '',
    testPoints: [
      {
        testPurpose: '',
        testPointName: '',
        steps: '',
        expectedResult: '',
        riskLevel: 'medium'
      }
    ]
  });

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

  /**
   * 处理输入字段变更
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  /**
   * 处理测试点变更
   */
  const handleTestPointsChange = (testPoints: TestPoint[]) => {
    setFormData(prev => ({ ...prev, testPoints }));
  };

  /**
   * 表单验证
   */
  const validateForm = (): boolean => {
    // 验证名称
    if (!formData.name.trim()) {
      showToast.error('请输入测试用例名称');
      return false;
    }
    if (formData.name.length > 255) {
      showToast.error('测试用例名称不能超过255个字符');
      return false;
    }

    // 验证测试点
    if (formData.testPoints.length === 0) {
      showToast.error('至少需要一个测试点');
      return false;
    }

    // 验证每个测试点的必填字段
    for (let i = 0; i < formData.testPoints.length; i++) {
      const point = formData.testPoints[i];
      if (!point.testPointName.trim()) {
        showToast.error(`测试点 ${i + 1} 的名称不能为空`);
        return false;
      }
      if (!point.steps.trim()) {
        showToast.error(`测试点 ${i + 1} 的测试步骤不能为空`);
        return false;
      }
      if (!point.expectedResult.trim()) {
        showToast.error(`测试点 ${i + 1} 的预期结果不能为空`);
        return false;
      }
    }

    return true;
  };

  /**
   * 提交表单
   */
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (saving) return;
    if (!validateForm()) return;

    try {
      setSaving(true);

      // 准备提交数据
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        system: formData.system.trim(),
        module: formData.module.trim(),
        priority: formData.priority,
        status: formData.status,
        testType: formData.testType.trim(),
        tags: formData.tags.trim(),
        preconditions: formData.preconditions.trim(),
        testData: formData.testData.trim(),
        sectionName: formData.sectionName.trim(),
        coverageAreas: formData.coverageAreas.trim(),
        testPoints: formData.testPoints.map(point => ({
          testPurpose: point.testPurpose?.trim(),
          testPointName: point.testPointName.trim(),
          steps: point.steps.trim(),
          expectedResult: point.expectedResult.trim(),
          riskLevel: point.riskLevel
        }))
      };

      await functionalTestCaseService.create(payload);
      showToast.success('测试用例创建成功');
      navigate('/functional-test-cases');
    } catch (error: any) {
      console.error('创建测试用例失败:', error);
      showToast.error('创建失败：' + error.message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * 取消创建
   */
  const handleCancel = () => {
    if (confirm('确定要取消创建吗？未保存的数据将丢失。')) {
      navigate('/functional-test-cases');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        {/* 顶部导航栏 */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors border border-gray-300"
            >
              <ArrowLeft className="h-4 w-4" />
              返回列表
            </button>
            <h1 className="text-2xl font-bold text-gray-900">创建功能测试用例</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4 mr-2" />
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  保存
                </>
              )}
            </button>
          </div>
        </div>

        {/* 表单内容 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* 基本信息 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              基本信息
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  测试用例名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  maxLength={255}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="输入测试用例名称"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  描述
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
                  placeholder="输入测试用例描述"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  系统
                </label>
                <select
                  name="system"
                  value={formData.system}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="">请选择系统</option>
                  {systemOptions.map(sys => (
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
                  name="module"
                  value={formData.module}
                  onChange={handleInputChange}
                  maxLength={100}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="输入模块名称"
                />
              </div>
            </div>
          </div>

          {/* 测试配置 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">测试配置</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  优先级 <span className="text-red-500">*</span>
                </label>
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                  <option value="critical">紧急</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  状态 <span className="text-red-500">*</span>
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="DRAFT">草稿</option>
                  <option value="PUBLISHED">已发布</option>
                  <option value="ARCHIVED">已归档</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  测试类型
                </label>
                <input
                  type="text"
                  name="testType"
                  value={formData.testType}
                  onChange={handleInputChange}
                  maxLength={50}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="例如：功能测试、集成测试"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  标签 <span className="text-gray-600 text-xs">(逗号分隔)</span>
                </label>
                <input
                  type="text"
                  name="tags"
                  value={formData.tags}
                  onChange={handleInputChange}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="例如：登录,权限,核心功能"
                />
              </div>
            </div>
          </div>

          {/* 测试详情 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">测试详情</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  前置条件
                </label>
                <textarea
                  name="preconditions"
                  value={formData.preconditions}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
                  placeholder="输入测试前置条件"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  测试数据
                </label>
                <textarea
                  name="testData"
                  value={formData.testData}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
                  placeholder="输入测试所需数据"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  章节名称
                </label>
                <input
                  type="text"
                  name="sectionName"
                  value={formData.sectionName}
                  onChange={handleInputChange}
                  maxLength={255}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="输入章节名称"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  覆盖范围
                </label>
                <input
                  type="text"
                  name="coverageAreas"
                  value={formData.coverageAreas}
                  onChange={handleInputChange}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="输入测试覆盖范围"
                />
              </div>
            </div>
          </div>

          {/* 测试点列表 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <TestPointsEditor
              testPoints={formData.testPoints}
              onChange={handleTestPointsChange}
              readOnly={false}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

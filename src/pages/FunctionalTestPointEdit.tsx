import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, X, Loader2, FileText } from 'lucide-react';
import { clsx } from 'clsx';
import { StepsEditor } from '../components/functional-test-case/StepsEditor';
import { functionalTestCaseService } from '../services/functionalTestCaseService';
import { showToast } from '../utils/toast';

/**
 * 测试点表单数据
 */
interface TestPointFormData {
  testPurpose: string;
  testPointName: string;
  steps: string;
  expectedResult: string;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * 关联的测试用例信息
 */
interface TestCaseInfo {
  id: number;
  name: string;
  system: string;
  module: string;
  sectionName: string;
}

/**
 * 风险等级映射
 */
const riskLevelMap = {
  low: { label: '低风险', color: 'bg-green-100 text-green-700 border-green-300' },
  medium: { label: '中风险', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  high: { label: '高风险', color: 'bg-red-100 text-red-700 border-red-300' }
};

/**
 * 功能测试点编辑页面
 */
export function FunctionalTestPointEdit() {
  const { testPointId } = useParams<{ testPointId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testCaseInfo, setTestCaseInfo] = useState<TestCaseInfo | null>(null);
  const [formData, setFormData] = useState<TestPointFormData>({
    testPurpose: '',
    testPointName: '',
    steps: '',
    expectedResult: '',
    riskLevel: 'medium'
  });

  /**
   * 加载测试点数据
   */
  useEffect(() => {
    loadTestPointData();
  }, [testPointId]);

  const loadTestPointData = async () => {
    if (!testPointId) {
      showToast.error('缺少测试点ID');
      navigate('/functional-test-cases');
      return;
    }

    try {
      setLoading(true);
      const response = await functionalTestCaseService.getTestPointById(parseInt(testPointId));

      // 后端返回格式：{ success: true, data: { testPoint: {...}, testCase: {...} } }
      const { testPoint, testCase } = response.data;

      // 映射测试点数据（snake_case → camelCase）
      setFormData({
        testPurpose: testPoint.test_purpose || '',
        testPointName: testPoint.test_point_name || '',
        steps: testPoint.steps || '',
        expectedResult: testPoint.expected_result || '',
        riskLevel: testPoint.risk_level || 'medium'
      });

      // 设置关联用例信息
      setTestCaseInfo({
        id: testCase.id,
        name: testCase.name,
        system: testCase.system || '',
        module: testCase.module || '',
        sectionName: testCase.section_name || ''
      });
    } catch (error: any) {
      console.error('加载测试点数据失败:', error);
      showToast.error('加载失败：' + error.message);
      navigate('/functional-test-cases');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理输入字段变更
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  /**
   * 处理步骤变更
   */
  const handleStepsChange = (stepsText: string) => {
    setFormData(prev => ({ ...prev, steps: stepsText }));
  };

  /**
   * 表单验证
   */
  const validateForm = (): boolean => {
    if (!formData.testPointName.trim()) {
      showToast.error('请输入测试点名称');
      return false;
    }
    if (formData.testPointName.length > 500) {
      showToast.error('测试点名称不能超过500个字符');
      return false;
    }
    if (!formData.steps.trim()) {
      showToast.error('请输入测试步骤');
      return false;
    }
    if (!formData.expectedResult.trim()) {
      showToast.error('请输入预期结果');
      return false;
    }
    return true;
  };

  /**
   * 提交表单
   */
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (saving || loading) return;
    if (!validateForm()) return;

    try {
      setSaving(true);

      // 准备提交数据
      const payload = {
        testPurpose: formData.testPurpose.trim(),
        testPointName: formData.testPointName.trim(),
        steps: formData.steps.trim(),
        expectedResult: formData.expectedResult.trim(),
        riskLevel: formData.riskLevel
      };

      await functionalTestCaseService.updateTestPoint(parseInt(testPointId!), payload);
      showToast.success('测试点更新成功');
      navigate('/functional-test-cases');
    } catch (error: any) {
      console.error('更新测试点失败:', error);
      showToast.error('更新失败：' + error.message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * 取消编辑
   */
  const handleCancel = () => {
    if (confirm('确定要取消编辑吗？未保存的修改将丢失。')) {
      navigate('/functional-test-cases');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-6">
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
            <h1 className="text-2xl font-bold text-gray-900">编辑测试点</h1>
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* 关联用例信息（只读） */}
          {testCaseInfo && (
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border-2 border-purple-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-5 w-5 text-purple-600" />
                <h2 className="text-lg font-semibold text-gray-900">关联测试用例</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-700 mb-1 block">用例名称</label>
                  <p className="text-sm font-medium text-gray-900">{testCaseInfo.name}</p>
                </div>
                {testCaseInfo.system && (
                  <div>
                    <label className="text-sm text-gray-700 mb-1 block">系统</label>
                    <p className="text-sm text-gray-700">{testCaseInfo.system}</p>
                  </div>
                )}
                {testCaseInfo.module && (
                  <div>
                    <label className="text-sm text-gray-700 mb-1 block">模块</label>
                    <p className="text-sm text-gray-700">{testCaseInfo.module}</p>
                  </div>
                )}
                {testCaseInfo.sectionName && (
                  <div>
                    <label className="text-sm text-gray-700 mb-1 block">章节</label>
                    <p className="text-sm text-gray-700">{testCaseInfo.sectionName}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 测试点表单 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">测试点信息</h2>

            <div className="space-y-6">
              {/* 测试目的 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  测试目的 <span className="text-gray-600 text-xs">(可选)</span>
                </label>
                <input
                  type="text"
                  name="testPurpose"
                  value={formData.testPurpose}
                  onChange={handleInputChange}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="输入测试目的"
                />
              </div>

              {/* 测试点名称和风险等级 */}
              <div className="grid grid-cols-[1fr_200px] gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    测试点名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="testPointName"
                    value={formData.testPointName}
                    onChange={handleInputChange}
                    maxLength={500}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="输入测试点名称"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    风险等级 <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="riskLevel"
                    value={formData.riskLevel}
                    onChange={handleInputChange}
                    className={clsx(
                      "w-full px-3 py-2 border-2 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all font-medium",
                      riskLevelMap[formData.riskLevel]?.color
                    )}
                  >
                    <option value="low">🟢 低风险</option>
                    <option value="medium">🟡 中风险</option>
                    <option value="high">🔴 高风险</option>
                  </select>
                </div>
              </div>

              {/* 测试步骤 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  测试步骤 <span className="text-red-500">*</span>
                </label>
                <StepsEditor
                  stepsText={formData.steps}
                  onChange={handleStepsChange}
                  readOnly={false}
                />
              </div>

              {/* 预期结果 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  预期结果 <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="expectedResult"
                  value={formData.expectedResult}
                  onChange={handleInputChange}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
                  placeholder="输入预期结果"
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

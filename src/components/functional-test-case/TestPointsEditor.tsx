import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { Trash2, Plus } from 'lucide-react';
import { StepsEditor } from './StepsEditor';

/**
 * 测试点数据接口
 * 注意：测试步骤和预期结果在测试用例层，不在测试点层
 */
export interface TestPoint {
  testPurpose?: string;        // 测试目的 (可选)
  testPoint: string;            // 测试点名称 (必填) - 统一使用 testPoint 字段
  testPointName?: string;       // 兼容旧字段，已废弃，使用 testPoint
  steps?: string;               // 测试步骤 (可选，已移至测试用例层)
  expectedResult?: string;      // 预期结果 (可选，已移至测试用例层)
  riskLevel: 'low' | 'medium' | 'high';  // 风险等级 (必填)
  testScenario?: string;        // 测试场景 (可选)
  description?: string;         // 测试点描述 (可选)
  coverageAreas?: string;       // 覆盖范围 (可选)
}

/**
 * 测试点编辑器组件属性
 */
interface TestPointsEditorProps {
  testPoints: TestPoint[];
  onChange: (points: TestPoint[]) => void;
  readOnly?: boolean;
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
 * 测试点编辑器组件
 * 支持测试点的添加、删除、编辑功能
 */
export function TestPointsEditor({
  testPoints,
  onChange,
  readOnly = false
}: TestPointsEditorProps) {

  /**
   * 更新单个测试点
   */
  const updateTestPoint = (index: number, field: keyof TestPoint, value: string) => {
    const newTestPoints = [...testPoints];
    newTestPoints[index] = { ...newTestPoints[index], [field]: value };
    onChange(newTestPoints);
  };

  /**
   * 删除测试点
   */
  const deleteTestPoint = (index: number) => {
    if (testPoints.length <= 1) {
      alert('至少需要保留一个测试点');
      return;
    }
      if (confirm(`确定要删除测试点 "${testPoints[index].testPoint || testPoints[index].testPointName || '(未命名)'}" 吗？`)) {
      const newTestPoints = testPoints.filter((_, i) => i !== index);
      onChange(newTestPoints);
    }
  };

  /**
   * 添加新测试点
   */
  const addTestPoint = () => {
    const newTestPoint: TestPoint = {
      testPurpose: '',
      testPoint: '',
      riskLevel: 'medium'
    };
    onChange([...testPoints, newTestPoint]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          测试点列表
        </h3>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded-full">
            共 {testPoints.length} 个测试点
          </span>
          {!readOnly && (
            <button
              onClick={addTestPoint}
              className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600
                       text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700
                       transition-all shadow-sm hover:shadow-md"
            >
              <Plus className="w-4 h-4 mr-1" />
              添加测试点
            </button>
          )}
        </div>
      </div>

      {/* 测试点卡片列表 */}
      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
        <AnimatePresence>
          {testPoints.map((point, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="bg-white border-2 border-gray-200 rounded-xl p-5 hover:border-purple-300 transition-colors relative"
            >
              {/* 删除按钮 */}
              {!readOnly && (
                <button
                  onClick={() => deleteTestPoint(index)}
                  className="absolute top-3 right-3 p-2 text-gray-600 hover:text-red-500 hover:bg-red-50
                           rounded-lg transition-all group"
                  title="删除此测试点"
                  disabled={testPoints.length === 1}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              {/* 测试点头部 - 简化版 */}
              <div className="flex items-start justify-between mb-4 pr-8">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500
                                  flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    {/* 测试点名称 - 必填 */}
                    <div className="mb-3">
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        测试点名称 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={point.testPoint || point.testPointName || ''}
                        onChange={(e) => {
                          const newTestPoints = [...testPoints];
                          newTestPoints[index] = { 
                            ...newTestPoints[index], 
                            testPoint: e.target.value,
                            testPointName: e.target.value // 兼容旧字段
                          };
                          onChange(newTestPoints);
                        }}
                        disabled={readOnly}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium
                                 focus:ring-2 focus:ring-purple-500 focus:border-transparent
                                 transition-all disabled:bg-gray-50 disabled:text-gray-500"
                        placeholder="输入测试点名称"
                      />
                    </div>

                    {/* 风险等级 - 简化显示 */}
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-700 whitespace-nowrap">风险等级：</label>
                      <select
                        value={point.riskLevel}
                        onChange={(e) => updateTestPoint(index, 'riskLevel', e.target.value as TestPoint['riskLevel'])}
                        disabled={readOnly}
                        className={clsx(
                          "px-3 py-1.5 text-sm font-medium rounded-lg border-2 cursor-pointer transition-colors",
                          "disabled:cursor-not-allowed disabled:opacity-60",
                          riskLevelMap[point.riskLevel]?.color || riskLevelMap.medium.color
                        )}
                      >
                        <option value="low">🟢 低风险</option>
                        <option value="medium">🟡 中风险</option>
                        <option value="high">🔴 高风险</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* 提示信息：测试步骤和预期结果在测试用例中填写 */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700">
                  💡 提示：测试步骤和预期结果需要在测试用例中填写。请先创建测试用例。
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 空状态 */}
      {testPoints.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500">暂无测试点</p>
          {!readOnly && (
            <button
              onClick={addTestPoint}
              className="mt-4 inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600
                       text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700
                       transition-all shadow-sm hover:shadow-md"
            >
              <Plus className="w-4 h-4 mr-2" />
              添加第一个测试点
            </button>
          )}
        </div>
      )}
    </div>
  );
}

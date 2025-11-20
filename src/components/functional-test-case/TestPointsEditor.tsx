import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { Trash2, Plus } from 'lucide-react';
import { StepsEditor } from './StepsEditor';

/**
 * 测试点数据接口
 */
export interface TestPoint {
  testPurpose?: string;        // 测试目的 (可选)
  testPointName: string;        // 测试点名称 (必填)
  steps: string;                // 测试步骤 (必填)
  expectedResult: string;       // 预期结果 (必填)
  riskLevel: 'low' | 'medium' | 'high';  // 风险等级 (必填)
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
    if (confirm(`确定要删除测试点 "${testPoints[index].testPointName || '(未命名)'}" 吗？`)) {
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
      testPointName: '',
      steps: '',
      expectedResult: '',
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

              {/* 测试点头部 */}
              <div className="flex items-start justify-between mb-4 pr-8">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500
                                  flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 space-y-3">
                    {/* 测试目的 */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">
                        测试目的 <span className="text-gray-600 text-xs">(可选)</span>
                      </label>
                      <input
                        type="text"
                        value={point.testPurpose || ''}
                        onChange={(e) => updateTestPoint(index, 'testPurpose', e.target.value)}
                        disabled={readOnly}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                                 focus:ring-2 focus:ring-purple-500 focus:border-transparent
                                 transition-all disabled:bg-gray-50 disabled:text-gray-500"
                        placeholder="输入测试目的"
                      />
                    </div>

                    {/* 测试点名称 */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">
                        测试点名称 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={point.testPointName}
                        onChange={(e) => updateTestPoint(index, 'testPointName', e.target.value)}
                        disabled={readOnly}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium
                                 focus:ring-2 focus:ring-purple-500 focus:border-transparent
                                 transition-all disabled:bg-gray-50 disabled:text-gray-500"
                        placeholder="输入测试点名称"
                      />
                    </div>
                  </div>
                </div>

                {/* 风险等级选择 */}
                <div className="ml-3">
                  <label className="text-sm text-gray-700 mb-1 block">风险等级</label>
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

              {/* 测试步骤 */}
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  测试步骤 <span className="text-red-500">*</span>
                </label>
                <StepsEditor
                  stepsText={point.steps}
                  onChange={(text) => updateTestPoint(index, 'steps', text)}
                  readOnly={readOnly}
                />
              </div>

              {/* 预期结果 */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  预期结果 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={point.expectedResult}
                  onChange={(e) => updateTestPoint(index, 'expectedResult', e.target.value)}
                  disabled={readOnly}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:ring-2 focus:ring-purple-500 focus:border-transparent
                           transition-all resize-none disabled:bg-gray-50 disabled:text-gray-500"
                  placeholder="输入预期结果"
                />
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

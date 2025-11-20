import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { clsx } from 'clsx';
import { Tag, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';

interface TestPoint {
  testPoint: string;
  steps: string;
  expectedResult: string;
  riskLevel?: string;
}

interface TestCaseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  testCase: any;
  onSave: (updatedTestCase: any) => void;
}

const riskLevelMap = {
  low: { label: '低风险', color: 'bg-green-100 text-green-700 border-green-300' },
  medium: { label: '中风险', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  high: { label: '高风险', color: 'bg-red-100 text-red-700 border-red-300' }
};

export function TestCaseDetailModal({
  isOpen,
  onClose,
  testCase,
  onSave
}: TestCaseDetailModalProps) {
  const [editedTestPoints, setEditedTestPoints] = useState<TestPoint[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // 当 testCase 变化时，初始化编辑状态
  useEffect(() => {
    console.log('🔍 TestCaseDetailModal - testCase:', testCase);
    console.log('🔍 testPoints 数据:', testCase?.testPoints);
    console.log('🔍 testPoints 数量:', testCase?.testPoints?.length);

    if (testCase?.testPoints && Array.isArray(testCase.testPoints)) {
      setEditedTestPoints(JSON.parse(JSON.stringify(testCase.testPoints)));
      setHasChanges(false);
    } else {
      console.warn('⚠️  testPoints 不存在或不是数组');
      setEditedTestPoints([]);
    }
  }, [testCase]);

  if (!testCase) return null;

  // 更新单个测试点
  const updateTestPoint = (index: number, field: keyof TestPoint, value: string) => {
    const newTestPoints = [...editedTestPoints];
    newTestPoints[index] = { ...newTestPoints[index], [field]: value };
    setEditedTestPoints(newTestPoints);
    setHasChanges(true);
  };

  // 删除测试点
  const deleteTestPoint = (index: number) => {
    if (editedTestPoints.length <= 1) {
      alert('至少需要保留一个测试点');
      return;
    }
    if (confirm(`确定要删除测试点 "${editedTestPoints[index].testPoint}" 吗？`)) {
      const newTestPoints = editedTestPoints.filter((_, i) => i !== index);
      setEditedTestPoints(newTestPoints);
      setHasChanges(true);
    }
  };

  // 保存修改
  const handleSave = () => {
    const updatedTestCase = {
      ...testCase,
      testPoints: editedTestPoints
    };
    onSave(updatedTestCase);
    setHasChanges(false);
  };

  // 取消修改
  const handleCancel = () => {
    if (hasChanges) {
      if (confirm('您有未保存的修改，确定要关闭吗？')) {
        onClose();
        setHasChanges(false);
      }
    } else {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title="测试用例详情"
      size="wide"
      closeOnClickOutside={false}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {hasChanges && (
              <>
                <AlertCircle className="w-4 h-4 text-orange-500" />
                <span className="text-orange-600">有未保存的修改</span>
              </>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleCancel}>
              取消
            </Button>
            <Button
              variant="default"
              onClick={handleSave}
              disabled={!hasChanges}
              icon={hasChanges ? <CheckCircle2 className="w-4 h-4" /> : undefined}
            >
              {hasChanges ? '保存修改' : '已保存'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* 用例基本信息 */}
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-5 border border-purple-200">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700 mb-1 block">用例名称</label>
              <p className="text-sm font-semibold text-gray-900">{testCase.name}</p>
            </div>
            <div>
              <label className="text-sm text-gray-700 mb-1 block">章节</label>
              <p className="text-sm text-gray-700">
                {testCase.sectionId ? `${testCase.sectionId} ${testCase.sectionName}` : '未指定'}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-700 mb-1 block">测试目的</label>
              <p className="text-sm text-gray-700">{testCase.testPurpose || testCase.description || '无'}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-gray-700 mb-1 block">系统</label>
                <p className="text-sm text-gray-700">{testCase.system || '未指定'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-700 mb-1 block">模块</label>
                <p className="text-sm text-gray-700">{testCase.module || '未指定'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 测试点列表 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              测试点列表
            </h3>
            <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded-full">
              共 {editedTestPoints.length} 个测试点
            </span>
          </div>

          {/* 测试点卡片 */}
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
            {editedTestPoints.map((point, index) => (
              <div
                key={index}
                className="bg-white border-2 border-gray-200 rounded-xl p-5 hover:border-purple-300 transition-colors relative"
              >
                {/* 删除按钮 */}
                <button
                  onClick={() => deleteTestPoint(index)}
                  className="absolute top-3 right-3 p-2 text-gray-600 hover:text-red-500 hover:bg-red-50
                           rounded-lg transition-all group"
                  title="删除此测试点"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {/* 测试点头部 */}
                <div className="flex items-start justify-between mb-4 pr-8">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500
                                    flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-700 mb-2 block">
                        测试点名称
                      </label>
                      <input
                        type="text"
                        value={point.testPoint}
                        onChange={(e) => updateTestPoint(index, 'testPoint', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium
                                 focus:ring-2 focus:ring-purple-500 focus:border-transparent
                                 transition-all"
                        placeholder="输入测试点名称"
                      />
                    </div>
                  </div>

                  {/* 风险等级选择 */}
                  <div className="ml-3">
                    <label className="text-sm text-gray-700 mb-1 block">风险等级</label>
                    <select
                      value={point.riskLevel || 'medium'}
                      onChange={(e) => updateTestPoint(index, 'riskLevel', e.target.value)}
                      className={clsx(
                        "px-3 py-1.5 text-sm font-medium rounded-lg border-2 cursor-pointer transition-colors",
                        riskLevelMap[point.riskLevel as keyof typeof riskLevelMap]?.color || riskLevelMap.medium.color
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
                    测试步骤
                  </label>
                  <textarea
                    value={point.steps}
                    onChange={(e) => updateTestPoint(index, 'steps', e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                             focus:ring-2 focus:ring-purple-500 focus:border-transparent
                             transition-all resize-none"
                    placeholder="输入测试步骤，每行一个步骤"
                  />
                </div>

                {/* 预期结果 */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    预期结果
                  </label>
                  <textarea
                    value={point.expectedResult}
                    onChange={(e) => updateTestPoint(index, 'expectedResult', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                             focus:ring-2 focus:ring-purple-500 focus:border-transparent
                             transition-all resize-none"
                    placeholder="输入预期结果"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* 空状态 */}
          {editedTestPoints.length === 0 && (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <Tag className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500">暂无测试点</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

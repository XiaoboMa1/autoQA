import React, { useState, useCallback } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { TestStepRow } from '../types/test';
import { Button } from './ui/button';

interface StepTableEditorProps {
  steps: TestStepRow[];
  onChange: (steps: TestStepRow[]) => void;
  readOnly?: boolean;
}

export function StepTableEditor({ steps, onChange, readOnly = false }: StepTableEditorProps) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: 'action' | 'expected' | 'note' } | null>(null);

  // 确保 steps 始终是数组
  const safeSteps = steps || [];

  // 添加新步骤
  const handleAddStep = useCallback(() => {
    const newStep: TestStepRow = {
      id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order: safeSteps.length + 1,
      action: '',
      expected: '',
      type: 'action'
    };
    onChange([...safeSteps, newStep]);
  }, [safeSteps, onChange]);

  // 删除步骤
  const handleDeleteStep = useCallback((stepId: string) => {
    const filtered = safeSteps.filter(s => s.id !== stepId);
    // 重新排序
    const reordered = filtered.map((step, index) => ({ ...step, order: index + 1 }));
    onChange(reordered);
  }, [safeSteps, onChange]);

  // 更新步骤字段
  const handleUpdateField = useCallback((stepId: string, field: keyof TestStepRow, value: any) => {
    const updated = safeSteps.map(step =>
      step.id === stepId ? { ...step, [field]: value } : step
    );
    onChange(updated);
  }, [safeSteps, onChange]);

  // 开始编辑单元格
  const startEditing = (rowId: string, field: 'action' | 'expected' | 'note') => {
    if (!readOnly) {
      setEditingCell({ rowId, field });
    }
  };

  // 结束编辑
  const stopEditing = () => {
    setEditingCell(null);
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {/* 表头 */}
      <div className="bg-gray-50 border-b">
        <div className="grid grid-cols-[40px_1fr_80px] gap-3 px-3 py-2 text-sm font-medium text-gray-700">
          <div className="text-center">#</div>
          <div>操作步骤</div>
          <div className="text-center">操作</div>
        </div>
      </div>

      {/* 表格主体 */}
      <div className="divide-y max-h-[28vh] overflow-y-auto">
        {safeSteps.length === 0 ? (
          <div className="py-12 text-center text-gray-600">
            暂无步骤，点击下方"添加步骤"按钮开始
          </div>
        ) : (
          safeSteps.map((step, index) => (
            <div
              key={step.id}
              className="grid grid-cols-[40px_1fr_80px] gap-3 px-3 py-2 hover:bg-gray-50 transition-colors items-start"
            >
              {/* 序号 */}
              <div className="flex items-center justify-center pt-2">
                <span className="text-sm text-gray-500">{step.order}</span>
              </div>

              {/* 操作步骤 */}
              <div className="min-h-[40px]">
                {editingCell?.rowId === step.id && editingCell?.field === 'action' ? (
                  <textarea
                    autoFocus
                    value={step.action}
                    onChange={(e) => handleUpdateField(step.id, 'action', e.target.value)}
                    onBlur={stopEditing}
                    className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={2}
                    placeholder="描述操作步骤..."
                  />
                ) : (
                  <div
                    onClick={() => startEditing(step.id, 'action')}
                    className={`px-2 py-1 rounded cursor-text min-h-[40px] text-sm ${
                      step.action ? 'text-gray-900' : 'text-gray-600'
                    } ${!readOnly && 'hover:bg-gray-100'}`}
                  >
                    {step.action || '点击输入操作步骤...'}
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center justify-center gap-1 pt-1">
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteStep(step.id)}
                    className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                    title="删除步骤"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部添加按钮和统计 */}
      {!readOnly && (
        <div className="border-t bg-gray-50 px-3 py-2 flex items-center justify-between gap-3">
          <div className="text-sm text-gray-700">
            共 {steps.length} 个步骤
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleAddStep}
            size="sm"
            className="flex items-center gap-1.5 hover:bg-white h-8"
          >
            <Plus className="h-3.5 w-3.5" />
            添加步骤
          </Button>
        </div>
      )}
    </div>
  );
}

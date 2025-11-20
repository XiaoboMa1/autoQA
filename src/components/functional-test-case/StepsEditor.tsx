import React, { useState, useEffect } from 'react';
import { StepTableEditor } from '../StepTableEditor';
import { parseStepsText, serializeStepsToText } from '../../utils/stepConverter';
import { TestStepRow } from '../../types/test';

/**
 * 步骤编辑器组件属性
 */
interface StepsEditorProps {
  stepsText: string;                    // 数据库Text格式的步骤
  onChange: (text: string) => void;     // 步骤文本变更回调
  readOnly?: boolean;                   // 只读模式
}

/**
 * 步骤编辑器组件
 *
 * 包装 StepTableEditor 组件，负责数据格式转换：
 * - 输入：数据库Text格式 (例如: "1. 操作 -> 预期")
 * - 内部：结构化数据 TestStepRow[]
 * - 输出：数据库Text格式
 *
 * 完全复用 StepTableEditor 的 UI 和交互逻辑
 */
export function StepsEditor({
  stepsText,
  onChange,
  readOnly = false
}: StepsEditorProps) {
  // 内部状态：结构化的步骤数据
  const [steps, setSteps] = useState<TestStepRow[]>([]);

  /**
   * 监听 stepsText 变化，解析为结构化数据
   */
  useEffect(() => {
    try {
      const parsed = parseStepsText(stepsText);
      setSteps(parsed || []);
    } catch (error) {
      console.error('解析步骤文本失败:', error);
      setSteps([]);
    }
  }, [stepsText]);

  /**
   * 处理步骤变更
   * 将结构化数据转换回文本格式并通知父组件
   */
  const handleStepsChange = (newSteps: TestStepRow[]) => {
    setSteps(newSteps);

    try {
      const serialized = serializeStepsToText(newSteps);
      onChange(serialized);
    } catch (error) {
      console.error('序列化步骤失败:', error);
    }
  };

  return (
    <div className="steps-editor">
      <StepTableEditor
        steps={steps}
        onChange={handleStepsChange}
        readOnly={readOnly}
      />
    </div>
  );
}

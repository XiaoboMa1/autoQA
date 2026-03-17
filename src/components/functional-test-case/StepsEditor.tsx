import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  // 用于跟踪上一次序列化的文本，避免循环更新
  const lastSerializedTextRef = useRef<string>('');
  // 用于跟踪是否是内部更新（避免外部 stepsText 变化时覆盖内部状态）
  const isInternalUpdateRef = useRef<boolean>(false);
  // 用于跟踪组件是否已初始化
  const isInitializedRef = useRef<boolean>(false);

  /**
   * 监听 stepsText 变化，解析为结构化数据
   * 只有当 stepsText 是外部变化时才解析（避免内部更新导致的循环）
   */
  useEffect(() => {
    // 如果是内部更新导致的 stepsText 变化，跳过解析
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false;
      return;
    }

    // 如果 stepsText 与上次序列化的文本相同，跳过解析（避免不必要的重新解析）
    if (stepsText === lastSerializedTextRef.current) {
      return;
    }

    try {
      // 如果 stepsText 为空或未定义，初始化为空数组
      if (!stepsText || stepsText.trim() === '') {
        // 初始化时，如果 stepsText 为空且还未初始化，保持空数组
        if (!isInitializedRef.current) {
          isInitializedRef.current = true;
          setSteps([]);
          lastSerializedTextRef.current = '';
          return;
        }
        // 如果已经初始化，只有当当前 steps 不为空时才更新
        setSteps(prevSteps => {
          if (prevSteps.length === 0) {
            return prevSteps; // 如果已经是空数组，不更新
          }
          lastSerializedTextRef.current = '';
          return [];
        });
        return;
      }
      
      // 标记为已初始化
      isInitializedRef.current = true;
      
      const parsed = parseStepsText(stepsText);
      // 只有当解析结果与当前 steps 不同时才更新
      setSteps(prevSteps => {
        // 比较解析结果与当前步骤是否相同（通过序列化比较）
        const currentText = serializeStepsToText(prevSteps);
        if (stepsText !== currentText) {
          lastSerializedTextRef.current = stepsText;
          return parsed || [];
        }
        return prevSteps; // 如果相同，不更新
      });
    } catch (error) {
      console.error('解析步骤文本失败:', error);
      setSteps(prevSteps => {
        if (prevSteps.length > 0) {
          lastSerializedTextRef.current = '';
          return [];
        }
        return prevSteps;
      });
    }
  }, [stepsText]);

  /**
   * 处理步骤变更
   * 将结构化数据转换回文本格式并通知父组件
   */
  const handleStepsChange = useCallback((newSteps: TestStepRow[]) => {
    try {
      const serialized = serializeStepsToText(newSteps);
      // 标记为内部更新，避免触发 useEffect 重新解析
      isInternalUpdateRef.current = true;
      lastSerializedTextRef.current = serialized;
      // 先更新本地状态，确保UI立即响应
      setSteps(newSteps);
      // 然后通知父组件（使用 requestAnimationFrame 确保状态更新后再通知，避免闪屏）
      requestAnimationFrame(() => {
        onChange(serialized);
      });
    } catch (error) {
      console.error('序列化步骤失败:', error);
    }
  }, [onChange]);

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

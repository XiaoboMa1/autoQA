import { TestStepRow } from '../types/test';

/**
 * 将文本格式的步骤转换为结构化数据
 * 支持多种文本格式：
 * 1. "1. 操作 -> 预期"
 * 2. "1. 操作 | 预期"
 * 3. "1. 操作\n预期结果：xxx"
 */
export function parseStepsText(text: string): TestStepRow[] {
  if (!text || text.trim() === '') return [];

  const lines = text.split('\n').filter(line => line.trim());
  const steps: TestStepRow[] = [];
  let currentStep: Partial<TestStepRow> | null = null;
  let order = 1;

  for (const line of lines) {
    const trimmed = line.trim();

    // 检测步骤开始（数字开头）
    const stepMatch = trimmed.match(/^(\d+)[.、\s]+(.+)$/);

    if (stepMatch) {
      // 保存上一个步骤
      if (currentStep && currentStep.action) {
        steps.push({
          id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          order: order++,
          action: currentStep.action,
          expected: currentStep.expected || '',
          note: currentStep.note,
          type: 'action'
        });
      }

      const content = stepMatch[2];

      // 尝试分隔操作和预期（支持 -> 或 | 分隔符）
      const arrowMatch = content.match(/^(.+?)\s*(?:->|→)\s*(.+)$/);
      const pipeMatch = content.match(/^(.+?)\s*\|\s*(.+)$/);

      if (arrowMatch) {
        currentStep = {
          action: arrowMatch[1].trim(),
          expected: arrowMatch[2].trim()
        };
      } else if (pipeMatch) {
        currentStep = {
          action: pipeMatch[1].trim(),
          expected: pipeMatch[2].trim()
        };
      } else {
        currentStep = {
          action: content.trim(),
          expected: ''
        };
      }
    } else if (currentStep) {
      // 处理多行内容
      if (trimmed.startsWith('预期') || trimmed.startsWith('期望') || trimmed.startsWith('结果')) {
        const expectedMatch = trimmed.match(/^(?:预期|期望|结果)[：:]\s*(.+)$/);
        if (expectedMatch) {
          currentStep.expected = expectedMatch[1].trim();
        } else {
          currentStep.expected = trimmed;
        }
      } else if (trimmed.startsWith('备注') || trimmed.startsWith('注意')) {
        const noteMatch = trimmed.match(/^(?:备注|注意)[：:]\s*(.+)$/);
        if (noteMatch) {
          currentStep.note = noteMatch[1].trim();
        } else {
          currentStep.note = trimmed;
        }
      } else {
        // 追加到操作或预期
        if (!currentStep.expected) {
          currentStep.action += '\n' + trimmed;
        } else {
          currentStep.expected += '\n' + trimmed;
        }
      }
    }
  }

  // 保存最后一个步骤
  if (currentStep && currentStep.action) {
    steps.push({
      id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order: order,
      action: currentStep.action,
      expected: currentStep.expected || '',
      note: currentStep.note,
      type: 'action'
    });
  }

  return steps;
}

/**
 * 将结构化数据转换为文本格式
 * 格式：序号. 操作 -> 预期
 */
export function serializeStepsToText(steps: TestStepRow[]): string {
  if (!steps || steps.length === 0) return '';

  return steps
    .sort((a, b) => a.order - b.order)
    .map(step => {
      let text = `${step.order}. ${step.action}`;

      if (step.expected) {
        text += ` -> ${step.expected}`;
      }

      if (step.note) {
        text += `\n   备注：${step.note}`;
      }

      return text;
    })
    .join('\n');
}

/**
 * 智能检测文本格式是否可解析
 */
export function isValidStepsText(text: string): boolean {
  if (!text || text.trim() === '') return true; // 空文本有效

  const lines = text.split('\n').filter(line => line.trim());

  // 至少有一行以数字开头
  return lines.some(line => /^\d+[.、\s]/.test(line.trim()));
}

/**
 * 获取步骤预览（用于文本模式的快速展示）
 */
export function getStepsPreview(steps: TestStepRow[], maxLength: number = 100): string {
  if (!steps || steps.length === 0) return '无步骤';

  const firstStep = steps[0];
  const preview = firstStep.action.substring(0, maxLength);

  if (steps.length > 1) {
    return `${preview}... (共${steps.length}步)`;
  }

  return preview;
}

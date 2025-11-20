import React, { useState } from 'react';
import { Modal, Button, Tag, Collapse, Progress, Radio, Space, Checkbox, Input, InputNumber, Select } from 'antd';
import { CheckCircle, AlertCircle, HelpCircle, Sparkles } from 'lucide-react';
import type { PreAnalysisResult, UncertainInfo, UserConfirmation } from '../../types/aiPreAnalysis';

const { TextArea } = Input;

const { Panel } = Collapse;

interface Props {
  open: boolean;
  preAnalysisResult: PreAnalysisResult;
  onConfirm: (confirmations: UserConfirmation[]) => void;
  onSkip: () => void;
  loading?: boolean;
}

/**
 * 智能补全对话框
 * 展示AI预分析结果，让用户快速确认不确定的关键信息
 */
export function SmartCompletionModal({ open, preAnalysisResult, onConfirm, onSkip, loading }: Props) {
  const [confirmations, setConfirmations] = useState<Record<string, UserConfirmation>>({});

  // 按重要性分组
  const highPriority = preAnalysisResult.uncertainInfo.filter(i => i.importance === 'high');
  const mediumPriority = preAnalysisResult.uncertainInfo.filter(i => i.importance === 'medium');
  const lowPriority = preAnalysisResult.uncertainInfo.filter(i => i.importance === 'low');

  // 计算进度
  const totalQuestions = preAnalysisResult.uncertainInfo.length;
  const answeredQuestions = Object.values(confirmations).filter(c => c.confirmed || c.skipped).length;
  const progressPercent = totalQuestions > 0
    ? Math.round(((preAnalysisResult.statistics.certainFields + answeredQuestions) / preAnalysisResult.statistics.totalFields) * 100)
    : 85;

  // 处理确认
  const handleConfirm = (info: UncertainInfo, userValue?: string[], skipped = false) => {
    setConfirmations(prev => ({
      ...prev,
      [info.id]: {
        id: info.id,
        confirmed: !skipped,
        userValue: userValue || info.aiGuess,
        skipped
      }
    }));
  };

  // 提交所有确认
  const handleSubmit = () => {
    const confirmationList = Object.values(confirmations);
    onConfirm(confirmationList);
  };

  // 检查是否有未回答的高优先级问题
  const hasUnansweredHighPriority = highPriority.some(
    info => !confirmations[info.id]?.confirmed && !confirmations[info.id]?.skipped
  );

  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      width={900}
      closable={false}
      maskClosable={false}
    >
      <div className="p-6">
        {/* 头部：AI置信度 + 进度 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  智能补全 - AI已识别 {(preAnalysisResult.confidence * 100).toFixed(0)}% 的信息
                </h2>
                <p className="text-sm text-gray-500">
                  以下 {totalQuestions} 个关键信息需要您确认，预计 3-5 分钟完成
                </p>
              </div>
            </div>
          </div>

          {/* 进度条 */}
          <div className="bg-gray-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                确认进度：{answeredQuestions} / {totalQuestions}
              </span>
              <span className="text-sm font-bold text-purple-600">
                {progressPercent}% 完成
              </span>
            </div>
            <Progress
              percent={progressPercent}
              strokeColor={{
                '0%': '#a855f7',
                '100%': '#ec4899'
              }}
              showInfo={false}
            />
          </div>
        </div>

        {/* AI确定的信息（可折叠） */}
        {preAnalysisResult.clearInfo.length > 0 && (
          <Collapse className="mb-6" ghost>
            <Panel
              header={
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-medium">AI已确定的信息（{preAnalysisResult.clearInfo.length}条）</span>
                </div>
              }
              key="clearInfo"
            >
              <div className="space-y-2">
                {preAnalysisResult.clearInfo.map((info, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-700">{info}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </Collapse>
        )}

        {/* 高优先级问题（必答） */}
        {highPriority.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                高优先级问题（必答）
              </h3>
            </div>
            <div className="space-y-4">
              {highPriority.map((info, index) => (
                <QuestionCard
                  key={info.id}
                  index={index + 1}
                  info={info}
                  confirmation={confirmations[info.id]}
                  onConfirm={handleConfirm}
                  priority="high"
                />
              ))}
            </div>
          </div>
        )}

        {/* 中优先级问题（建议回答） */}
        {mediumPriority.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <HelpCircle className="w-5 h-5 text-orange-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                中优先级问题（建议回答）
              </h3>
            </div>
            <div className="space-y-4">
              {mediumPriority.map((info, index) => (
                <QuestionCard
                  key={info.id}
                  index={index + 1}
                  info={info}
                  confirmation={confirmations[info.id]}
                  onConfirm={handleConfirm}
                  priority="medium"
                />
              ))}
            </div>
          </div>
        )}

        {/* 低优先级问题（可折叠） */}
        {lowPriority.length > 0 && (
          <Collapse className="mb-6" ghost>
            <Panel
              header={`💡 还有 ${lowPriority.length} 个低优先级问题`}
              key="lowPriority"
            >
              <div className="space-y-4">
                {lowPriority.map((info, index) => (
                  <QuestionCard
                    key={info.id}
                    index={index + 1}
                    info={info}
                    confirmation={confirmations[info.id]}
                    onConfirm={handleConfirm}
                    priority="low"
                  />
                ))}
              </div>
            </Panel>
          </Collapse>
        )}

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between pt-6 border-t">
          <Button
            size="large"
            onClick={onSkip}
            disabled={loading}
          >
            跳过补全，直接生成
          </Button>
          <div className="flex gap-3">
            <Button
              type="primary"
              size="large"
              onClick={handleSubmit}
              loading={loading}
              disabled={hasUnansweredHighPriority}
            >
              确认并生成需求文档
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * 单个问题卡片 - 支持多种类型的交互
 */
function QuestionCard({
  index,
  info,
  confirmation,
  onConfirm,
  priority
}: {
  index: number;
  info: UncertainInfo;
  confirmation?: UserConfirmation;
  onConfirm: (info: UncertainInfo, userValue?: string[], skipped?: boolean) => void;
  priority: string;
}) {
  const priorityColors = {
    high: 'border-red-200 bg-red-50',
    medium: 'border-orange-200 bg-orange-50',
    low: 'border-gray-200 bg-gray-50'
  };

  // 🎯 统一状态管理
  const [radioValue, setRadioValue] = useState<string>(''); // 用于单选(pageType, fieldRequired)
  const [checkboxValues, setCheckboxValues] = useState<string[]>([]); // 用于多选(enumValues)
  const [textValue, setTextValue] = useState<string>(''); // 用于文本输入(businessRule, fieldMeaning, workflow)
  const [numberValue, setNumberValue] = useState<number | null>(null); // 用于数字输入(fieldLength)
  const [customInput, setCustomInput] = useState<string>(''); // 用于自定义输入
  const [showCustomInput, setShowCustomInput] = useState(false); // 是否显示自定义输入框

  // 页面类型选项
  const pageTypeOptions = [
    { label: '列表页 (list)', value: 'list', desc: '有查询条件 + 数据列表' },
    { label: '表单页 (form)', value: 'form', desc: '新建/编辑数据' },
    { label: '详情页 (detail)', value: 'detail', desc: '只读展示' },
    { label: '混合页 (mixed)', value: 'mixed', desc: '包含多种功能' }
  ];

  // 校验规则选项
  const validationRuleOptions = [
    { label: '必填', value: '必填' },
    { label: '邮箱格式', value: '邮箱格式' },
    { label: '手机号格式', value: '手机号格式' },
    { label: '身份证格式', value: '身份证格式' },
    { label: '数字格式', value: '数字格式' },
    { label: '日期格式', value: '日期格式' },
    { label: '自定义规则...', value: 'custom' }
  ];

  // 字段必填选项
  const fieldRequiredOptions = [
    { label: '必填', value: '是' },
    { label: '选填', value: '否' }
  ];

  const handleAcceptAI = () => {
    onConfirm(info, info.aiGuess || [], false);
  };

  const handleSkip = () => {
    onConfirm(info, undefined, true);
  };

  // 🎯 统一确认处理
  const handleConfirmClick = () => {
    let userValue: string[] = [];

    switch (info.type) {
      case 'pageType':
        userValue = radioValue ? [radioValue] : [];
        break;
      case 'enumValues':
        // 多选 + 自定义输入
        userValue = [...checkboxValues];
        if (customInput.trim()) {
          userValue.push(...customInput.split(',').map(v => v.trim()).filter(v => v));
        }
        break;
      case 'businessRule':
      case 'fieldMeaning':
      case 'workflow':
        userValue = textValue.trim() ? [textValue.trim()] : [];
        break;
      case 'validationRule':
        if (radioValue === 'custom') {
          userValue = customInput.trim() ? [customInput.trim()] : [];
        } else {
          userValue = radioValue ? [radioValue] : [];
        }
        break;
      case 'fieldRequired':
        userValue = radioValue ? [radioValue] : [];
        break;
      case 'fieldLength':
        userValue = numberValue !== null ? [numberValue.toString()] : [];
        break;
      default:
        userValue = [];
    }

    if (userValue.length > 0) {
      onConfirm(info, userValue, false);
    }
  };

  // 检查是否可以确认
  const canConfirm = () => {
    switch (info.type) {
      case 'pageType':
      case 'fieldRequired':
        return !!radioValue;
      case 'enumValues':
        return checkboxValues.length > 0 || customInput.trim().length > 0;
      case 'businessRule':
      case 'fieldMeaning':
      case 'workflow':
        return textValue.trim().length > 0;
      case 'validationRule':
        return radioValue === 'custom' ? customInput.trim().length > 0 : !!radioValue;
      case 'fieldLength':
        return numberValue !== null && numberValue > 0;
      default:
        return false;
    }
  };

  const isAnswered = confirmation?.confirmed || confirmation?.skipped;

  // 渲染输入UI (根据类型)
  const renderInputUI = () => {
    if (isAnswered) return null;

    switch (info.type) {
      // 1. 页面类型 - 单选
      case 'pageType':
        return (
          <div className="mb-3">
            <div className="text-sm text-gray-600 mb-2">请选择页面类型：</div>
            <Radio.Group onChange={(e) => setRadioValue(e.target.value)} value={radioValue}>
              <Space direction="vertical">
                {pageTypeOptions.map(option => (
                  <Radio key={option.value} value={option.value}>
                    <span className="font-medium">{option.label}</span>
                    <span className="text-gray-500 text-xs ml-2">- {option.desc}</span>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>
        );

      // 2. 枚举值 - 多选 + 自定义输入
      case 'enumValues':
        return (
          <div className="mb-3">
            <div className="text-sm text-gray-600 mb-2">请选择或输入枚举值：</div>
            {info.aiGuess && info.aiGuess.length > 0 && (
              <Checkbox.Group
                value={checkboxValues}
                onChange={(values) => setCheckboxValues(values as string[])}
                className="mb-2"
              >
                <Space direction="vertical">
                  {info.aiGuess.map((value, idx) => (
                    <Checkbox key={idx} value={value}>
                      {value}
                    </Checkbox>
                  ))}
                </Space>
              </Checkbox.Group>
            )}
            <div className="mt-2">
              <Input
                placeholder="输入其他值(逗号分隔,如: 选项1,选项2)"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                size="small"
              />
            </div>
          </div>
        );

      // 3. 字段必填 - 单选(是/否)
      case 'fieldRequired':
        return (
          <div className="mb-3">
            <div className="text-sm text-gray-600 mb-2">该字段是否必填：</div>
            <Radio.Group onChange={(e) => setRadioValue(e.target.value)} value={radioValue}>
              <Space>
                {fieldRequiredOptions.map(option => (
                  <Radio key={option.value} value={option.value}>
                    <span className="font-medium">{option.label}</span>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>
        );

      // 4. 校验规则 - 下拉选择 + 自定义输入
      case 'validationRule':
        return (
          <div className="mb-3">
            <div className="text-sm text-gray-600 mb-2">请选择校验规则：</div>
            <Radio.Group
              onChange={(e) => {
                setRadioValue(e.target.value);
                setShowCustomInput(e.target.value === 'custom');
              }}
              value={radioValue}
            >
              <Space direction="vertical">
                {validationRuleOptions.map(option => (
                  <Radio key={option.value} value={option.value}>
                    {option.label}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
            {showCustomInput && (
              <Input
                className="mt-2"
                placeholder="输入自定义规则"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                size="small"
              />
            )}
          </div>
        );

      // 5. 字段长度 - 数字输入
      case 'fieldLength':
        return (
          <div className="mb-3">
            <div className="text-sm text-gray-600 mb-2">请输入字段最大长度：</div>
            <InputNumber
              placeholder="如: 50"
              value={numberValue}
              onChange={(value) => setNumberValue(value)}
              min={1}
              max={9999}
              size="small"
              style={{ width: '200px' }}
            />
          </div>
        );

      // 6. 业务规则 - 文本域
      case 'businessRule':
        return (
          <div className="mb-3">
            <div className="text-sm text-gray-600 mb-2">请输入业务规则：</div>
            <TextArea
              placeholder="描述该功能的业务规则..."
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              rows={3}
              maxLength={500}
              showCount
            />
          </div>
        );

      // 7. 字段含义 - 文本输入
      case 'fieldMeaning':
        return (
          <div className="mb-3">
            <div className="text-sm text-gray-600 mb-2">请输入字段含义：</div>
            <Input
              placeholder="描述该字段的含义..."
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              size="small"
              maxLength={200}
            />
          </div>
        );

      // 8. 工作流 - 文本域
      case 'workflow':
        return (
          <div className="mb-3">
            <div className="text-sm text-gray-600 mb-2">请输入工作流程：</div>
            <TextArea
              placeholder="描述该流程的步骤..."
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              rows={3}
              maxLength={500}
              showCount
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`border-2 rounded-lg p-4 ${priorityColors[priority as keyof typeof priorityColors]} ${isAnswered ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="text-lg font-bold text-gray-700 flex-shrink-0">
          {index}️⃣
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-gray-900">{info.question}</h4>
            <Tag color={priority === 'high' ? 'red' : priority === 'medium' ? 'orange' : 'default'}>
              {priority === 'high' ? '必答' : priority === 'medium' ? '建议' : '可选'}
            </Tag>
          </div>

          <div className="text-sm text-gray-700 mb-3">
            📍 {info.context.pageName} {info.field && `· 字段: ${info.field}`}
          </div>

          {/* AI推测信息(如果有) */}
          {!isAnswered && info.aiGuess && info.aiGuess.length > 0 && info.type !== 'enumValues' && (
            <div className="mb-3">
              <div className="text-sm text-gray-600">AI推测：</div>
              <div className="flex flex-wrap gap-2 mt-1">
                {info.aiGuess.map((value, idx) => (
                  <Tag key={idx} color="blue">{value}</Tag>
                ))}
              </div>
            </div>
          )}

          {/* 渲染输入UI */}
          {renderInputUI()}

          {/* 操作按钮 */}
          {!isAnswered && (
            <div className="flex gap-2 mt-3">
              {/* AI推测按钮 (仅当有AI推测且非特殊类型) */}
              {info.aiGuess && info.aiGuess.length > 0 && info.type !== 'enumValues' && (
                <Button
                  size="small"
                  type="default"
                  onClick={handleAcceptAI}
                >
                  ✓ 采纳AI建议
                </Button>
              )}
              {/* 确认按钮 */}
              <Button
                size="small"
                type="primary"
                disabled={!canConfirm()}
                onClick={handleConfirmClick}
              >
                ✓ 确认
              </Button>
              {/* 跳过按钮 */}
              <Button
                size="small"
                onClick={handleSkip}
              >
                ⏭ 跳过
              </Button>
            </div>
          )}

          {/* 已回答状态 */}
          {isAnswered && (
            <div className="mt-3 text-sm text-green-600 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {confirmation.skipped ? '已跳过' : `已确认: ${confirmation.userValue?.join(', ')}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

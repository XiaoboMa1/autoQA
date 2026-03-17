import React from 'react';
import { motion } from 'framer-motion';
import { Tag, List, User, Clock, Edit3, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';

interface TestCaseCardProps {
  id: number;
  name: string;
  description?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  source: string;
  system?: string;
  module?: string;
  sectionId?: string;
  sectionName?: string;
  testPointsCount?: number;
  testPurpose?: string;
  creator?: string;
  createdAt: string;
  updatedAt?: string;
  tags?: string;
  testCase?: any;
  onViewDetail?: (testCase: any) => void;
  onEdit?: (id: number) => void;
  onDelete?: (id: number, name: string) => void;
}

const priorityMap = {
  critical: { label: '紧急', color: 'bg-red-100 text-red-700 border-red-300' },
  high: { label: '高', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  medium: { label: '中', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  low: { label: '低', color: 'bg-gray-100 text-gray-700 border-gray-300' }
};

const statusMap: Record<string, { label: string; color: string }> = {
  PUBLISHED: { label: '已发布', color: 'bg-green-100 text-green-700 border-green-300' },
  DRAFT: { label: '草稿', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  ARCHIVED: { label: '已归档', color: 'bg-gray-100 text-gray-700 border-gray-300' }
};

const sourceMap: Record<string, { label: string; color: string }> = {
  AI_GENERATED: { label: 'AI生成', color: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
  MANUAL: { label: '手动创建', color: 'bg-purple-100 text-purple-700 border-purple-300' }
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3 }
  }
};

export function TestCaseCard({
  id,
  name,
  description,
  priority,
  status,
  source,
  system,
  module,
  sectionId,
  sectionName,
  testPointsCount,
  testPurpose,
  creator,
  createdAt,
  updatedAt,
  tags,
  testCase,
  onViewDetail,
  onEdit,
  onDelete
}: TestCaseCardProps) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <motion.div
      variants={itemVariants}
      layout
      className="relative bg-white rounded-xl p-5 border-2 border-gray-200 hover:border-purple-300
                 transition-all duration-200 cursor-pointer hover:shadow-lg"
      onClick={() => onViewDetail?.(testCase)}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* 顶部标签栏 */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* 章节标记 */}
          {sectionId && (
            <span className="px-2.5 py-1 bg-purple-100 text-purple-700
                           text-xs font-medium rounded-full">
              章节 {sectionId}
            </span>
          )}

          {/* 状态标记 */}
          <span className={clsx(
            'px-2.5 py-1 text-xs font-medium rounded-full border',
            statusMap[status]?.color || 'bg-gray-100 text-gray-700 border-gray-300'
          )}>
            {statusMap[status]?.label || status}
          </span>

          {/* 来源标记 */}
          <span className={clsx(
            'px-2.5 py-1 text-xs font-medium rounded-full border',
            sourceMap[source]?.color || 'bg-gray-100 text-gray-700 border-gray-300'
          )}>
            {sourceMap[source]?.label || source}
          </span>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(id);
            }}
            className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50
                     rounded-lg transition-all"
            title="编辑"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(id, name);
            }}
            className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50
                     rounded-lg transition-all"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 用例内容 */}
      <div className="mb-3">
        <h4 className="text-base font-semibold text-gray-900 mb-2 line-clamp-2 min-h-[3rem]">
          {name}
        </h4>

        {/* 显示测试目的或描述 */}
        {(testPurpose || description) && (
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
            📋 {testPurpose || description}
          </p>
        )}

        {/* 章节名称 */}
        {sectionName && (
          <p className="text-sm text-gray-700 mb-2">
            📄 {sectionName}
          </p>
        )}

        {/* 系统/模块 */}
        {(system || module) && (
          <div className="flex items-center gap-2 text-sm text-gray-700 mb-2">
            {system && <span>🖥️ {system}</span>}
            {system && module && <span>•</span>}
            {module && <span>📦 {module}</span>}
          </div>
        )}
      </div>

      {/* 标签 */}
      {tags && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.split(',').slice(0, 3).map((tag: string, idx: number) => (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 text-xs font-medium
                       bg-blue-50 text-blue-700 rounded border border-blue-200"
            >
              {tag.trim()}
            </span>
          ))}
          {tags.split(',').length > 3 && (
            <span className="text-sm text-gray-600 px-2 py-0.5">
              +{tags.split(',').length - 3}
            </span>
          )}
        </div>
      )}

      {/* 底部元数据 */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="flex items-center gap-3 text-sm text-gray-700">
          {/* 优先级 */}
          <div className="flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" />
            <span className={clsx(
              'font-medium',
              priority === 'critical' && 'text-red-600',
              priority === 'high' && 'text-orange-600',
              priority === 'medium' && 'text-blue-600',
              priority === 'low' && 'text-gray-600'
            )}>
              {priorityMap[priority]?.label}
            </span>
          </div>

          {/* 测试点数量 */}
          {testPointsCount !== undefined && testPointsCount > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <div className="flex items-center gap-1">
                <List className="w-3.5 h-3.5" />
                <span>{testPointsCount} 个测试点</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 创建者和时间 */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600">
        <div className="flex items-center gap-1">
          <User className="w-3.5 h-3.5" />
          <span>{creator || '未知'}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          <span>{formatDate(createdAt)}</span>
        </div>
      </div>
    </motion.div>
  );
}

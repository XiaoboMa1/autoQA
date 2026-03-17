import React from 'react';
import { ChevronLeft, ChevronsLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import { clsx } from 'clsx';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
  showPageSizeSelector?: boolean; // 是否显示每页条数选择器
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  className,
  showPageSizeSelector = true,
}: PaginationProps) {
  return (
    <div className={clsx('flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50', className)}>
      {/* 左侧：统计信息 */}
      <div className="text-sm text-gray-500">
        共 <span className="font-semibold text-gray-700">{total}</span> 条记录，
        第 <span className="font-semibold text-gray-700">{page}</span> / <span className="font-semibold text-gray-700">{totalPages}</span> 页
      </div>

      <div className="flex space-x-4">
        {/* 中间：分页按钮 */}
        {onPageChange && (
          <div className="flex items-center space-x-1">
            {/* 第一页 */}
            <button
              onClick={() => onPageChange(1)}
              disabled={page === 1}
              className={clsx(
                'p-2 rounded',
                page === 1
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              )}
              title="第一页"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>

            {/* 上一页 */}
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className={clsx(
                'p-2 rounded',
                page === 1
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              )}
              title="上一页"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* 页码输入框 */}
            <div className="flex items-center space-x-2 px-2">
              <input
                type="number"
                min={1}
                max={totalPages}
                value={page}
                onChange={(e) => {
                  const newPage = parseInt(e.target.value);
                  if (newPage >= 1 && newPage <= totalPages) {
                    onPageChange(newPage);
                  }
                }}
                className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">/ {totalPages}</span>
            </div>

            {/* 下一页 */}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              className={clsx(
                'p-2 rounded',
                page === totalPages
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              )}
              title="下一页"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* 最后一页 */}
            <button
              onClick={() => onPageChange(totalPages)}
              disabled={page === totalPages}
              className={clsx(
                'p-2 rounded',
                page === totalPages
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              )}
              title="最后一页"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* 右侧：每页条数选择器 */}
        {showPageSizeSelector && onPageSizeChange && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-700">每页显示</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
              className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ width: '80px' }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-sm text-gray-700">条</span>
          </div>
        )}
      </div>
    </div>
  );
}


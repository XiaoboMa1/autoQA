import React, { useState, useMemo } from 'react';
import { Input } from 'antd';
import { marked } from 'marked';
import { Eye, Edit3, FileText } from 'lucide-react';
import { clsx } from 'clsx';

const { TextArea } = Input;

// 配置marked
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // 换行符转换为<br>
  headerIds: true,
  mangle: false
});

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

/**
 * Markdown编辑器组件
 * 支持预览和编辑模式切换
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder = '请输入内容...',
  rows = 20,
  className
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('preview');

  // 使用useMemo缓存渲染结果
  const htmlContent = useMemo(() => {
    if (!value) return '';
    try {
      return marked.parse(value);
    } catch (error) {
      console.error('Markdown解析错误:', error);
      return '<p>Markdown解析失败</p>';
    }
  }, [value]);

  return (
    <div className={clsx('markdown-editor-container', className)}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">
            AI 生成的需求文档
          </span>
        </div>

        {/* 模式切换按钮 */}
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setMode('preview')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              mode === 'preview'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <Eye className="w-4 h-4" />
            预览
          </button>
          <button
            onClick={() => setMode('edit')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              mode === 'edit'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <Edit3 className="w-4 h-4" />
            编辑
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      {mode === 'edit' ? (
        <TextArea
          className="requirement-editor font-mono"
          rows={rows}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <div
          className="markdown-preview bg-white rounded-xl p-8 border border-gray-200 overflow-auto"
          style={{ maxHeight: `${rows * 24}px`, minHeight: '400px' }}
        >
          {value ? (
            <div
              className="prose prose-slate max-w-none
                prose-headings:text-gray-900
                prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-6 prose-h1:border-b prose-h1:border-gray-200 prose-h1:pb-3
                prose-h2:text-2xl prose-h2:font-semibold prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-b prose-h2:border-gray-100 prose-h2:pb-2
                prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-blue-700
                prose-h4:text-lg prose-h4:font-medium prose-h4:mt-6 prose-h4:mb-2 prose-h4:text-gray-800
                prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-4
                prose-ul:my-4 prose-ol:my-4
                prose-li:text-gray-700 prose-li:my-1
                prose-strong:text-gray-900 prose-strong:font-semibold
                prose-code:text-pink-600 prose-code:bg-pink-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:before:content-[''] prose-code:after:content-['']
                prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto
                prose-table:w-full prose-table:border-collapse prose-table:text-sm prose-table:my-6
                prose-thead:bg-gradient-to-r prose-thead:from-blue-50 prose-thead:to-indigo-50
                prose-th:border prose-th:border-gray-300 prose-th:p-3 prose-th:text-left prose-th:font-semibold prose-th:text-gray-900
                prose-td:border prose-td:border-gray-300 prose-td:p-3 prose-td:text-gray-700
                prose-tr:even:bg-gray-50
                prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-600
                prose-a:text-blue-600 prose-a:underline prose-a:hover:text-blue-800
              "
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          ) : (
            <div className="text-center py-12 text-gray-600">
              暂无内容
            </div>
          )}
        </div>
      )}

      {/* 统计信息 */}
      <div className="flex items-center gap-6 mt-4 text-sm text-gray-500">
        <div className="flex items-center gap-1">
          <FileText className="w-4 h-4" />
          <span>{value.length} 字</span>
        </div>
        <div className="flex items-center gap-1">
          <span>{value.split('\n').length} 行</span>
        </div>
        {mode === 'preview' && (
          <div className="text-sm text-gray-600">
            💡 点击右上角"编辑"按钮可修改内容
          </div>
        )}
      </div>
    </div>
  );
}

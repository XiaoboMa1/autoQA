import React, { useEffect, useRef, useState } from 'react';

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
}

export const TagInput: React.FC<TagInputProps> = ({
  value,
  onChange,
  placeholder = '输入后按 Enter 或逗号添加标签',
  maxTags,
}) => {
  const [inputValue, setInputValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 清理无效值
    if (Array.isArray(value)) {
      const cleaned = value.map((t) => t.trim()).filter((t) => t.length > 0);
      if (cleaned.length !== value.length) {
        onChange(cleaned);
      }
    }
  }, [value, onChange]);

  const focusInput = () => {
    inputRef.current?.focus();
  };

  const addTags = (raw: string | string[]) => {
    const parts = Array.isArray(raw) ? raw : raw.split(/[,;\n\r]+/);
    let incoming = parts.map((t) => t.trim()).filter((t) => t.length > 0);
    if (incoming.length === 0) return;

    // 去重（与已存在的合并去重）
    const set = new Set([...(value || []), ...incoming]);
    let next = Array.from(set);

    if (typeof maxTags === 'number') {
      next = next.slice(0, maxTags);
    }

    onChange(next);
  };

  const removeAt = (idx: number) => {
    const next = [...(value || [])];
    next.splice(idx, 1);
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，' || e.key === ';') {
      e.preventDefault();
      if (inputValue.trim().length > 0) {
        addTags(inputValue);
        setInputValue('');
      }
      return;
    }

    if (e.key === 'Backspace' && inputValue.length === 0 && (value?.length || 0) > 0) {
      // 删除最后一个
      e.preventDefault();
      removeAt((value?.length || 1) - 1);
      return;
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    if (/[,\n\r，;]/.test(text)) {
      e.preventDefault();
      addTags(text);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim().length > 0) {
      addTags(inputValue);
      setInputValue('');
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full min-h-[2.5rem] px-2 py-1 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent flex flex-wrap gap-1 bg-white"
      onClick={focusInput}
      role="group"
      aria-label="标签输入"
    >
      {(value || []).map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          className="inline-flex items-center max-w-full px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800"
          title={tag}
        >
          <span className="truncate">{tag}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeAt(idx);
            }}
            className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-200 text-blue-700"
            aria-label={`移除标签 ${tag}`}
            title="移除"
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        className="flex-1 min-w-[8rem] px-1 py-1 outline-none text-sm text-gray-900 placeholder:text-gray-600"
        placeholder={placeholder}
        aria-label="添加标签"
      />
    </div>
  );
};
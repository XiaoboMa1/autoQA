import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio } from 'antd';
import { Upload, FileText, FileCode, Folder, X, CheckCircle, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface UploadedFile {
  file: File;
  type: 'html' | 'js' | 'unknown';
  status: 'pending' | 'valid' | 'invalid';
  error?: string;
}

interface MultiFileUploadProps {
  onFilesChange: (files: File[]) => void;
  onPageNameChange?: (pageName: string) => void; // 新增:页面名称回调
  pageMode?: 'new' | 'modify'; // 🆕 页面模式
  onPageModeChange?: (mode: 'new' | 'modify') => void; // 🆕 页面模式回调
  maxFiles?: number;
  maxSize?: number; // in bytes
}

/**
 * 多文件上传组件 - 支持拖拽整个文件夹
 * 支持 HTML + JS 文件上传
 */
export function MultiFileUpload({
  onFilesChange,
  onPageNameChange,
  pageMode = 'new',
  onPageModeChange,
  maxFiles = 20,
  maxSize = 50 * 1024 * 1024 // 50MB
}: MultiFileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [pageName, setPageName] = useState<string>(''); // 新增:页面名称状态

  // 验证文件类型和大小
  const validateFile = (file: File): UploadedFile => {
    const fileName = file.name.toLowerCase();
    let type: 'html' | 'js' | 'unknown' = 'unknown';
    let status: 'pending' | 'valid' | 'invalid' = 'pending';
    let error: string | undefined;

    // 检测文件类型
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      type = 'html';
      status = 'valid';
    } else if (fileName.endsWith('.js')) {
      type = 'js';
      status = 'valid';
    } else {
      status = 'invalid';
      error = '仅支持 .html 和 .js 文件';
    }

    // 检测文件大小
    if (file.size > maxSize) {
      status = 'invalid';
      error = `文件过大 (最大 ${Math.round(maxSize / 1024 / 1024)}MB)`;
    }

    return { file, type, status, error };
  };

  // 处理文件拖拽
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(validateFile);
    const allFiles = [...uploadedFiles, ...newFiles].slice(0, maxFiles);

    setUploadedFiles(allFiles);

    // 只传递有效的文件给父组件
    const validFiles = allFiles
      .filter(f => f.status === 'valid')
      .map(f => f.file);
    onFilesChange(validFiles);
  }, [uploadedFiles, maxFiles, onFilesChange]);

  // 配置 react-dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/html': ['.html', '.htm'],
      'application/javascript': ['.js'],
      'text/javascript': ['.js']
    },
    maxFiles,
    maxSize
  });

  // 移除文件
  const removeFile = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(newFiles);

    const validFiles = newFiles
      .filter(f => f.status === 'valid')
      .map(f => f.file);
    onFilesChange(validFiles);
  };

  // 清空所有文件
  const clearAll = () => {
    setUploadedFiles([]);
    onFilesChange([]);
  };

  const validFileCount = uploadedFiles.filter(f => f.status === 'valid').length;
  const htmlCount = uploadedFiles.filter(f => f.type === 'html' && f.status === 'valid').length;
  const jsCount = uploadedFiles.filter(f => f.type === 'js' && f.status === 'valid').length;

  // 页面名称变化处理
  const handlePageNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPageName(value);
    onPageNameChange?.(value);
  };

  return (
    <div className="space-y-4">
      {/* 页面名称输入框 */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <span className="text-red-500">*</span> 页面名称
        </label>
        <input
          type="text"
          value={pageName}
          onChange={handlePageNameChange}
          placeholder="请输入页面名称，例如：集配管理（新增）"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
        />
        <p className="mt-2 text-sm text-gray-700">
          提示：页面名称将用于标识Axure原型页面，建议使用清晰明确的名称
        </p>
      </div>


      {/* 拖拽上传区 */}
      <div
        {...getRootProps()}
        className={clsx(
          "relative border-2 border-dashed rounded-2xl p-12 transition-all duration-300 cursor-pointer",
          "bg-gradient-to-br hover:shadow-xl",
          isDragActive
            ? "border-blue-500 bg-blue-50 shadow-lg scale-[1.02]"
            : uploadedFiles.length > 0
            ? "border-green-300 bg-green-50/50"
            : "border-gray-300 bg-gray-50 hover:border-purple-400 hover:bg-purple-50/50"
        )}
      >
        <input {...getInputProps()} />

        <div className="text-center">
          {/* 动画图标 */}
          <motion.div
            animate={{
              y: isDragActive ? [0, -12, 0] : [0, -8, 0],
              scale: isDragActive ? 1.1 : 1
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="flex justify-center mb-6"
          >
            {isDragActive ? (
              <Folder className="w-24 h-24 text-blue-500" />
            ) : uploadedFiles.length > 0 ? (
              <CheckCircle className="w-24 h-24 text-green-500" />
            ) : (
              <Upload className="w-24 h-24 text-purple-500" />
            )}
          </motion.div>

          {/* 主文案 */}
          <p className="text-2xl font-semibold text-gray-900 mb-3">
            {isDragActive
              ? '松开以上传文件'
              : uploadedFiles.length > 0
              ? `已选择 ${validFileCount} 个文件`
              : '拖拽文件夹或文件到此处'}
          </p>

          {/* 辅助说明 */}
          <p className="text-sm text-gray-500 mb-6">
            {isDragActive
              ? '支持批量拖拽上传'
              : '支持 HTML (.html, .htm) 和 JS (.js) 文件 | 最多 ' + maxFiles + ' 个文件'}
          </p>

          {/* 特性标签 */}
          <div className="flex items-center justify-center gap-8 text-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <FileText className="w-5 h-5 text-orange-500" />
              <span>HTML 文件</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <FileCode className="w-5 h-5 text-blue-500" />
              <span>JS 文件</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <Folder className="w-5 h-5 text-purple-500" />
              <span>文件夹拖拽</span>
            </div>
          </div>
        </div>
      </div>

      {/* 文件列表 */}
      <AnimatePresence>
        {uploadedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            {/* 头部统计 */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium text-gray-700">
                  已选择 {validFileCount} 个文件
                </span>
                <span className="text-gray-600">|</span>
                <span className="text-orange-600">{htmlCount} HTML</span>
                <span className="text-blue-600">{jsCount} JS</span>
              </div>
              <button
                onClick={clearAll}
                className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
              >
                清空全部
              </button>
            </div>

            {/* 文件列表 */}
            <div className="max-h-64 overflow-y-auto">
              {uploadedFiles.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                  className={clsx(
                    "flex items-center justify-between px-5 py-3 border-b border-gray-100",
                    "hover:bg-gray-50 transition-colors",
                    item.status === 'invalid' && "bg-red-50"
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* 文件图标 */}
                    {item.type === 'html' ? (
                      <FileText className="w-5 h-5 text-orange-500 flex-shrink-0" />
                    ) : item.type === 'js' ? (
                      <FileCode className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    )}

                    {/* 文件信息 */}
                    <div className="flex-1 min-w-0">
                      <p className={clsx(
                        "text-sm font-medium truncate",
                        item.status === 'invalid' ? "text-red-700" : "text-gray-900"
                      )}>
                        {item.file.name}
                      </p>
                      <p className="text-sm text-gray-700">
                        {(item.file.size / 1024).toFixed(1)} KB
                        {item.error && ` • ${item.error}`}
                      </p>
                    </div>

                    {/* 状态图标 */}
                    {item.status === 'valid' && (
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    )}
                    {item.status === 'invalid' && (
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    )}
                  </div>

                  {/* 删除按钮 */}
                  <button
                    onClick={() => removeFile(index)}
                    className="ml-3 p-1 rounded-lg hover:bg-gray-200 text-gray-600 hover:text-red-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 提示信息 */}
      {uploadedFiles.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-700 leading-relaxed">
            💡 <strong>提示：</strong>您可以直接拖拽整个 Axure 导出文件夹，系统会自动识别并上传所有 HTML 和 JS 文件。
            也可以手动选择多个文件上传。
          </p>
        </div>
      )}

      {/* 验证提示 */}
      {htmlCount === 0 && uploadedFiles.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-700 leading-relaxed">
            ⚠️ <strong>警告：</strong>至少需要上传一个 HTML 文件作为主文件。
          </p>
        </div>
      )}
    </div>
  );
}

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from 'antd';
import { Upload, FileText, FileCode, Folder, X, CheckCircle, AlertCircle, Eye } from 'lucide-react';
import { clsx } from 'clsx';
import { MAX_FILE_SIZE, MAX_FILES } from '../../config/upload';

interface UploadedFile {
  file: File;
  type: 'html' | 'js' | 'pdf' | 'docx' | 'doc' | 'md' | 'txt' | 'unknown';
  status: 'pending' | 'valid' | 'invalid';
  error?: string;
}

interface MultiFileUploadProps {
  onFilesChange: (files: File[]) => void;
  onPageNameChange?: (pageName: string) => void; // 新增:页面名称回调
  pageMode?: 'new' | 'modify'; // 🆕 页面模式
  onPageModeChange?: (mode: 'new' | 'modify') => void; // 🆕 页面模式回调
  onPreviewFile?: (file: File) => void; // 🆕 预览文件回调
  onClearPreview?: () => void; // 🆕 清空预览回调
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pageMode = 'new',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onPageModeChange,
  onPreviewFile,
  onClearPreview,
  maxFiles = MAX_FILES, // 使用统一配置
  maxSize = MAX_FILE_SIZE // 使用统一配置 (AI模型最佳处理大小)
}: MultiFileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [pageName, setPageName] = useState<string>(''); // 新增:页面名称状态
  const [oversizedFiles, setOversizedFiles] = useState<File[]>([]); // 超大文件列表
  const [exceededFiles, setExceededFiles] = useState<File[]>([]); // 超出数量限制的文件列表

  // 调试：监控 oversizedFiles 状态变化
  React.useEffect(() => {
    console.log('📊 oversizedFiles 状态更新:', {
      length: oversizedFiles.length,
      files: oversizedFiles.map(f => ({
        name: f.name,
        size: (f.size / 1024 / 1024).toFixed(2) + 'MB'
      })),
      shouldShowModal: oversizedFiles.length > 0
    });
  }, [oversizedFiles]);

  // 调试：监控 exceededFiles 状态变化
  React.useEffect(() => {
    console.log('📊 exceededFiles 状态更新:', {
      length: exceededFiles.length,
      files: exceededFiles.map(f => f.name),
      shouldShowModal: exceededFiles.length > 0
    });
  }, [exceededFiles]);

  // 验证文件类型和大小
  const validateFile = useCallback((file: File): UploadedFile => {
    console.log('--- validateFile 验证文件:', file.name);
    const fileName = file.name.toLowerCase();
    let type: UploadedFile['type'] = 'unknown';
    let status: 'pending' | 'valid' | 'invalid' = 'pending';
    let error: string | undefined;

    // 检测文件类型
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      type = 'html';
      status = 'valid';
    } else if (fileName.endsWith('.js')) {
      type = 'js';
      status = 'valid';
    } else if (fileName.endsWith('.pdf')) {
      type = 'pdf';
      status = 'valid';
    } else if (fileName.endsWith('.docx')) {
      type = 'docx';
      status = 'valid';
    } else if (fileName.endsWith('.doc')) {
      type = 'doc';
      status = 'valid';
    } else if (fileName.endsWith('.md') || fileName.endsWith('.markdown')) {
      type = 'md';
      status = 'valid';
    } else if (fileName.endsWith('.txt')) {
      type = 'txt';
      status = 'valid';
    } else {
      status = 'invalid';
      error = '仅支持 HTML / JS / PDF / DOC / DOCX / Markdown / TXT';
    }

    // 检测文件大小
    if (file.size > maxSize) {
      status = 'invalid';
      error = `文件过大 (最大 ${Math.round(maxSize / 1024 / 1024)}MB)`;
      console.log('    文件大小超限:', {
        size: file.size,
        maxSize: maxSize,
        sizeInMB: (file.size / 1024 / 1024).toFixed(2) + 'MB'
      });
    }

    console.log('    验证结果:', { type, status, error });
    return { file, type, status, error };
  }, [maxSize]);

  // 处理文件拖拽
  const onDrop = useCallback((acceptedFiles: File[]) => {
    console.log('=== MultiFileUpload onDrop 调试 ===');
    console.log('接收到的文件数量:', acceptedFiles.length);
    console.log('maxSize 限制:', maxSize, `(${Math.round(maxSize / 1024 / 1024)}MB)`);
    
    // 打印每个文件的详细信息
    acceptedFiles.forEach((file, index) => {
      console.log(`文件 ${index + 1}:`, {
        name: file.name,
        size: file.size,
        sizeInMB: (file.size / 1024 / 1024).toFixed(2) + 'MB',
        type: file.type,
        isOversized: file.size > maxSize
      });
    });
    
    // 检测超大文件
    const oversized = acceptedFiles.filter(file => file.size > maxSize);
    console.log('超大文件数量:', oversized.length);
    
    if (oversized.length > 0) {
      console.log('触发超大文件弹窗，文件列表:', oversized.map(f => ({
        name: f.name,
        size: (f.size / 1024 / 1024).toFixed(2) + 'MB'
      })));
      setOversizedFiles(oversized);
      return; // 阻止上传超大文件
    }
    
    console.log('文件大小检查通过，继续处理');

    const newFiles = acceptedFiles.map(validateFile);
    const currentCount = uploadedFiles.length;
    const totalCount = currentCount + newFiles.length;
    
    // 检测文件数量是否超限
    if (totalCount > maxFiles) {
      const allowedCount = maxFiles - currentCount;
      const allowedFiles = newFiles.slice(0, allowedCount);
      const rejectedFiles = newFiles.slice(allowedCount).map(f => f.file);
      
      // 显示超出数量限制的弹窗
      if (rejectedFiles.length > 0) {
        setExceededFiles(rejectedFiles);
      }
      
      // 只添加允许的文件
      const allFiles = [...uploadedFiles, ...allowedFiles];
      setUploadedFiles(allFiles);
      
      // 只传递有效的文件给父组件
      const validFiles = allFiles
        .filter(f => f.status === 'valid')
        .map(f => f.file);
      onFilesChange(validFiles);
    } else {
      // 文件数量未超限，正常处理
      const allFiles = [...uploadedFiles, ...newFiles];
      setUploadedFiles(allFiles);

      // 只传递有效的文件给父组件
      const validFiles = allFiles
        .filter(f => f.status === 'valid')
        .map(f => f.file);
      onFilesChange(validFiles);
    }
  }, [uploadedFiles, maxFiles, maxSize, onFilesChange, validateFile]);

  // 配置 react-dropzone
  // 注意：不在这里设置 maxFiles 和 maxSize，由 onDrop 中的自定义逻辑处理，以便显示友好的提示
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/html': ['.html', '.htm'],
      'application/javascript': ['.js'],
      'text/javascript': ['.js'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/markdown': ['.md', '.markdown'],
      'text/plain': ['.txt']
    }
  });

  // 移除文件
  const removeFile = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(newFiles);

    const validFiles = newFiles
      .filter(f => f.status === 'valid')
      .map(f => f.file);
    onFilesChange(validFiles);
    
    // 🆕 删除文件后清空预览
    onClearPreview?.();
  };

  // 清空所有文件
  const clearAll = () => {
    setUploadedFiles([]);
    onFilesChange([]);
    
    // 🆕 清空所有文件后清空预览
    onClearPreview?.();
  };

  const validFileCount = uploadedFiles.filter(f => f.status === 'valid').length;
  const htmlCount = uploadedFiles.filter(f => f.type === 'html' && f.status === 'valid').length;
  const jsCount = uploadedFiles.filter(f => f.type === 'js' && f.status === 'valid').length;
  const mainCount = uploadedFiles.filter(
    f => f.status === 'valid' && (f.type === 'html' || f.type === 'pdf' || f.type === 'docx' || f.type === 'doc' || f.type === 'md' || f.type === 'txt')
  ).length;

  // 页面名称变化处理
  const handlePageNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPageName(value);
    onPageNameChange?.(value);
  };

  // 调试：检查弹窗显示状态
  const shouldShowOversizedModal = oversizedFiles.length > 0;
  const shouldShowExceededModal = exceededFiles.length > 0;
  
  console.log('🎨 组件渲染状态:', {
    shouldShowOversizedModal,
    shouldShowExceededModal,
    oversizedFilesCount: oversizedFiles.length,
    exceededFilesCount: exceededFiles.length
  });

  return (
    <div className="space-y-4">
      {/* 文件大小超限弹窗 */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-lg font-semibold">文件大小超出限制</span>
          </div>
        }
        open={shouldShowOversizedModal}
        onOk={() => {
          console.log('🚪 关闭文件大小超限弹窗');
          setOversizedFiles([]);
        }}
        onCancel={() => setOversizedFiles([])}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="我知道了"
        centered
        width={600}
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            以下文件超出 <span className="font-semibold text-red-600">{Math.round(maxSize / 1024 / 1024)}MB</span> 的大小限制，无法上传：
          </p>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-60 overflow-y-auto">
            {oversizedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-red-100 last:border-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-sm text-gray-900 truncate">{file.name}</span>
                </div>
                <span className="text-sm text-red-600 font-medium ml-3">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            ))}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-700">
              <strong>💡 建议：</strong>
            </p>
            <ul className="text-sm text-blue-700 mt-2 ml-4 list-disc space-y-1">
              <li>将大文件拆分为多个小文件</li>
              <li>压缩或优化文件内容</li>
              <li>单个文件大小建议控制在 {Math.round(maxSize / 1024 / 1024)}MB 以内，以确保 AI 模型最佳处理效果</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* 文件数量超限弹窗 */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            <span className="text-lg font-semibold">文件数量超出限制</span>
          </div>
        }
        open={shouldShowExceededModal}
        onOk={() => setExceededFiles([])}
        onCancel={() => setExceededFiles([])}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="我知道了"
        centered
        width={600}
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            当前已选择 <span className="font-semibold text-gray-900">{uploadedFiles.length}</span> 个文件，
            最多支持 <span className="font-semibold text-orange-600">{maxFiles}</span> 个文件。
            以下 <span className="font-semibold text-orange-600">{exceededFiles.length}</span> 个文件无法添加：
          </p>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 max-h-60 overflow-y-auto">
            {exceededFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-orange-100 last:border-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <span className="text-sm text-gray-900 truncate">{file.name}</span>
                </div>
                <span className="text-sm text-gray-600 font-medium ml-3">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-700">
              <strong>💡 建议：</strong>
            </p>
            <ul className="text-sm text-blue-700 mt-2 ml-4 list-disc space-y-1">
              <li>删除部分已选择的文件后再添加新文件</li>
              <li>分批上传文件，每次不超过 {maxFiles} 个</li>
              <li>当前限制为最多 {maxFiles} 个文件，以确保系统性能和 AI 处理效果</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* 页面名称输入框 */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <span className="text-red-500">*</span> 页面名称
        </label>
        <input
          type="text"
          value={pageName}
          onChange={handlePageNameChange}
          placeholder="请输入页面名称，例如：登录页面（新增）"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
        />
        <p className="mt-2 text-sm text-gray-700">
          提示：页面名称将用于标识产品需求文档页面，建议使用清晰明确的名称
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
          <p className="text-xl font-semibold text-gray-900 mb-3">
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
              : '支持 HTML / JS / PDF / DOC / DOCX / Markdown / TXT | 最多 ' + maxFiles + ' 个文件'}
          </p>

          {/* 特性标签 */}
          <div className="flex items-center justify-center gap-8 text-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <FileText className="w-5 h-5 text-orange-500" />
              <span>HTML / DOC / DOCX / PDF / TXT / MD</span>
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
                  <div className="flex items-center justify-between gap-3 flex-1 min-w-0">
                    {/* 文件图标 */}
                    {item.type === 'html' ? (
                      <FileText className="w-5 h-5 text-orange-500 flex-shrink-0" />
                    ) : item.type === 'js' ? (
                      <FileCode className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    ) : item.type === 'pdf' ? (
                      <FileText className="w-5 h-5 text-rose-500 flex-shrink-0" />
                    ) : item.type === 'docx' || item.type === 'doc' ? (
                      <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    ) : item.type === 'md' || item.type === 'txt' ? (
                      <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
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
                  </div>
                  <div className="flex items-center gap-3">
                  {/* 状态图标 */}
                  {item.status === 'valid' && (
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    )}
                    {item.status === 'invalid' && (
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    )}
                  {/* 🆕 预览按钮（仅对主文件显示） */}
                  {item.status === 'valid' && 
                   (item.type === 'html' || item.type === 'pdf' || item.type === 'docx' || item.type === 'doc' || item.type === 'md' || item.type === 'txt') && 
                   onPreviewFile && (
                    // <button
                    //   onClick={(e) => {
                    //     e.stopPropagation();
                    //     onPreviewFile(item.file);
                    //   }}
                    //   className="ml-3 px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 
                    //              hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1"
                    //   title="预览文件内容"
                    // >
                    //   <FileText className="w-3.5 h-3.5" />
                    //   预览
                    // </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreviewFile(item.file);
                      }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-all"
                      title="预览文件内容"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  )}
                  {/* 删除按钮 */}
                  <button
                    onClick={() => removeFile(index)}
                    className="rounded-lg hover:bg-gray-200 text-gray-600 hover:text-red-600 transition-colors"
                    title="删除文件"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  </div>
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
            💡 <strong>提示：</strong>您可以直接拖拽整个 Axure 导出文件夹（自动识别 HTML/JS），也可以上传 PDF / DOC / DOCX / Markdown / TXT 等需求文档。
            支持手动选择或批量拖拽上传。
          </p>
        </div>
      )}

      {/* 验证提示 */}
      {uploadedFiles.length > 0 && mainCount === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-700 leading-relaxed">
            ⚠️ <strong>提示：</strong>建议至少包含一个主文件（HTML / PDF / DOC / DOCX / Markdown / TXT），JS 文件仅作为辅助。
          </p>
        </div>
      )}
    </div>
  );
}

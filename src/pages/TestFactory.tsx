import React from 'react';

export function TestFactory() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">测试工厂</h1>
        <p className="text-lg text-gray-600 mb-8">
          一键上传 XMind 用例，AI 智能优化，开启高效测试新纪元。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* XMind Upload Card */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">第一步：上传 XMind 测试用例</h2>
            <p className="text-gray-500 mb-4">
              请上传您的 .xmind 格式的测试用例文件。系统将自动解析并展示用例。
            </p>
            <div className="mt-4 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-600" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>上传文件</span>
                    <input id="file-upload" name="file-upload" type="file" className="sr-only" />
                  </label>
                  <p className="pl-1">或拖拽到这里</p>
                </div>
                <p className="text-sm text-gray-700">仅支持 .xmind 文件</p>
              </div>
            </div>
          </div>

          {/* Requirement Upload Card */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">第二步 (可选): 上传需求文档</h2>
            <p className="text-gray-500 mb-4">
              上传需求文档 (如 .md, .docx) 可帮助 AI 更精准地优化您的测试用例。
            </p>
            <div className="mt-4 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                 <svg className="mx-auto h-12 w-12 text-gray-600" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M9 17v-7a4 4 0 014-4h11l5 5h5a4 4 0 014 4v18a4 4 0 01-4 4H13a4 4 0 01-4-4v-3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label htmlFor="req-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>上传文件</span>
                    <input id="req-upload" name="req-upload" type="file" className="sr-only" />
                  </label>
                  <p className="pl-1">或拖拽到这里</p>
                </div>
                <p className="text-sm text-gray-700">支持 .md, .txt, .docx</p>
              </div>
            </div>
          </div>
        </div>

        {/* Parsed Test Cases Area */}
        <div className="mt-8 bg-white p-6 rounded-xl shadow-md border border-gray-200">
           <h2 className="text-xl font-semibold text-gray-800 mb-4">第三步：审查与执行</h2>
           <p className="text-gray-500 mb-4">
            在这里审查解析后的测试用例，点击 "AI 润色" 进行智能优化，最后 "一键执行"。
           </p>
           <div className="mt-4 p-4 border rounded-lg bg-gray-50 text-center text-gray-500">
             请先上传 XMind 文件
           </div>
        </div>
      </div>
    </div>
  );
} 
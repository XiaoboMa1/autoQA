import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, Home, RefreshCw, ArrowLeft } from 'lucide-react';

interface ErrorPageProps {
  statusCode?: number;
  title?: string;
  message?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
  showRefreshButton?: boolean;
}

/**
 * 通用错误页面组件
 * 支持自定义错误信息和操作按钮
 */
export const ErrorPage: React.FC<ErrorPageProps> = ({
  statusCode = 500,
  title,
  message,
  showBackButton = true,
  showHomeButton = true,
  showRefreshButton = true
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  // 从 location.state 中获取错误信息
  const errorState = location.state as { error?: string; details?: string } | null;

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  // 根据状态码设置默认文案
  const getDefaultContent = () => {
    switch (statusCode) {
      case 404:
        return {
          title: '页面未找到',
          message: '抱歉,您访问的页面不存在或已被移除',
          icon: '🔍'
        };
      case 403:
        return {
          title: '访问被拒绝',
          message: '您没有权限访问此页面',
          icon: '🚫'
        };
      case 500:
        return {
          title: '服务器错误',
          message: '服务器遇到了一个错误,请稍后重试',
          icon: '⚠️'
        };
      default:
        return {
          title: '出错了',
          message: '发生了一个未知错误',
          icon: '❌'
        };
    }
  };

  const defaultContent = getDefaultContent();
  const displayTitle = title || errorState?.error || defaultContent.title;
  const displayMessage = message || errorState?.details || defaultContent.message;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* 错误卡片 */}
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 text-center">
          {/* 图标和状态码 */}
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-red-100 rounded-full mb-4">
              <AlertTriangle className="w-12 h-12 text-red-600" />
            </div>
            <div className="text-6xl font-bold text-gray-300 mb-2">
              {statusCode}
            </div>
          </div>

          {/* 标题 */}
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {displayTitle}
          </h1>

          {/* 错误描述 */}
          <p className="text-lg text-gray-600 mb-8 leading-relaxed">
            {displayMessage}
          </p>

          {/* 详细错误信息(仅在开发环境显示) */}
          {process.env.NODE_ENV === 'development' && errorState?.details && (
            <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-left">
              <div className="text-sm font-semibold text-red-800 mb-2">
                详细错误信息 (仅开发环境可见):
              </div>
              <pre className="text-sm text-red-600 font-medium whitespace-pre-wrap font-mono">
                {errorState.details}
              </pre>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {showBackButton && (
              <button
                onClick={handleGoBack}
                className="inline-flex items-center px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-md hover:shadow-lg"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                返回上一页
              </button>
            )}

            {showHomeButton && (
              <button
                onClick={handleGoHome}
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
              >
                <Home className="w-5 h-5 mr-2" />
                回到首页
              </button>
            )}

            {showRefreshButton && (
              <button
                onClick={handleRefresh}
                className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-md hover:shadow-lg"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                刷新页面
              </button>
            )}
          </div>

          {/* 帮助信息 */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              如果问题持续存在,请联系系统管理员或
              <a
                href="mailto:support@testflow.com"
                className="text-blue-600 hover:text-blue-700 underline ml-1"
              >
                技术支持
              </a>
            </p>
          </div>
        </div>

        {/* 额外提示 */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>错误代码: {statusCode} | {new Date().toLocaleString('zh-CN')}</p>
        </div>
      </div>
    </div>
  );
};

/**
 * 404 页面
 */
export const NotFoundPage: React.FC = () => (
  <ErrorPage
    statusCode={404}
    title="页面未找到"
    message="抱歉,您访问的页面不存在或已被移除。请检查URL是否正确,或返回首页继续浏览。"
    showRefreshButton={false}
  />
);

/**
 * 500 服务器错误页面
 */
export const ServerErrorPage: React.FC = () => (
  <ErrorPage
    statusCode={500}
    title="服务器错误"
    message="服务器遇到了一个错误,无法完成您的请求。我们的技术团队已经收到通知,正在处理中。请稍后重试。"
  />
);

/**
 * 403 权限错误页面
 */
export const ForbiddenPage: React.FC = () => (
  <ErrorPage
    statusCode={403}
    title="访问被拒绝"
    message="您没有权限访问此页面。如果您认为这是一个错误,请联系系统管理员。"
    showRefreshButton={false}
  />
);

export default ErrorPage;

import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary捕获到错误:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // 可以渲染任何自定义的回退UI
      return this.props.fallback || (
        <div className="p-6 bg-red-50 border border-red-100 rounded-lg my-4">
          <h3 className="text-lg font-medium text-red-800 mb-2">渲染错误</h3>
          <p className="text-red-600 mb-4">抱歉，组件渲染时发生了错误。</p>
          <details className="text-sm text-gray-700">
            <summary>错误详情</summary>
            <pre className="mt-2 p-2 bg-gray-100 rounded overflow-x-auto">
              {this.state.error?.toString()}
            </pre>
          </details>
          <button 
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
} 
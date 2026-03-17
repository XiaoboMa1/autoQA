import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Send,
  Sparkles,
  Code,
  FileText,
  Lightbulb,
  Copy,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Loader
} from 'lucide-react';

interface Message {
  id: number;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  code?: string;
  suggestions?: string[];
}

interface TestCaseGeneration {
  title: string;
  description: string;
  code: string;
  explanation: string;
}

const examplePrompts = [
  '生成一个使用Playwright MCP测试用户登录功能的完整测试用例',
  '为电商网站创建包含拖拽操作和文件上传的Playwright MCP测试',
  '使用Playwright MCP测试响应式菜单的展开/收起功能',
  '创建Playwright MCP测试验证表单验证错误提示的显示',
  '生成Playwright MCP多标签页操作和页面跳转的测试场景'
];

const mockGeneratedTestCase: TestCaseGeneration = {
  title: 'Playwright MCP用户登录功能测试',
  description: '使用Playwright MCP验证用户登录流程，包括文本定位器、角色选择器和断言验证。',
  code: `# Playwright MCP用户登录功能测试
name: Playwright MCP登录流程测试
description: 测试用户登录的完整流程(使用Playwright MCP推荐选择器)
tags: [登录, 认证, Playwright MCP, 核心功能]
priority: high

steps:
  - name: 打开登录页面
    action: navigate
    url: "https://example.com/login"
    
  - name: 输入用户邮箱
    action: fill
    selector: 'role=textbox[name="email"]'
    value: "test@example.com"
    
  - name: 输入密码
    action: fill
    selector: 'input[type="password"]'
    value: "password123"
    
  - name: 点击登录按钮
    action: click
    selector: 'button:has-text("登录")'
    
  - name: 等待页面加载
    action: wait
    timeout: 3000
    
  - name: 验证登录成功 - 仪表板可见
    action: expect
    selector: 'role=main >> :has-text("仪表板")'
    condition: visible
    
  - name: 验证用户信息显示
    action: expect
    selector: ':has-text("test@example.com")'
    condition: contains_text
    text: "test@example.com"
    
  - name: 截图保存登录状态
    action: screenshot
    filename: "login_success.png"

assertions:
  - 页面标题包含"仪表板"
  - URL包含"/dashboard"
  - 用户头像使用role=img选择器验证
  - 导航菜单使用text=定位器检查可见性`,
  explanation: '这个Playwright MCP测试用例展示了推荐的选择器策略：使用role=定位器用于语义元素，:has-text()用于文本匹配，以及组合选择器用于精确定位。测试涵盖了登录流程的完整验证，包括状态检查和截图保存。'
};

export function LLMAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      type: 'assistant',
      content: '你好！我是你的AI测试助手。我可以帮助你生成测试用例、分析测试结果、修复测试脚本等。请告诉我你需要什么帮助？',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedTestCase, setGeneratedTestCase] = useState<TestCaseGeneration | null>(null);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      const assistantMessage: Message = {
        id: Date.now() + 1,
        type: 'assistant',
        content: '我已经为你生成了一个测试用例。这个测试用例涵盖了用户登录的完整流程，包括输入验证、成功登录和错误处理。你可以查看下面的代码并根据需要进行调整。',
        timestamp: new Date(),
        suggestions: [
          '添加更多边界条件测试',
          '包含密码错误的负面测试',
          '测试记住我功能',
          '添加多因素认证测试'
        ]
      };

      setMessages(prev => [...prev, assistantMessage]);
      setGeneratedTestCase(mockGeneratedTestCase);
      setIsLoading(false);
    }, 2000);
  };

  const handleExamplePrompt = (prompt: string) => {
    setInputMessage(prompt);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="h-12 w-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center">
          <Bot className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI 测试助手</h2>
          <p className="text-gray-600">使用人工智能生成、优化和分析测试用例</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Interface */}
        <div className="lg:col-span-2 space-y-6">
          {/* Example Prompts */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Lightbulb className="h-5 w-5 mr-2 text-yellow-500" />
              示例提示
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {examplePrompts.map((prompt, index) => (
                <motion.button
                  key={index}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleExamplePrompt(prompt)}
                  className="text-left p-3 bg-gray-50 rounded-lg hover:bg-blue-50 hover:border-blue-200 border border-gray-200 transition-colors"
                >
                  <p className="text-sm text-gray-700">{prompt}</p>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Chat Messages */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="h-96 overflow-y-auto p-6 space-y-4">
              <AnimatePresence>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.type === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}>
                      <p className="text-sm">{message.content}</p>
                      {message.suggestions && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium opacity-80">建议:</p>
                          {message.suggestions.map((suggestion, index) => (
                            <div key={index} className="text-xs opacity-70 flex items-center">
                              <Sparkles className="h-3 w-3 mr-1" />
                              {suggestion}
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs opacity-60 mt-2">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Loader className="h-4 w-4 animate-spin" />
                      <span className="text-sm">AI 正在思考...</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 p-4">
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="描述你需要的测试用例..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || isLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="h-5 w-5" />
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {/* Generated Test Case */}
        <div className="space-y-6">
          {/* AI Features */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">AI 功能</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-900">智能生成</p>
                  <p className="text-sm text-green-600">从自然语言生成测试用例</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
                <Code className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-900">脚本修复</p>
                  <p className="text-xs text-blue-700">自动修复失效的测试脚本</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 bg-purple-50 rounded-lg">
                <FileText className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm font-medium text-purple-900">结果分析</p>
                  <p className="text-xs text-purple-700">智能分析测试失败原因</p>
                </div>
              </div>
            </div>
          </div>

          {/* Generated Test Case Display */}
          {generatedTestCase && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">生成的测试用例</h3>
                <div className="flex space-x-2">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => copyToClipboard(generatedTestCase.code)}
                    className="p-2 text-gray-600 hover:text-blue-600 transition-colors"
                    title="复制代码"
                  >
                    <Copy className="h-4 w-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="p-2 text-gray-600 hover:text-green-600 transition-colors"
                    title="下载文件"
                  >
                    <Download className="h-4 w-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="p-2 text-gray-600 hover:text-purple-600 transition-colors"
                    title="重新生成"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </motion.button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">{generatedTestCase.title}</h4>
                  <p className="text-sm text-gray-600">{generatedTestCase.description}</p>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">YAML 配置</h4>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
                      {generatedTestCase.code}
                    </pre>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-blue-900 mb-1">说明</h4>
                      <p className="text-sm text-blue-800">{generatedTestCase.explanation}</p>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    保存为测试用例
                  </button>
                  <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                    立即执行
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
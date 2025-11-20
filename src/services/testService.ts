import type { TestCase, TestRun, RunTestRequest, RunTestResponse, TestSuite, TestSuiteRun } from '../types/test';

// 🔥 扩展WebSocket消息类型
export interface WebSocketMessage {
  type: 'test_update' | 'test_complete' | 'test_error' | 'log' | 'suiteUpdate';
  runId?: string;
  suiteRunId?: string;
  data?: any;
  suiteRun?: any;
}

const API_BASE_URL = `http://${window.location.hostname}:3001/api`;
const WS_URL = `ws://${window.location.hostname}:3001`;
const TOKEN_KEY = 'authToken';

export class TestService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, (message: WebSocketMessage) => void> = new Map();

  // 🔥 获取认证请求头
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // 初始化 WebSocket 连接
  initializeWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 如果已有连接且开着，不需要重新连接
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          console.log('🔌 WebSocket 已连接，无需重连');
          resolve();
          return;
        }
        
        // 关闭旧连接
        if (this.ws) {
          try {
            console.log('🔌 关闭旧的 WebSocket 连接');
            this.ws.close();
          } catch (e) {
            console.log('关闭旧WebSocket连接时出错，忽略:', e);
          }
          this.ws = null;
        }
        
        console.log('🔌 正在创建新的 WebSocket 连接...');
        
        // 创建重连计数器，避免无限重试
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        let reconnectTimeout: any = null;
        
        const connectWebSocket = () => {
          try {
            if (reconnectAttempts >= maxReconnectAttempts) {
              console.error(`🔌 达到最大重连次数(${maxReconnectAttempts})，放弃重连`);
              reject(new Error('达到最大重连次数'));
              return;
            }
            
            reconnectAttempts++;
            console.log(`🔌 WebSocket连接尝试 ${reconnectAttempts}/${maxReconnectAttempts}...`);
            
            this.ws = new WebSocket(WS_URL);
            
            this.ws.onopen = () => {
              console.log('🔌 WebSocket 连接已建立');
              reconnectAttempts = 0; // 重置重连计数
              
              // 设置心跳检测
              this.setupHeartbeat();
              resolve();
            };
            
            this.ws.onmessage = (event) => {
              try {
                // 处理心跳响应
                if (event.data === 'pong') {
                  console.log('💓 收到服务器心跳响应');
                  return;
                }
                
                // 尝试解析JSON消息
                let message;
                try {
                  message = JSON.parse(event.data);
                } catch (parseError) {
                  console.warn('WebSocket消息解析失败，收到非JSON数据:', event.data);
                  return;
                }
                
                // 通知监听器
                this.notifyListeners(message);
              } catch (error) {
                console.error('WebSocket 消息处理错误:', error);
              }
            };
            
            this.ws.onclose = (event) => {
              console.log(`❌ WebSocket 连接已关闭 (code=${event.code}, reason=${event.reason})`);
              
              // 清除心跳
              this.clearHeartbeat();
              
              // 自动重连，但避免无限重试
              if (reconnectAttempts < maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000);
                console.log(`♻️ ${delay}ms后尝试第${reconnectAttempts + 1}次重连...`);
                
                // 清除可能存在的重连定时器
                if (reconnectTimeout) {
                  clearTimeout(reconnectTimeout);
                }
                
                reconnectTimeout = setTimeout(connectWebSocket, delay);
              } else {
                console.error('❌ 达到最大重连次数，放弃重连');
                reject(new Error('达到最大重连次数'));
              }
            };
            
            this.ws.onerror = (error) => {
              console.error('WebSocket 错误:', error);
              // 不在这里reject，让onclose处理重连
            };
          } catch (error) {
            console.error('创建WebSocket连接时出错:', error);
            reject(error);
          }
        };
        
        // 开始连接
        connectWebSocket();
      } catch (error) {
        console.error('初始化WebSocket时发生未预期的错误:', error);
        reject(error);
      }
    });
  }
  
  // 发送心跳包 - 修复内存泄漏问题
  private setupHeartbeat() {
    // 清除现有心跳
    this.clearHeartbeat();
    
    // 设置新的心跳间隔 (每30秒)
    const heartbeatInterval = setInterval(() => {
      try {
        // 🚀 修复：添加额外的连接状态检查
        if (!this.ws) {
          console.log('💔 WebSocket实例不存在，清理心跳定时器');
          this.clearHeartbeat();
          return;
        }
        
        if (this.ws.readyState === WebSocket.OPEN) {
          console.log('💓 发送心跳包...');
          this.ws.send(JSON.stringify({type: 'ping', timestamp: Date.now()}));
        } else if (this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
          console.log('💔 WebSocket连接已关闭或正在关闭，清理心跳定时器');
          this.clearHeartbeat();
          // 🚀 修复：只在必要时尝试重连，避免无限重连
          if (this.ws.readyState === WebSocket.CLOSED) {
            this.initializeWebSocket().catch(error => {
              console.error('重连WebSocket失败:', error);
            });
          }
        }
      } catch (error) {
        console.error('💔 心跳检测出错:', error);
        this.clearHeartbeat();
      }
    }, 30000);
    
    // 存储心跳定时器ID
    (this as any).heartbeatIntervalId = heartbeatInterval;
  }
  
  // 清除心跳
  private clearHeartbeat() {
    if ((this as any).heartbeatIntervalId) {
      clearInterval((this as any).heartbeatIntervalId);
      (this as any).heartbeatIntervalId = null;
    }
  }

  // 添加消息监听器
  addMessageListener(id: string, callback: (message: WebSocketMessage) => void): void {
    this.listeners.set(id, callback);
  }

  // 移除消息监听器
  removeMessageListener(id: string): void {
    this.listeners.delete(id);
  }

  // 通知所有监听器
  private notifyListeners(message: WebSocketMessage): void {
    try {
      // 标准化消息格式
      const standardizedMessage = { ...message };
      
      // 处理suiteUpdate消息
      if (message.type === 'suiteUpdate') {
        // 确保data字段存在
        if (!standardizedMessage.data && standardizedMessage.suiteRun) {
          standardizedMessage.data = standardizedMessage.suiteRun;
        }
      }
      
      // 调用所有监听器
      this.listeners.forEach(callback => {
        try {
          callback(standardizedMessage);
        } catch (error) {
          console.error('WebSocket消息监听器回调错误:', error);
        }
      });
    } catch (error) {
      console.error('通知监听器时出错:', error);
    }
  }

  // 获取所有测试用例（旧方法，保持兼容性）
  async getTestCases(): Promise<TestCase[]> {
    try {
      console.log('🔄 [testService] 发送测试用例请求...');
      // 使用分页API获取所有数据
      const result = await this.getTestCasesPaginated({
        page: 1,
        pageSize: 1000, // 获取大量数据以保持向后兼容
        search: '',
        tag: '',
        priority: '',
        status: '',
        system: ''
      });

      console.log('✅ [testService] 返回测试用例数量:', result.data?.length || 0);
      return result.data;
    } catch (error) {
      console.error('❌ [testService] 获取测试用例失败:', error);
      throw error;
    }
  }

  // 🔥 新增：根据ID获取单个测试用例
  async getTestCaseById(id: number): Promise<TestCase> {
    try {
      console.log(`🔄 [testService] 获取测试用例 ID: ${id}`);
      const response = await fetch(`${API_BASE_URL}/tests/cases/${id}`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`获取测试用例失败: ${response.statusText}`);
      }

      const testCase = await response.json();
      console.log('✅ [testService] 成功获取测试用例:', testCase.name);
      return testCase;
    } catch (error) {
      console.error(`❌ [testService] 获取测试用例失败 (ID: ${id}):`, error);
      throw error;
    }
  }

  // 🔥 新增：分页查询测试用例
  async getTestCasesPaginated(params: {
    page: number;
    pageSize: number;
    search?: string;
    tag?: string;
    priority?: string;
    status?: string;
    system?: string;
  }): Promise<{
    data: TestCase[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      console.log('🔄 [testService] 发送分页测试用例请求:', params);

      // 构建查询参数
      const queryParams = new URLSearchParams({
        page: params.page.toString(),
        pageSize: params.pageSize.toString(),
      });

      // 添加可选的过滤参数
      if (params.search && params.search.trim()) {
        queryParams.append('search', params.search);
      }
      if (params.tag && params.tag.trim()) {
        queryParams.append('tag', params.tag);
      }
      if (params.priority && params.priority.trim()) {
        queryParams.append('priority', params.priority);
      }
      if (params.status && params.status.trim()) {
        queryParams.append('status', params.status);
      }
      if (params.system && params.system.trim()) {
        queryParams.append('system', params.system);
      }

      // 添加时间戳防止缓存
      queryParams.append('t', new Date().getTime().toString());

      const response = await fetch(`${API_BASE_URL}/tests/cases?${queryParams.toString()}`, {
        headers: this.getAuthHeaders()
      });

      console.log('📡 [testService] 分页API响应状态:', response.status);
      const data = await response.json();
      console.log('📄 [testService] 分页API返回数据:', data);

      if (!data.success) {
        throw new Error(data.error || '获取测试用例失败');
      }

      console.log('✅ [testService] 返回分页数据:', {
        count: data.data?.length || 0,
        total: data.pagination?.total || 0,
        page: data.pagination?.page || 1
      });

      return {
        data: data.data || [],
        pagination: data.pagination || {
          page: params.page,
          pageSize: params.pageSize,
          total: 0,
          totalPages: 0
        }
      };
    } catch (error) {
      console.error('❌ [testService] 获取分页测试用例失败:', error);
      throw error;
    }
  }

  // 创建测试用例
  async createTestCase(caseData: Partial<TestCase>): Promise<TestCase> {
    try {
      const response = await fetch(`${API_BASE_URL}/tests/cases`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(caseData)
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || '创建测试用例失败');
      }
      
      return data.data;
    } catch (error) {
      console.error('创建测试用例失败:', error);
      throw error;
    }
  }

  // 更新测试用例
  async updateTestCase(id: number, caseData: Partial<TestCase>): Promise<TestCase> {
    try {
      const response = await fetch(`${API_BASE_URL}/tests/cases/${id}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(caseData)
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '更新测试用例失败');
      }

      return data.data;
    } catch (error) {
      console.error('更新测试用例失败:', error);
      throw error;
    }
  }

  // 删除测试用例
  async deleteTestCase(id: number): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/tests/cases/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '删除测试用例失败');
      }
    } catch (error) {
      console.error('删除测试用例失败:', error);
      throw error;
    }
  }

  // 运行单个测试用例
  async runTestCase(caseId: number): Promise<{runId: string}> {
    try {
      const response = await fetch(`${API_BASE_URL}/tests/cases/execute`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ caseId })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '执行测试用例失败');
      }

      return { runId: data.runId };
    } catch (error) {
      console.error('执行测试用例失败:', error);
      throw error;
    }
  }

  // 执行测试用例
  async runTest(request: RunTestRequest): Promise<RunTestResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/tests/execute`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(request)
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '执行测试失败');
      }

      return data;
    } catch (error) {
      console.error('执行测试失败:', error);
      throw error;
    }
  }

  // 获取测试运行状态
  async getTestRun(runId: string): Promise<TestRun> {
    try {
      const response = await fetch(`${API_BASE_URL}/tests/runs/${runId}`, {
        headers: this.getAuthHeaders()
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '获取测试运行状态失败');
      }

      return data.data;
    } catch (error) {
      console.error('获取测试运行状态失败:', error);
      throw error;
    }
  }

  // 获取所有测试运行
  async getAllTestRuns(): Promise<TestRun[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/tests/runs`, {
        headers: this.getAuthHeaders()
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '获取测试运行列表失败');
      }

      return data.data;
    } catch (error) {
      console.error('获取测试运行列表失败:', error);
      throw error;
    }
  }

  // 取消测试
  async cancelTest(runId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/tests/runs/${runId}/cancel`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '取消测试失败');
      }
    } catch (error) {
      console.error('取消测试失败:', error);
      throw error;
    }
  }

  // 获取所有测试套件
  async getTestSuites(): Promise<TestSuite[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/suites`, {
        headers: this.getAuthHeaders()
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '获取测试套件失败');
      }

      return data.data;
    } catch (error) {
      console.error('获取测试套件失败:', error);
      throw error;
    }
  }
  
  // 创建测试套件
  async createTestSuite(suiteData: Partial<TestSuite>): Promise<TestSuite> {
    try {
      const response = await fetch(`${API_BASE_URL}/suites`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(suiteData)
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '创建测试套件失败');
      }

      return data.data;
    } catch (error) {
      console.error('创建测试套件失败:', error);
      throw error;
    }
  }

  // 更新测试套件
  async updateTestSuite(id: number, suiteData: Partial<TestSuite>): Promise<TestSuite> {
    try {
      const response = await fetch(`${API_BASE_URL}/suites/${id}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(suiteData)
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '更新测试套件失败');
      }

      return data.data;
    } catch (error) {
      console.error('更新测试套件失败:', error);
      throw error;
    }
  }

  // 删除测试套件
  async deleteTestSuite(id: number): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/suites/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '删除测试套件失败');
      }
    } catch (error) {
      console.error('删除测试套件失败:', error);
      throw error;
    }
  }

  // 执行测试套件
  async runTestSuite(suiteId: number, options: {
    environment?: string;
    executionMode?: 'standard' | 'interactive';
    concurrency?: number;
    continueOnFailure?: boolean;
  } = {}): Promise<{runId: string}> {
    try {
      const response = await fetch(`${API_BASE_URL}/suites/execute`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          suiteId,
          ...options
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '执行测试套件失败');
      }

      return { runId: data.runId };
    } catch (error) {
      console.error('执行测试套件失败:', error);
      throw error;
    }
  }

  // 获取测试套件运行状态
  async getSuiteRun(suiteRunId: string): Promise<TestSuiteRun> {
    try {
      const response = await fetch(`${API_BASE_URL}/suites/runs/${suiteRunId}`, {
        headers: this.getAuthHeaders()
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '获取测试套件运行状态失败');
      }

      return data.data;
    } catch (error) {
      console.error('获取测试套件运行状态失败:', error);
      throw error;
    }
  }

  // 获取所有测试套件运行
  async getAllSuiteRuns(): Promise<TestSuiteRun[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/suites/runs`, {
        headers: this.getAuthHeaders()
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '获取测试套件运行列表失败');
      }

      return data.data;
    } catch (error) {
      console.error('获取测试套件运行列表失败:', error);
      throw error;
    }
  }

  // 取消测试套件运行
  async cancelSuiteRun(suiteRunId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/suites/runs/${suiteRunId}/cancel`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '取消测试套件运行失败');
      }
    } catch (error) {
      console.error('取消测试套件运行失败:', error);
      throw error;
    }
  }

  // 新增：获取测试报告详情
  async getTestReport(runId: string): Promise<any> {
    try {
      const response = await fetch(`${API_BASE_URL}/reports/${runId}`, {
        headers: this.getAuthHeaders()
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '获取测试报告详情失败');
      }

      return data.data;
    } catch (error) {
      console.error('获取测试报告详情失败:', error);
      throw error;
    }
  }

  // 检查WebSocket是否连接
  isWebSocketConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // 关闭 WebSocket 连接 - 修复清理问题
  closeWebSocket(): void {
    console.log('🔌 正在关闭WebSocket连接...');
    
    // 清理心跳定时器
    this.clearHeartbeat();
    
    // 清理消息监听器
    this.listeners.clear();
    
    if (this.ws) {
      try {
        // 🚀 修复：优雅关闭连接
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'Normal closure');
        }
      } catch (error) {
        console.error('关闭WebSocket时出错:', error);
      } finally {
        this.ws = null;
        console.log('🔌 WebSocket连接已清理');
      }
    }
  }

  // 🚀 新增：强制清理所有资源
  destroy(): void {
    console.log('🧹 强制清理TestService所有资源...');
    this.closeWebSocket();

    // 移除所有事件监听器
    this.listeners.clear();

    console.log('✅ TestService资源清理完成');
  }

  // 🔥 批量删除测试运行记录
  async batchDeleteTestRuns(runIds: string[]): Promise<{ deletedCount: number }> {
    try {
      console.log(`🗑️ 批量删除测试运行，数量: ${runIds.length}`);

      const response = await fetch(`${API_BASE_URL}/tests/runs/batch-delete`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ runIds }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `批量删除失败: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ 批量删除成功，删除 ${result.data.deletedCount} 条记录`);

      return result.data;
    } catch (error: any) {
      console.error('批量删除测试运行失败:', error);
      throw error;
    }
  }
}

// 单例模式
export const testService = new TestService(); 
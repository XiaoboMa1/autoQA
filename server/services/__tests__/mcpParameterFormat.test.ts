import { TestExecutionService } from '../testExecution';
import { WebSocketManager } from '../websocket';
import { AITestParser } from '../aiParser';
import { PlaywrightMcpClient } from '../mcpClient';
import { MCPToolMapper } from '../../utils/mcpToolMapper';
import { WebSocketServer } from 'ws';

// Mock dependencies
jest.mock('../websocket');
jest.mock('../aiParser');
jest.mock('../mcpClient');
jest.mock('../../utils/mcpToolMapper');
jest.mock('ws');

describe('MCP Parameter Format Tests', () => {
  let testExecutionService: TestExecutionService;
  let mockWsManager: jest.Mocked<WebSocketManager>;
  let mockAiParser: jest.Mocked<AITestParser>;
  let mockMcpClient: jest.Mocked<PlaywrightMcpClient>;

  beforeEach(() => {
    const mockWss = new WebSocketServer({ port: 8080 }) as jest.Mocked<WebSocketServer>;
    mockWsManager = new WebSocketManager(mockWss) as jest.Mocked<WebSocketManager>;
    mockAiParser = new AITestParser(mockMcpClient) as jest.Mocked<AITestParser>;
    mockMcpClient = new PlaywrightMcpClient() as jest.Mocked<PlaywrightMcpClient>;
    
    testExecutionService = new TestExecutionService(mockWsManager, mockAiParser, mockMcpClient);
  });

  describe('Parameter Format Conversion', () => {
    it('should convert fill parameters correctly', () => {
      // 测试填充操作的参数转换
      const originalParams = { selector: 'input[name="username"]', value: 'admin' };
      const elementRef = { ref: 'e18', text: 'Username' };
      
      const result = testExecutionService['convertToMCPFormat']('fill', originalParams, elementRef);
      
      expect(result).toEqual({ ref: 'e18', text: 'admin' });
    });

    it('should convert click parameters correctly', () => {
      // 测试点击操作的参数转换
      const originalParams = { selector: 'button[type="submit"]' };
      const elementRef = { ref: 'e19', text: 'Login Button' };
      
      const result = testExecutionService['convertToMCPFormat']('click', originalParams, elementRef);
      
      expect(result).toEqual({ ref: 'e19' });
    });

    it('should convert type parameters correctly', () => {
      // 测试输入操作的参数转换
      const originalParams = { selector: 'input[type="password"]', value: '123456' };
      const elementRef = { ref: 'e20', text: 'Password Field' };
      
      const result = testExecutionService['convertToMCPFormat']('type', originalParams, elementRef);
      
      expect(result).toEqual({ ref: 'e20', text: '123456' });
    });

    it('should convert wait parameters correctly', () => {
      // 测试等待操作的参数转换
      const originalParams = { timeout: 5000 };
      
      const result = testExecutionService['convertToMCPFormat']('wait', originalParams);
      
      expect(result).toEqual({ timeout: 5000 });
    });

    it('should handle missing element reference gracefully', () => {
      // 测试缺少元素引用时的处理
      const originalParams = { selector: 'input[name="username"]', value: 'admin' };
      
      const result = testExecutionService['convertToMCPFormat']('fill', originalParams);
      
      expect(result).toEqual({ ref: 'input[name="username"]', text: 'admin' });
    });
  });

  describe('MCP Parameter Validation', () => {
    it('should validate browser_click parameters correctly', () => {
      const validParams = { ref: 'e18' };
      const result = testExecutionService['validateMCPParameters']('browser_click', validParams);
      expect(result).toBe(true);
    });

    it('should reject browser_click with missing ref parameter', () => {
      const invalidParams = { selector: 'button' };
      const result = testExecutionService['validateMCPParameters']('browser_click', invalidParams);
      expect(result).toBe(false);
    });

    it('should validate browser_type parameters correctly', () => {
      const validParams = { ref: 'e18', text: 'admin' };
      const result = testExecutionService['validateMCPParameters']('browser_type', validParams);
      expect(result).toBe(true);
    });

    it('should reject browser_type with missing ref parameter', () => {
      const invalidParams = { selector: 'input', text: 'admin' };
      const result = testExecutionService['validateMCPParameters']('browser_type', invalidParams);
      expect(result).toBe(false);
    });

    it('should reject browser_type with empty text parameter', () => {
      const invalidParams = { ref: 'e18', text: '' };
      const result = testExecutionService['validateMCPParameters']('browser_type', invalidParams);
      expect(result).toBe(false);
    });

    it('should validate browser_wait_for parameters correctly', () => {
      const validParams = { timeout: 5000 };
      const result = testExecutionService['validateMCPParameters']('browser_wait_for', validParams);
      expect(result).toBe(true);
    });

    it('should handle unknown tool names gracefully', () => {
      const params = { someParam: 'value' };
      const result = testExecutionService['validateMCPParameters']('unknown_tool', params);
      expect(result).toBe(true); // Should skip validation for unknown tools
    });
  });

  describe('Element Finding and Command Building', () => {
    beforeEach(() => {
      // Mock the findBestElement method
      mockMcpClient['findBestElement'] = jest.fn().mockResolvedValue({
        ref: 'e18',
        text: 'Username Field'
      });

      // Mock MCPToolMapper
      (MCPToolMapper.getToolName as jest.Mock).mockImplementation((action: string) => {
        const toolMap: Record<string, string> = {
          'click': 'browser_click',
          'fill': 'browser_type',
          'type': 'browser_type',
          'input': 'browser_type'
        };
        return toolMap[action] || `browser_${action}`;
      });
    });

    it('should find element and build click command correctly', async () => {
      const result = await testExecutionService['findElementAndBuildCommand'](
        'click',
        'text=登录',
        undefined,
        'test-run-1'
      );

      expect(result).toEqual({
        name: 'browser_click',
        arguments: { ref: 'e18' }
      });

      expect(mockMcpClient['findBestElement']).toHaveBeenCalledWith('text=登录', 'test-run-1');
    });

    it('should find element and build fill command correctly', async () => {
      const result = await testExecutionService['findElementAndBuildCommand'](
        'fill',
        'input[name="username"]',
        'admin',
        'test-run-1'
      );

      expect(result).toEqual({
        name: 'browser_type',
        arguments: { ref: 'e18', text: 'admin' }
      });

      expect(mockMcpClient['findBestElement']).toHaveBeenCalledWith('input[name="username"]', 'test-run-1');
    });

    it('should handle element finding failure', async () => {
      // Mock element finding failure
      mockMcpClient['findBestElement'] = jest.fn().mockRejectedValue(new Error('Element not found'));

      await expect(
        testExecutionService['findElementAndBuildCommand'](
          'click',
          'nonexistent-element',
          undefined,
          'test-run-1'
        )
      ).rejects.toThrow('元素查找失败: nonexistent-element - Element not found');
    });

    it('should handle unsupported action types', async () => {
      await expect(
        testExecutionService['findElementAndBuildCommand'](
          'unsupported',
          'some-selector',
          undefined,
          'test-run-1'
        )
      ).rejects.toThrow('不支持的操作类型: unsupported');
    });
  });

  describe('MCPToolMapper Integration', () => {
    it('should use MCPToolMapper for tool name mapping', async () => {
      // Mock MCPToolMapper
      (MCPToolMapper.getToolName as jest.Mock).mockReturnValue('browser_type');

      mockMcpClient['findBestElement'] = jest.fn().mockResolvedValue({
        ref: 'e18',
        text: 'Username Field'
      });

      const result = await testExecutionService['findElementAndBuildCommand'](
        'fill',
        'input[name="username"]',
        'admin',
        'test-run-1'
      );

      expect(MCPToolMapper.getToolName).toHaveBeenCalledWith('fill');
      expect(result.name).toBe('browser_type');
    });
  });
});
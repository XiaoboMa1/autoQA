/**
 * MCP工具名称通用映射器
 * 提供统一的工具名称转换，避免硬编码
 */

export class MCPToolMapper {
  static getToolName(baseName) {
    // 🔥 扩展到53种MCP工具的完整映射
    const toolMap = {
      // === 页面导航类 (7种) ===
      'navigate': 'browser_navigate',
      'goto': 'browser_navigate', 
      'open': 'browser_navigate',
      'back': 'browser_back',
      'forward': 'browser_forward', 
      'refresh': 'browser_refresh',
      'reload': 'browser_refresh',
      'new_tab': 'browser_new_tab',
      'close_tab': 'browser_close_tab',
      'switch_tab': 'browser_switch_tab',
      
      // === 元素交互类 (12种) ===
      'click': 'browser_click',
      'double_click': 'browser_double_click',
      'right_click': 'browser_right_click',
      'type': 'browser_type',
      'fill': 'browser_type',
      'input': 'browser_type',
      'clear': 'browser_clear',
      'hover': 'browser_hover',
      'focus': 'browser_focus',
      'blur': 'browser_blur',
      
      // === 表单操作类 (8种) ===
      'select_option': 'browser_select_option',
      'select': 'browser_select_option',
      'choose': 'browser_select_option',
      'check': 'browser_check',
      'uncheck': 'browser_uncheck',
      'upload_file': 'browser_upload_file',
      'upload': 'browser_upload_file',
      'drag_and_drop': 'browser_drag_and_drop',
      'drag': 'browser_drag_and_drop',
      
      // === 页面滚动类 (通过JavaScript实现) ===
      // 注意：MCP官方不支持直接滚动工具，通过browser_evaluate + JavaScript实现
      // 'scroll_down': 使用 evaluate + 'window.scrollBy(0, 500)'
      // 'scroll_up': 使用 evaluate + 'window.scrollBy(0, -500)' 
      // 'scroll_to_top': 使用 evaluate + 'window.scrollTo(0, 0)'
      // 'scroll_to_bottom': 使用 evaluate + 'window.scrollTo(0, document.body.scrollHeight)'
      // 'scroll_to_element': 使用 evaluate + 'element.scrollIntoView()'
      
      // === 键盘操作类 (5种) ===
      'press_key': 'browser_press_key',
      'press': 'browser_press_key',
      'key_combination': 'browser_key_combination',
      'key_combo': 'browser_key_combination',
      'type_with_delay': 'browser_type_with_delay',
      
      // === 等待验证类 (8种) ===
      'wait': 'browser_wait_for',
      'wait_for': 'browser_wait_for',
      'sleep': 'browser_wait_for',
      'delay': 'browser_wait_for',
      'wait_for_element': 'browser_wait_for_element',
      'wait_for_text': 'browser_wait_for_text',
      'wait_for_url': 'browser_wait_for_url',
      'wait_for_load': 'browser_wait_for_load',
      
      // === 断言验证类 (7种) ===
      'assert_text': 'browser_assert_text',
      'assert_element': 'browser_assert_element',
      'assert_url': 'browser_assert_url',
      'assert_title': 'browser_assert_title',
      'assert_attribute': 'browser_assert_attribute',
      'expect': 'browser_assert_text',
      'verify': 'browser_assert_element',
      
      // === 截图调试类 (4种) ===
      'screenshot': 'browser_take_screenshot',
      'capture': 'browser_take_screenshot',
      'screenshot_element': 'browser_screenshot_element',
      'get_text': 'browser_get_text',
      'get_attribute': 'browser_get_attribute',
      
      // === 高级功能类 ===
      // 状态管理
      'snapshot': 'browser_snapshot',
      'state': 'browser_snapshot',
      'status': 'browser_snapshot',
      'get_context_state': 'browser_get_context_state',
      'set_context_state': 'browser_set_context_state',
      'evaluate': 'browser_evaluate',
      
      // 对话框处理
      'dialog': 'browser_handle_dialog',
      'alert': 'browser_handle_dialog',
      'confirm': 'browser_handle_dialog',
      'prompt': 'browser_handle_dialog',
      
      // 网络监控
      'network': 'browser_network_requests',
      'requests': 'browser_network_requests',
      
      // 文档操作
      'pdf_save': 'browser_pdf_save',
      'download': 'browser_pdf_save',
      
      // 窗口管理
      'resize': 'browser_resize',
      'maximize': 'browser_maximize',
      'minimize': 'browser_minimize',
      'close': 'browser_close'
    };
    
    // 处理mcp前缀的兼容性
    if (baseName.startsWith('mcp_playwright_browser_')) {
      baseName = baseName.replace('mcp_playwright_browser_', '');
    }
    
    // 处理browser_前缀的兼容性
    if (baseName.startsWith('browser_')) {
      return baseName; // 已经是正确格式
    }
    
    return toolMap[baseName] || `browser_${baseName}`;
  }
  
  static validateToolName(toolName) {
    // 自动兼容两种前缀
    const browserPrefix = toolName.startsWith('browser_');
    const mcpPrefix = toolName.startsWith('mcp_playwright_browser_');
    const baseName = browserPrefix ? toolName : 
                     mcpPrefix ? toolName.replace('mcp_playwright_browser_', 'browser_') :
                     `browser_${toolName}`;

    // 🔥 完整的53种MCP工具列表
    const validTools = [
      // 页面导航类 (7种)
      'browser_navigate', 'browser_back', 'browser_forward', 'browser_refresh',
      'browser_new_tab', 'browser_close_tab', 'browser_switch_tab',
      
      // 元素交互类 (12种)
      'browser_click', 'browser_double_click', 'browser_right_click',
      'browser_type', 'browser_clear', 'browser_hover', 'browser_focus', 'browser_blur',
      
      // 表单操作类 (8种) 
      'browser_select_option', 'browser_check', 'browser_uncheck',
      'browser_upload_file', 'browser_drag_and_drop',
      
      // 页面滚动类 (通过JavaScript实现，不是直接的MCP工具)
      // 滚动功能通过 'browser_evaluate' 工具执行JavaScript代码实现
      
      // 键盘操作类 (5种)
      'browser_press_key', 'browser_key_combination', 'browser_type_with_delay',
      
      // 等待验证类 (8种)
      'browser_wait_for', 'browser_wait_for_element', 'browser_wait_for_text',
      'browser_wait_for_url', 'browser_wait_for_load',
      
      // 断言验证类 (7种)
      'browser_assert_text', 'browser_assert_element', 'browser_assert_url',
      'browser_assert_title', 'browser_assert_attribute',
      
      // 截图调试类 (4种)
      'browser_take_screenshot', 'browser_screenshot_element',
      'browser_get_text', 'browser_get_attribute',
      
      // 高级功能类
      'browser_snapshot', 'browser_get_context_state', 'browser_set_context_state',
      'browser_evaluate', 'browser_handle_dialog', 'browser_network_requests',
      'browser_pdf_save', 'browser_resize', 'browser_maximize', 'browser_minimize',
      'browser_close'
    ];
    
    return validTools.includes(baseName) ? baseName : null;
  }
  
  static getAllValidTools() {
    // 🔥 返回完整的53种MCP工具列表
    return [
      // 页面导航类 (7种)
      'browser_navigate', 'browser_back', 'browser_forward', 'browser_refresh',
      'browser_new_tab', 'browser_close_tab', 'browser_switch_tab',
      
      // 元素交互类 (12种)
      'browser_click', 'browser_double_click', 'browser_right_click',
      'browser_type', 'browser_clear', 'browser_hover', 'browser_focus', 'browser_blur',
      
      // 表单操作类 (8种) 
      'browser_select_option', 'browser_check', 'browser_uncheck',
      'browser_upload_file', 'browser_drag_and_drop',
      
      // 页面滚动类 (通过JavaScript实现，不是直接的MCP工具)
      // 滚动功能通过 'browser_evaluate' 工具执行JavaScript代码实现
      
      // 键盘操作类 (5种)
      'browser_press_key', 'browser_key_combination', 'browser_type_with_delay',
      
      // 等待验证类 (8种)
      'browser_wait_for', 'browser_wait_for_element', 'browser_wait_for_text',
      'browser_wait_for_url', 'browser_wait_for_load',
      
      // 断言验证类 (7种)
      'browser_assert_text', 'browser_assert_element', 'browser_assert_url',
      'browser_assert_title', 'browser_assert_attribute',
      
      // 截图调试类 (4种)
      'browser_take_screenshot', 'browser_screenshot_element',
      'browser_get_text', 'browser_get_attribute',
      
      // 高级功能类
      'browser_snapshot', 'browser_get_context_state', 'browser_set_context_state',
      'browser_evaluate', 'browser_handle_dialog', 'browser_network_requests',
      'browser_pdf_save', 'browser_resize', 'browser_maximize', 'browser_minimize',
      'browser_close'
    ];
  }
}
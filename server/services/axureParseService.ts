import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { AxureParseResult, AxurePage, AxureElement, AxureInteraction } from '../types/axure.js';

/**
 * Axure HTML文件解析服务
 * 支持Axure RP 8/9/10导出的HTML文件
 */
export class AxureParseService {
  /**
   * 解析Axure HTML文件
   * @param filePath 文件路径
   * @returns 解析结果
   */
  async parseHtmlFile(filePath: string): Promise<AxureParseResult> {
    console.log('📄 开始解析Axure文件:', filePath);

    try {
      // 1. 读取HTML文件
      const html = await fs.readFile(filePath, 'utf-8');
      const $ = cheerio.load(html);

      // 2. 提取页面列表
      const pages: AxurePage[] = [];

      // 🎯 首先尝试提取主内容区域（Axure通常使用 #base 或 body 作为主容器）
      console.log('🔍 步骤1: 尝试提取主内容区域...');
      const mainContainers = ['#base', 'body'];
      let foundMainContent = false;

      // 🎯 优化：从<title>标签提取真实页面名称
      const titleText = $('head title').text().trim();
      let cleanedTitle = titleText;

      // 清理常见的Axure后缀（通用规则）
      if (titleText) {
        cleanedTitle = titleText
          .replace(/\s*-\s*Axure\s*RP.*$/i, '')  // 移除 "- Axure RP 9"
          .replace(/\s*\|\s*Axure.*$/i, '')      // 移除 "| Axure"
          .replace(/\s*-\s*Powered by.*$/i, '') // 移除 "- Powered by..."
          .trim();

        if (cleanedTitle) {
          console.log(`  📌 从<title>提取页面名称: "${cleanedTitle}"`);
        }
      }

      for (const selector of mainContainers) {
        const mainElem = $(selector);
        if (mainElem.length > 0) {
          console.log(`  ✓ 找到主容器: ${selector}`);
          const mainPage = this.extractPage($, mainElem[0]);

          if (mainPage.elements.length > 0) {
            // 🎯 关键修复：如果提取的名称无效（如"base"），强制使用<title>中的名称
            if (!this.isValidBusinessName(mainPage.name)) {
              if (cleanedTitle && this.isValidBusinessName(cleanedTitle)) {
                console.log(`  🔄 替换无效名称 "${mainPage.name}" → "${cleanedTitle}"`);
                mainPage.name = cleanedTitle;
              } else {
                mainPage.name = '主页面';
              }
            }

            pages.push(mainPage);
            foundMainContent = true;
            console.log(`  ✅ 主页面提取成功: "${mainPage.name}", ${mainPage.elements.length} 个元素`);
            break;
          }
        }
      }

      if (!foundMainContent) {
        console.log('  ⚠️  未找到主内容区域');
      }

      // 🔍 步骤2: 提取额外的页面容器（data-label等）
      console.log('\n🔍 步骤2: 尝试提取其他页面容器...');
      const pageSelectors = [
        '[data-page]',
        '.page',
        '[id^="page"]',
        '[id^="p-"]',
        '.ax-page',
        'div[data-label]:not(.panel_state)'  // 🎯 关键修复：排除动态面板的状态容器
      ];

      let foundAdditionalPages = false;
      for (const selector of pageSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          console.log(`  ✓ 使用选择器 "${selector}" 找到 ${elements.length} 个额外页面`);
          let visibleCount = 0;
          let hiddenCount = 0;

          elements.each((i, elem) => {
            const $elem = $(elem);

            // 🎯 关键修复1: 跳过动态面板的状态容器（panel_state）
            if ($elem.hasClass('panel_state')) {
              console.log(`    ⏩ 跳过动态面板状态容器: ${$elem.attr('data-label') || $elem.attr('id')}`);
              return;
            }

            // 🎯 关键修复2: 跳过ID匹配状态容器格式的元素（u数字_state数字）
            const elemId = $elem.attr('id');
            if (elemId && /^u\d+_state\d+$/i.test(elemId)) {
              console.log(`    ⏩ 跳过状态容器ID: ${elemId}`);
              return;
            }

            // 🔍 只提取非隐藏的页面容器 (使用正则表达式匹配,兼容有无空格)
            const style = $elem.attr('style') || '';
            const isPageHidden =
              /display\s*:\s*none/i.test(style) ||
              /visibility\s*:\s*hidden/i.test(style) ||
              $elem.hasClass('ax_default_hidden');

            if (isPageHidden) {
              hiddenCount++;
              console.log(`    ⏩ 跳过隐藏页面: ${$elem.attr('data-label') || $elem.attr('id')}`);
              return; // 跳过隐藏的页面容器
            }

            const page = this.extractPage($, elem);
            if (page.elements.length > 0 || page.interactions.length > 0) {
              pages.push(page);
              visibleCount++;
            }
          });

          console.log(`    📊 可见页面: ${visibleCount} 个, 隐藏页面: ${hiddenCount} 个`);
          foundAdditionalPages = true;
          break;
        }
      }

      if (!foundAdditionalPages) {
        console.log('  ℹ️  未找到额外的页面容器');
      }

      // 3. 统计信息
      const elementCount = pages.reduce((sum, p) => sum + p.elements.length, 0);
      const interactionCount = pages.reduce((sum, p) => sum + p.interactions.length, 0);

      const result: AxureParseResult = {
        sessionId: uuidv4(),
        pageCount: pages.length,
        elementCount,
        interactionCount,
        pages
      };

      console.log(`✅ 解析完成: ${result.pageCount}个页面, ${result.elementCount}个元素, ${result.interactionCount}个交互`);

      return result;
    } catch (error: any) {
      console.error('❌ 解析Axure文件失败:', error);
      throw new Error(`解析Axure文件失败: ${error.message}`);
    }
  }

  /**
   * 提取单个页面信息
   */
  private extractPage($: cheerio.CheerioAPI, elem: cheerio.Element): AxurePage {
    const $elem = $(elem);

    console.log(`  📄 提取页面信息...`);

    // 🎯 改进的页面名称提取优先级（通用规则）
    let name = '';

    // 优先级1: 从页面标题元素提取（h1 > h2 > h3）- 业务页面通常有明确的标题
    const headingText = $elem.find('h1, h2, h3').first().text().trim();
    if (headingText && this.isValidBusinessName(headingText)) {
      name = headingText;
      console.log(`    ✓ 使用标题元素: "${name}"`);
    }

    // 优先级2: data-label 属性（如果有效）
    if (!name) {
      const dataLabel = $elem.attr('data-label');
      if (dataLabel && this.isValidBusinessName(dataLabel)) {
        name = dataLabel;
        console.log(`    ✓ 使用data-label: "${name}"`);
      } else if (dataLabel) {
        console.log(`    ✗ data-label无效: "${dataLabel}"`);
      }
    }

    // 优先级3: data-name 属性（如果有效）
    if (!name) {
      const dataName = $elem.attr('data-name');
      if (dataName && this.isValidBusinessName(dataName)) {
        name = dataName;
        console.log(`    ✓ 使用data-name: "${name}"`);
      } else if (dataName) {
        console.log(`    ✗ data-name无效: "${dataName}"`);
      }
    }

    // 优先级4: title 属性（如果有效）
    if (!name) {
      const titleAttr = $elem.attr('title');
      if (titleAttr && this.isValidBusinessName(titleAttr)) {
        name = titleAttr;
        console.log(`    ✓ 使用title属性: "${name}"`);
      }
    }

    // 优先级5: id 属性（最后才考虑，因为可能是技术ID）
    if (!name) {
      const idAttr = $elem.attr('id');
      if (idAttr && this.isValidBusinessName(idAttr)) {
        name = idAttr;
        console.log(`    ⚠️  使用id属性: "${name}"`);
      }
    }

    // 如果以上都没有，使用默认名称
    if (!name) {
      name = 'Unnamed Page';
      console.log(`    ? 使用默认名称: "${name}"`);
    }

    // 提取页面URL
    const url = $elem.attr('data-url') || $elem.attr('href') || '';

    // 提取页面元素
    const elements = this.extractElements($, elem);

    // 提取交互行为
    const interactions = this.extractInteractions($, elem);

    // 创建页面对象
    const page: AxurePage = {
      name,
      url,
      elements,
      interactions
    };

    // 自动识别页面类型
    page.pageType = this.detectPageType(page);

    return page;
  }

  /**
   * 提取页面元素
   */
  private extractElements($: cheerio.CheerioAPI, pageElem: cheerio.Element): AxureElement[] {
    const elements: AxureElement[] = [];

    // 🔍 步骤1: 先查找所有label元素,建立label映射
    const labelMap = new Map<string, string>(); // key: label的下一个兄弟元素的ID, value: label文本

    $(pageElem).find('.ax_default.label').each((i, labelElem) => {
      const $label = $(labelElem);
      const labelText = $label.text().trim().replace(/[::\s]+$/, ''); // 移除末尾的冒号(中英文)和空格

      // 查找label后面紧邻的兄弟元素(通常是input/select/textarea)
      let $nextSibling = $label.next();

      // 跳过注释和空元素,最多向后查找3个兄弟元素
      let attempts = 0;
      while ($nextSibling.length > 0 && attempts < 3) {
        const nextId = $nextSibling.attr('id');
        if (nextId) {
          // 检查是否是输入类元素
          const hasInput = $nextSibling.find('input, select, textarea').length > 0 ||
                          $nextSibling.is('input, select, textarea');
          if (hasInput) {
            labelMap.set(nextId, labelText);
            break;
          }
        }
        $nextSibling = $nextSibling.next();
        attempts++;
      }
    });

    console.log(`  📋 找到 ${labelMap.size} 个label-input关联`);

    // 🔍 步骤2: 提取所有交互元素
    const selectors = [
      'input',
      'button',
      'select',
      'textarea',
      'a[href]',
      '[data-label]',
      '[onclick]',
      '.btn',
      '.button',
      '[role="button"]',
      '[type="submit"]',
      '.ax_default.label'  // 🔥 新增：Axure 导出的按钮通常是 div.ax_default.label
    ];

    $(pageElem)
      .find(selectors.join(', '))
      .each((i, elem) => {
        const $elem = $(elem);
        let type = elem.tagName ? elem.tagName.toLowerCase() : 'unknown';

        // 🔥 关键修复：将 Axure 的 label div 识别为 button
        if (type === 'div' && $elem.hasClass('ax_default') && $elem.hasClass('label')) {
          const text = $elem.text().trim();
          // 如果文本内容看起来像按钮（短文本，不是字段标签），将其识别为按钮
          if (text.length > 0 && text.length <= 10 &&
              (text.includes('查询') || text.includes('重置') || text.includes('导出') ||
               text.includes('新增') || text.includes('编辑') || text.includes('删除') ||
               text.includes('审核') || text.includes('确认') || text.includes('确定') ||
               text.includes('取消') || text.includes('保存') || text.includes('提交') ||
               text.includes('详情') || text.includes('下单') || text.includes('上传') ||
               text.includes('下载') || text.includes('打印') || text.includes('返回') ||
               text.includes('关闭') || text.includes('刷新'))) {
            type = 'button';  // 🔥 强制识别为 button
          }
        }

        // 🔥 新增:跳过隐藏的元素及其子元素
        const style = $elem.attr('style') || '';
        const isElementHidden =
          /display\s*:\s*none/i.test(style) ||
          /visibility\s*:\s*hidden/i.test(style) ||
          $elem.hasClass('ax_default_hidden') ||
          $elem.attr('hidden') !== undefined;

        // 检查父元素是否隐藏(向上查找最多5层)
        const hasHiddenParent = $elem.parents().toArray().slice(0, 5).some(parent => {
          const $parent = $(parent);
          const parentStyle = $parent.attr('style') || '';
          return (
            /display\s*:\s*none/i.test(parentStyle) ||
            /visibility\s*:\s*hidden/i.test(parentStyle) ||
            $parent.hasClass('ax_default_hidden')
          );
        });

        if (isElementHidden || hasHiddenParent) {
          // 跳过隐藏的元素(不输出日志以减少噪音)
          return;
        }

        // 获取基本属性
        let text = $elem.text().trim();
        let name = $elem.attr('name') || $elem.attr('data-name') || $elem.attr('data-label');
        const placeholder = $elem.attr('placeholder');
        let value = $elem.attr('value');

        // 🎯 关键优化: 关联label文本
        const parentId = $elem.parent().attr('id');
        if (parentId && labelMap.has(parentId)) {
          const labelText = labelMap.get(parentId)!;

          // 如果是输入框,将label文本设置为name
          if (type === 'input' || type === 'select' || type === 'textarea') {
            name = labelText;

            // 如果value是"请输入xxx"格式,清空value,将其作为placeholder
            if (value && value.startsWith('请输入')) {
              // 不清空value,保留它,因为AI需要通过这个识别字段
              // 但添加label信息作为name更重要
            }
          }
        }

        // 如果没有任何文本信息,则跳过
        if (!text && !name && !placeholder && !value) {
          return; // 跳过完全空的元素
        }

        elements.push({
          id: $elem.attr('id') || $elem.attr('data-id') || `elem-${i}`,
          type,
          name,
          placeholder,
          text,
          value
        });
      });

    // 🔍 步骤3: 提取 div 文本元素（列表字段、业务规则等）
    $(pageElem).find('div.ax_default.label').each((i, elem) => {
      const $elem = $(elem);
      const text = $elem.text().trim();

      // 🔥 跳过隐藏的div
      const style = $elem.attr('style') || '';
      const isHidden =
        /display\s*:\s*none/i.test(style) ||
        /visibility\s*:\s*hidden/i.test(style) ||
        $elem.hasClass('ax_default_hidden');

      if (isHidden) {
        return; // 跳过隐藏元素
      }

      // 跳过空文本
      if (!text || text.length === 0) {
        return;
      }

      // 避免重复提取(检查是否已经在elements中)
      const elemId = $elem.attr('id');
      const alreadyExists = elements.some(e => e.id === elemId);

      if (alreadyExists) {
        return; // 已经在步骤2中作为按钮提取过了
      }

      // 🔥 关键改进：提取所有短文本的 div.label 作为列表字段或列头
      // 之前只识别按钮（≤10字），现在也识别列头（可能更长）
      if (text.length <= 50) {
        // 短文本：可能是列头、字段标签或按钮（按钮已在步骤2处理）
        elements.push({
          id: elemId || `div-${i}`,
          type: 'div',
          name: undefined,
          placeholder: undefined,
          text: text,
          value: undefined
        });
      }
    });

    // 🔍 步骤4: 专门提取包含业务规则关键词的长文本div元素
    $(pageElem).find('div').each((i, elem) => {
      const $elem = $(elem);
      const text = $elem.text().trim();

      // 🔥 跳过隐藏的div
      const style = $elem.attr('style') || '';
      const isHidden =
        /display\s*:\s*none/i.test(style) ||
        /visibility\s*:\s*hidden/i.test(style) ||
        $elem.hasClass('ax_default_hidden');

      if (isHidden) {
        return; // 跳过隐藏的业务规则说明
      }

      // 只提取长文本且包含业务规则关键词的div
      if (text.length > 50 &&
          (text.includes('审核') || text.includes('校验') || text.includes('拦截') ||
           text.includes('确认') || text.includes('运费') || text.includes('库存') ||
           text.includes('结算总金额') || text.includes('通过时') || text.includes('拉取'))) {

        // 避免重复提取(检查是否已经在elements中)
        const elemId = $elem.attr('id');
        const alreadyExists = elements.some(e => e.id === elemId);

        if (!alreadyExists) {
          elements.push({
            id: elemId || `note-${i}`,
            type: 'div',
            name: '业务规则说明',
            placeholder: undefined,
            text: text.substring(0, 1000), // 最多保留1000字
            value: undefined
          });
        }
      }
    });

    console.log(`  ✅ 提取完成: ${elements.length} 个元素 (包含业务规则说明)`);

    return elements;
  }

  /**
   * 提取交互行为
   */
  private extractInteractions($: cheerio.CheerioAPI, pageElem: cheerio.Element): AxureInteraction[] {
    const interactions: AxureInteraction[] = [];

    // 查找所有包含交互的元素
    $(pageElem)
      .find('[onclick], [data-action], [data-interaction], [data-click]')
      .each((i, elem) => {
        const $elem = $(elem);

        interactions.push({
          type: 'click',
          trigger: $elem.attr('id') || $elem.attr('data-label') || $elem.text().trim() || `interaction-${i}`,
          action: $elem.attr('onclick') || $elem.attr('data-action') || $elem.attr('data-interaction'),
          target: $elem.attr('data-target') || $elem.attr('href')
        });
      });

    return interactions;
  }

  /**
   * 解析多个文件（HTML + JS）
   * @param htmlFilePaths HTML文件路径数组
   * @param jsFilePaths JS文件路径数组
   * @param userPageName 用户指定的页面名称（可选）
   * @returns 合并后的解析结果
   */
  async parseMultipleFiles(htmlFilePaths: string[], jsFilePaths: string[], userPageName?: string): Promise<AxureParseResult> {
    console.log('📄 开始解析多个Axure文件');
    console.log(`  - HTML: ${htmlFilePaths.length} 个`);
    console.log(`  - JS: ${jsFilePaths.length} 个`);
    if (userPageName) {
      console.log(`  - 用户指定页面名称: "${userPageName}"`);
    }

    try {
      // 1. 解析所有HTML文件
      const htmlResults: AxureParseResult[] = [];
      for (const htmlPath of htmlFilePaths) {
        const result = await this.parseHtmlFile(htmlPath);
        htmlResults.push(result);
      }

      // 2. 如果用户指定了页面名称，替换第一个页面的名称
      if (userPageName && htmlResults.length > 0 && htmlResults[0].pages.length > 0) {
        console.log(`  🔄 使用用户指定的页面名称: "${htmlResults[0].pages[0].name}" → "${userPageName}"`);
        htmlResults[0].pages[0].name = userPageName;
      }

      // 3. 解析所有JS文件
      const jsData = await this.parseJsFiles(jsFilePaths);

      // 4. 合并数据
      const mergedResult = this.mergeResults(htmlResults, jsData);

      console.log(`✅ 多文件解析完成: ${mergedResult.pageCount}个页面, ${mergedResult.elementCount}个元素, ${mergedResult.interactionCount}个交互`);

      return mergedResult;
    } catch (error: any) {
      console.error('❌ 解析多文件失败:', error);
      throw new Error(`解析多文件失败: ${error.message}`);
    }
  }

  /**
   * 解析JS文件，提取交互逻辑
   * @param jsFilePaths JS文件路径数组
   * @returns 交互数据
   */
  private async parseJsFiles(jsFilePaths: string[]): Promise<any> {
    const interactions: any[] = [];
    const pageMetadata: Record<string, any> = {};

    for (const jsPath of jsFilePaths) {
      const fileName = path.basename(jsPath).toLowerCase();
      console.log(`  📜 解析 JS 文件: ${fileName}`);

      try {
        const jsContent = await fs.readFile(jsPath, 'utf-8');

        // 检查是否是 document.js（全局配置）
        if (fileName.includes('document') || fileName === 'data.js') {
          const docData = this.extractDocumentData(jsContent);
          Object.assign(pageMetadata, docData);
        }

        // 提取页面数据文件（files/*/data.js）
        if (fileName.startsWith('data') || jsPath.includes('/files/')) {
          const pageData = this.extractPageData(jsContent);
          if (pageData) {
            interactions.push(...pageData.interactions);
            if (pageData.metadata) {
              Object.assign(pageMetadata, pageData.metadata);
            }
          }
        }

        // 提取交互逻辑（如果包含特定模式）
        const extractedInteractions = this.extractInteractionsFromJs(jsContent);
        if (extractedInteractions.length > 0) {
          interactions.push(...extractedInteractions);
        }
      } catch (error) {
        console.warn(`  ⚠️  解析 JS 文件失败: ${fileName}`, error);
      }
    }

    return {
      interactions,
      metadata: pageMetadata
    };
  }

  /**
   * 从document.js提取文档数据
   */
  private extractDocumentData(jsContent: string): any {
    const data: any = {};

    try {
      // 尝试提取页面树结构
      const pageTreeMatch = jsContent.match(/var\s+sitemap\s*=\s*(\{[\s\S]*?\});/);
      if (pageTreeMatch) {
        try {
          data.pageTree = JSON.parse(pageTreeMatch[1]);
        } catch (e) {
          // 忽略JSON解析错误
        }
      }

      // 提取页面URL映射
      const urlMatch = jsContent.match(/var\s+pageUrl\s*=\s*(\{[\s\S]*?\});/);
      if (urlMatch) {
        try {
          data.pageUrls = JSON.parse(urlMatch[1]);
        } catch (e) {
          // 忽略
        }
      }
    } catch (error) {
      console.warn('  ⚠️  提取 document 数据失败');
    }

    return data;
  }

  /**
   * 从页面数据文件提取交互信息
   */
  private extractPageData(jsContent: string): any {
    const result: any = {
      interactions: [],
      metadata: {}
    };

    try {
      // 查找交互定义（Axure通常用 $axure.document.fn 定义）
      const interactionMatches = jsContent.matchAll(/case\s+["']([^"']+)["']:\s*\{[\s\S]*?type:\s*["']([^"']+)["'][\s\S]*?\}/g);

      for (const match of interactionMatches) {
        result.interactions.push({
          caseId: match[1],
          type: match[2],
          source: 'js'
        });
      }

      // 查找页面元素映射
      const masterMatch = jsContent.match(/var\s+masters\s*=\s*(\{[\s\S]*?\});/);
      if (masterMatch) {
        try {
          result.metadata.masters = JSON.parse(masterMatch[1]);
        } catch (e) {
          // 忽略
        }
      }

      // 查找动态面板定义
      const dynamicPanelMatch = jsContent.match(/var\s+dynamicPanels\s*=\s*(\{[\s\S]*?\});/);
      if (dynamicPanelMatch) {
        try {
          result.metadata.dynamicPanels = JSON.parse(dynamicPanelMatch[1]);
        } catch (e) {
          // 忽略
        }
      }
    } catch (error) {
      console.warn('  ⚠️  提取页面数据失败');
    }

    return result;
  }

  /**
   * 从JS代码中提取交互逻辑
   */
  private extractInteractionsFromJs(jsContent: string): AxureInteraction[] {
    const interactions: AxureInteraction[] = [];

    try {
      // 查找 onClick 事件
      const onClickMatches = jsContent.matchAll(/onClick:\s*function\s*\([^)]*\)\s*\{([^}]*)\}/g);
      for (const match of onClickMatches) {
        const actionBody = match[1];
        interactions.push({
          type: 'click',
          trigger: 'JS onclick handler',
          action: actionBody.trim().substring(0, 100) // 截取前100字符
        });
      }

      // 查找页面跳转
      const navigateMatches = jsContent.matchAll(/navigate\s*\(\s*["']([^"']+)["']\s*\)/g);
      for (const match of onClickMatches) {
        interactions.push({
          type: 'navigate',
          trigger: 'JS navigation',
          target: match[1]
        });
      }

      // 查找显示/隐藏元素
      const showHideMatches = jsContent.matchAll(/(show|hide)\s*\(\s*["']([^"']+)["']\s*\)/g);
      for (const match of showHideMatches) {
        interactions.push({
          type: match[1] === 'show' ? 'show' : 'hide',
          trigger: 'JS visibility control',
          target: match[2]
        });
      }
    } catch (error) {
      console.warn('  ⚠️  提取交互逻辑失败');
    }

    return interactions;
  }

  /**
   * 合并HTML和JS的解析结果
   */
  private mergeResults(htmlResults: AxureParseResult[], jsData: any): AxureParseResult {
    // 合并所有HTML页面
    const allPages: AxurePage[] = [];
    for (const result of htmlResults) {
      allPages.push(...result.pages);
    }

    // 增强页面数据（添加JS中的交互信息）
    for (const page of allPages) {
      // 添加从JS提取的交互
      if (jsData.interactions && jsData.interactions.length > 0) {
        page.interactions.push(...jsData.interactions);
      }

      // 可以根据metadata补充页面信息
      if (jsData.metadata?.pageUrls) {
        const pageName = page.name;
        const urlInfo = jsData.metadata.pageUrls[pageName];
        if (urlInfo) {
          page.url = urlInfo;
        }
      }
    }

    // 统计信息
    const elementCount = allPages.reduce((sum, p) => sum + p.elements.length, 0);
    const interactionCount = allPages.reduce((sum, p) => sum + p.interactions.length, 0);

    return {
      sessionId: uuidv4(),
      pageCount: allPages.length,
      elementCount,
      interactionCount,
      pages: allPages
    };
  }

  /**
   * 自动识别页面类型
   * 根据页面元素、按钮文本、页面名称等启发式规则判断页面类型
   * @param page 页面对象
   * @returns 页面类型
   */
  private detectPageType(page: AxurePage): 'list' | 'form' | 'detail' | 'dialog' | 'mixed' | 'unknown' {
    const inputCount = page.elements.filter(e => e.type === 'input' || e.type === 'select').length;
    const buttonCount = page.elements.filter(e => e.type === 'button').length;
    const divCount = page.elements.filter(e => e.type === 'div' && e.text && e.text.length > 5).length;

    console.log(`  🔍 页面类型识别 "${page.name}": input=${inputCount}, button=${buttonCount}, div=${divCount}`);

    // 规则1: 查询按钮 + 数据展示 → 列表页
    const queryButtons = page.elements.filter(e =>
      e.type === 'button' &&
      e.text && (
        e.text.includes('查询') ||
        e.text.includes('搜索') ||
        e.text.includes('重置') ||
        e.text.toLowerCase().includes('search') ||
        e.text.toLowerCase().includes('query')
      )
    );

    // 规则2: 保存/提交按钮 → 表单页
    const formButtons = page.elements.filter(e =>
      e.type === 'button' &&
      e.text && (
        e.text.includes('保存') ||
        e.text.includes('提交') ||
        e.text.includes('确定') ||
        e.text.includes('创建') ||
        e.text.includes('新建') ||
        e.text.toLowerCase().includes('save') ||
        e.text.toLowerCase().includes('submit') ||
        e.text.toLowerCase().includes('create')
      )
    );

    console.log(`    - 查询按钮: ${queryButtons.length}个, 表单按钮: ${formButtons.length}个`);

    // 规则3: 页面名称关键词
    const nameLower = page.name.toLowerCase();
    if (nameLower.includes('列表') || nameLower.includes('list') || nameLower.includes('管理')) {
      console.log(`    ✓ 页面名称包含"列表/list/管理" → list`);
      return 'list';
    }
    if (nameLower.includes('新建') || nameLower.includes('编辑') || nameLower.includes('修改') ||
        nameLower.includes('create') || nameLower.includes('edit') || nameLower.includes('form')) {
      console.log(`    ✓ 页面名称包含"新建/编辑/修改" → form`);
      return 'form';
    }
    if (nameLower.includes('详情') || nameLower.includes('查看') || nameLower.includes('detail') || nameLower.includes('view')) {
      console.log(`    ✓ 页面名称包含"详情/查看" → detail`);
      return 'detail';
    }
    if (nameLower.includes('弹窗') || nameLower.includes('对话框') || nameLower.includes('modal') || nameLower.includes('dialog')) {
      console.log(`    ✓ 页面名称包含"弹窗/对话框" → dialog`);
      return 'dialog';
    }

    // 规则4: 按钮文本 + 元素比例分析
    if (queryButtons.length > 0 && divCount > inputCount * 2) {
      console.log(`    ✓ 有查询按钮且展示内容多 (div/input=${(divCount/Math.max(inputCount,1)).toFixed(1)}) → list`);
      return 'list';
    }
    if (formButtons.length > 0 && inputCount >= 3) {
      console.log(`    ✓ 有表单按钮且输入框>=3 → form`);
      return 'form';
    }
    if (inputCount === 0 && divCount > 10) {
      console.log(`    ✓ 无输入框且展示内容丰富 → detail`);
      return 'detail';
    }

    // 规则5: 元素比例判断
    const inputDivRatio = inputCount === 0 ? 0 : divCount / inputCount;
    if (inputDivRatio > 5) {
      console.log(`    ✓ 展示内容远多于输入框 (ratio=${inputDivRatio.toFixed(1)}) → list`);
      return 'list';
    } else if (inputDivRatio < 1 && inputCount > 3) {
      console.log(`    ✓ 输入框多于展示内容 (ratio=${inputDivRatio.toFixed(1)}) → form`);
      return 'form';
    }

    // 规则6: 混合或未知
    if (inputCount > 0 && divCount > 0) {
      console.log(`    ? 元素特征不明显 → mixed`);
      return 'mixed';
    }

    console.log(`    ? 无法判断页面类型 → unknown`);
    return 'unknown';
  }

  /**
   * 判断是否是有效的业务页面名称（通用规则，不依赖特定内容）
   * @param name 待验证的名称
   * @returns true表示是有效的业务名称，false表示可能是技术名称
   */
  private isValidBusinessName(name: string): boolean {
    if (!name || typeof name !== 'string') {
      return false;
    }

    const trimmed = name.trim();

    // 规则1: 长度至少2个字符（排除单字符）
    if (trimmed.length < 2) {
      console.log(`      ✗ 名称太短: "${trimmed}"`);
      return false;
    }

    // 规则2: 不是纯数字（如 "58", "65"）
    if (/^\d+$/.test(trimmed)) {
      console.log(`      ✗ 纯数字: "${trimmed}"`);
      return false;
    }

    // 规则3: 不是Axure自动生成的ID格式（u + 数字）
    if (/^u\d+$/i.test(trimmed)) {
      console.log(`      ✗ Axure自动ID: "${trimmed}"`);
      return false;
    }

    // 规则4: 不是动态面板状态格式（State + 数字）
    if (/^State\d+$/i.test(trimmed)) {
      console.log(`      ✗ 动态面板状态: "${trimmed}"`);
      return false;
    }

    // 规则5: 不是状态容器ID格式（u数字_state数字）
    if (/^u\d+_state\d+$/i.test(trimmed)) {
      console.log(`      ✗ 状态容器ID: "${trimmed}"`);
      return false;
    }

    // 规则6: 不是常见的技术性单词（base, body, container, wrapper, content, panel）
    const technicalWords = ['base', 'body', 'container', 'wrapper', 'content', 'panel'];
    if (technicalWords.includes(trimmed.toLowerCase())) {
      console.log(`      ✗ 技术性单词: "${trimmed}"`);
      return false;
    }

    // 规则7: 应该包含至少一个中文字符 OR 至少3个英文字符
    const hasChinese = /[\u4e00-\u9fa5]/.test(trimmed);
    const hasEnglish = /[a-zA-Z]{3,}/.test(trimmed);

    if (!hasChinese && !hasEnglish) {
      console.log(`      ✗ 无有效文字内容: "${trimmed}"`);
      return false;
    }

    console.log(`      ✓ 有效业务名称: "${trimmed}"`);
    return true;
  }
}

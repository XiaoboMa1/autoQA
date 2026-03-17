/**
 * 文件内容读取工具
 * 支持 HTML、PDF、DOCX、Markdown、TXT 等格式
 * 优化版：尽可能保留原始格式信息
 */
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// 设置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface FileReadResult {
  success: boolean;
  content: string;
  error?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  hasImages?: boolean;        // 是否包含图片
  isScannedPdf?: boolean;     // 是否为扫描版PDF
  formatWarnings?: string[];  // 格式警告信息
}

/**
 * 读取HTML文件内容
 */
async function readHtmlFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(content);
    };
    reader.onerror = () => reject(new Error('读取HTML文件失败'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * 读取文本文件内容（Markdown、TXT）
 */
async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(content);
    };
    reader.onerror = () => reject(new Error('读取文本文件失败'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * 读取PDF文件内容（增强版：保留布局、检测表格）
 */
async function readPdfFile(file: File): Promise<{ content: string; isScanned: boolean; hasImages: boolean }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    let totalTextLength = 0;
    let hasImages = false;
    
    // 逐页提取文本
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // 检测是否有图片
      const ops = await page.getOperatorList();
      if (ops.fnArray.includes(pdfjsLib.OPS.paintImageXObject)) {
        hasImages = true;
      }
      
      // 按行组织文本（保留布局）
      const items = textContent.items as any[];
      const lines: { y: number; text: string }[] = [];
      
      items.forEach(item => {
        if (!item.str || item.str.trim().length === 0) return;
        
        const y = Math.round(item.transform[5]);
        const existingLine = lines.find(line => Math.abs(line.y - y) < 5);
        
        if (existingLine) {
          existingLine.text += ' ' + item.str;
        } else {
          lines.push({ y, text: item.str });
        }
      });
      
      // 按垂直位置排序（从上到下）
      lines.sort((a, b) => b.y - a.y);
      
      // 检测表格（相邻行有相似的分隔符模式）
      const pageLines = lines.map(l => l.text.trim());
      const tableDetected = detectTable(pageLines);
      
      if (tableDetected) {
        fullText += `\n--- 第 ${i} 页（包含表格） ---\n\n`;
        fullText += formatAsTable(pageLines) + '\n\n';
      } else {
        fullText += `\n--- 第 ${i} 页 ---\n\n`;
        fullText += pageLines.join('\n') + '\n\n';
      }
      
      totalTextLength += pageLines.join('').length;
    }
    
    // 判断是否为扫描版（文本量太少）
    const isScanned = totalTextLength < 100 && pdf.numPages > 0;
    
    if (isScanned) {
      fullText = `⚠️ 警告：检测到这是扫描版PDF（图片格式），无法提取文本。\n建议：\n1. 使用文字版PDF重新生成\n2. 或使用OCR工具转换后再上传\n3. 或直接粘贴文本内容\n\n提取到的文本（${totalTextLength}字符）：\n${fullText}`;
    }
    
    return {
      content: fullText.trim(),
      isScanned,
      hasImages
    };
  } catch (error) {
    throw new Error('读取PDF文件失败：' + (error as Error).message);
  }
}

/**
 * 简单表格检测（基于行模式）
 */
function detectTable(lines: string[]): boolean {
  if (lines.length < 3) return false;
  
  // 检测是否有多行包含制表符或多个空格分隔
  const tablePattern = /\s{2,}|\t/;
  const linesWithPattern = lines.filter(line => tablePattern.test(line));
  
  return linesWithPattern.length >= Math.min(3, lines.length * 0.3);
}

/**
 * 格式化为Markdown表格
 */
function formatAsTable(lines: string[]): string {
  if (lines.length === 0) return lines.join('\n');
  
  // 简单处理：尝试按空格分割成列
  const rows = lines.map(line => 
    line.split(/\s{2,}|\t/).map(cell => cell.trim()).filter(cell => cell.length > 0)
  );
  
  if (rows.length === 0 || rows[0].length === 0) {
    return lines.join('\n');
  }
  
  // 生成Markdown表格
  const headers = rows[0];
  const separator = headers.map(() => '---').join(' | ');
  const tableRows = rows.slice(1).map(row => 
    row.map((cell, i) => cell || '').join(' | ')
  );
  
  return [
    headers.join(' | '),
    separator,
    ...tableRows
  ].join('\n');
}

/**
 * 读取DOCX文件内容（增强版：保留表格、列表、标题等格式）
 */
async function readDocxFile(file: File): Promise<{ content: string; hasImages: boolean; warnings: string[] }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    const warnings: string[] = [];
    let hasImages = false;
    
    // 使用 convertToHtml 并配置图片转换（保留更多格式）
    const htmlResult = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        // 配置图片转换为 base64
        convertImage: mammoth.images.imgElement(function(image: any) {
          return image.read("base64").then(function(imageBuffer: any) {
            hasImages = true;
            return {
              src: "data:" + image.contentType + ";base64," + imageBuffer
            };
          });
        }),
        // 样式映射（正确的语法）
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='标题 1'] => h1:fresh",
          "p[style-name='标题 2'] => h2:fresh",
          "p[style-name='标题 3'] => h3:fresh",
          "p[style-name='标题 4'] => h4:fresh",
          "p[style-name='List Paragraph'] => p:fresh"
        ]
      }
    );
    
    // 处理转换消息（过滤掉不重要的警告）
    if (htmlResult.messages && htmlResult.messages.length > 0) {
      htmlResult.messages.forEach(msg => {
        // 过滤掉常见的不重要警告
        const ignoredWarnings = [
          'w:tblPrEx',
          'Unrecognised paragraph style',
          'List Paragraph'
        ];
        
        const shouldIgnore = ignoredWarnings.some(ignored => 
          msg.message.includes(ignored)
        );
        
        if (msg.type === 'warning' && !shouldIgnore) {
          warnings.push(msg.message);
        }
        
        if (msg.message.includes('image') || msg.message.includes('图片')) {
          hasImages = true;
        }
      });
      
      if (warnings.length > 0) {
        console.warn('DOCX读取警告:', warnings);
      }
    }
    
    // 将HTML转换为更友好的Markdown格式
    const content = convertHtmlToMarkdown(htmlResult.value);
    
    return {
      content,
      hasImages,
      warnings
    };
  } catch (error) {
    throw new Error('读取DOCX文件失败：' + (error as Error).message);
  }
}

/**
 * 增强的HTML到Markdown转换（保留图片和表格）
 */
function convertHtmlToMarkdown(html: string): string {
  let markdown = html;
  
  // 移除样式和脚本
  markdown = markdown.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  markdown = markdown.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  
  // 转换标题
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n\n# $1\n\n');
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n\n## $1\n\n');
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n\n### $1\n\n');
  markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n\n#### $1\n\n');
  markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n\n##### $1\n\n');
  markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n\n###### $1\n\n');
  
  // 🆕 保留图片（转换为Markdown格式）
  markdown = markdown.replace(/<img[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '\n\n![图片: $2]($1)\n\n');
  markdown = markdown.replace(/<img[^>]*src=["']([^"']*)["'][^>]*>/gi, '\n\n![图片]($1)\n\n');
  
  // 转换列表
  markdown = markdown.replace(/<ul[^>]*>/gi, '\n');
  markdown = markdown.replace(/<\/ul>/gi, '\n');
  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  markdown = markdown.replace(/<ol[^>]*>/gi, '\n');
  markdown = markdown.replace(/<\/ol>/gi, '\n');
  
  // 🆕 表格转换为Markdown（简单表格）
  markdown = convertTableToMarkdown(markdown);
  
  // 转换段落
  markdown = markdown.replace(/<p[^>]*>/gi, '\n');
  markdown = markdown.replace(/<\/p>/gi, '\n');
  
  // 转换换行
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
  
  // 转换粗体和斜体
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  
  // 转换链接
  markdown = markdown.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  
  // 移除其他HTML标签（但保留表格标签）
  markdown = markdown.replace(/<(?!\/?(table|thead|tbody|tr|th|td))[^>]+>/g, '');
  
  // 解码HTML实体
  markdown = markdown.replace(/&nbsp;/g, ' ');
  markdown = markdown.replace(/&lt;/g, '<');
  markdown = markdown.replace(/&gt;/g, '>');
  markdown = markdown.replace(/&amp;/g, '&');
  markdown = markdown.replace(/&quot;/g, '"');
  markdown = markdown.replace(/&#39;/g, "'");
  
  // 清理多余空行
  markdown = markdown.replace(/\n{3,}/g, '\n\n');
  
  return markdown.trim();
}

/**
 * 将HTML表格转换为Markdown表格
 */
function convertTableToMarkdown(html: string): string {
  // 查找所有表格
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  
  return html.replace(tableRegex, (match) => {
    try {
      // 提取表头
      const theadMatch = match.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
      const tbodyMatch = match.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
      
      let headers: string[] = [];
      let rows: string[][] = [];
      
      // 解析表头
      if (theadMatch) {
        const headerCells = theadMatch[1].match(/<th[^>]*>(.*?)<\/th>/gi) || [];
        headers = headerCells.map(cell => 
          cell.replace(/<[^>]+>/g, '').trim()
        );
      }
      
      // 解析表格行
      const rowMatches = (tbodyMatch ? tbodyMatch[1] : match).match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      
      // 如果没有表头，从第一行提取
      if (headers.length === 0 && rowMatches.length > 0) {
        const firstRowCells = rowMatches[0].match(/<t[hd][^>]*>(.*?)<\/t[hd]>/gi) || [];
        headers = firstRowCells.map(cell => 
          cell.replace(/<[^>]+>/g, '').trim()
        );
        rowMatches.shift(); // 移除第一行
      }
      
      // 解析数据行
      rowMatches.forEach(row => {
        const cells = row.match(/<td[^>]*>(.*?)<\/td>/gi) || [];
        const rowData = cells.map(cell => 
          cell.replace(/<[^>]+>/g, '').trim()
        );
        if (rowData.length > 0) {
          rows.push(rowData);
        }
      });
      
      // 生成Markdown表格
      if (headers.length > 0) {
        const separator = headers.map(() => '---').join(' | ');
        const headerRow = headers.join(' | ');
        const dataRows = rows.map(row => 
          row.map((cell, i) => cell || '').join(' | ')
        ).join('\n');
        
        return `\n\n${headerRow}\n${separator}\n${dataRows}\n\n`;
      }
      
      // 如果无法解析为Markdown表格，返回提示
      return '\n\n**[表格内容]**\n\n';
    } catch (error) {
      console.warn('表格转换失败，保留原始HTML:', error);
      return '\n\n' + match + '\n\n';
    }
  });
}

/**
 * 根据文件类型读取文件内容（增强版）
 */
export async function readFileContent(file: File): Promise<FileReadResult> {
  const fileName = file.name;
  const fileSize = file.size;
  const fileExtension = fileName.toLowerCase().split('.').pop() || '';
  
  let fileType = '';
  let content = '';
  let success = false;
  let error: string | undefined;
  let hasImages = false;
  let isScannedPdf = false;
  let formatWarnings: string[] = [];
  
  try {
    // 根据文件扩展名选择对应的读取方法
    if (fileExtension === 'html' || fileExtension === 'htm') {
      fileType = 'HTML';
      content = await readHtmlFile(file);
    } else if (fileExtension === 'pdf') {
      fileType = 'PDF';
      const pdfResult = await readPdfFile(file);
      content = pdfResult.content;
      isScannedPdf = pdfResult.isScanned;
      hasImages = pdfResult.hasImages;
      
      if (isScannedPdf) {
        formatWarnings.push('⚠️ 检测到扫描版PDF，文本提取可能不完整');
        formatWarnings.push('💡 建议：使用文字版PDF或OCR工具转换后重试');
      }
      if (hasImages) {
        formatWarnings.push('📷 PDF中包含图片，图片内容无法提取');
      }
    } else if (fileExtension === 'docx') {
      fileType = 'DOCX';
      const docxResult = await readDocxFile(file);
      content = docxResult.content;
      hasImages = docxResult.hasImages;
      
      if (docxResult.warnings.length > 0) {
        formatWarnings.push(...docxResult.warnings.map(w => '⚠️ ' + w));
      }
      if (hasImages) {
        formatWarnings.push('📷 DOCX中包含图片，已尝试保留位置标记');
      }
      
      // 添加格式保留提示
      if (content.includes('<table>')) {
        formatWarnings.push('📊 文档中包含表格，已保留HTML格式');
      }
    } else if (fileExtension === 'md' || fileExtension === 'markdown') {
      fileType = 'Markdown';
      content = await readTextFile(file);
    } else if (fileExtension === 'txt') {
      fileType = 'TXT';
      content = await readTextFile(file);
    } else {
      throw new Error(`不支持的文件类型: ${fileExtension}`);
    }
    
    // 验证内容
    if (!content || content.trim().length === 0) {
      throw new Error('文件内容为空');
    }
    
    if (content.trim().length < 50 && !isScannedPdf) {
      throw new Error(`文件内容过少（${content.length} 字符），至少需要 50 个字符`);
    }
    
    success = true;
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : '未知错误';
    console.error('读取文件失败:', err);
  }
  
  return {
    success,
    content,
    error,
    fileName,
    fileType,
    fileSize,
    hasImages,
    isScannedPdf,
    formatWarnings: formatWarnings.length > 0 ? formatWarnings : undefined
  };
}

/**
 * 批量读取多个文件
 */
export async function readMultipleFiles(files: File[]): Promise<FileReadResult[]> {
  const results: FileReadResult[] = [];
  
  for (const file of files) {
    const result = await readFileContent(file);
    results.push(result);
  }
  
  return results;
}

/**
 * 格式化文件大小显示
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}


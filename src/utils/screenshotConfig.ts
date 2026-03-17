import * as path from 'path';
import * as fs from 'fs';

export interface ScreenshotConfig {
  /** 截图保存目录 */
  screenshotsDirectory: string;
  /** 是否启用文件存在性验证 */
  enableFileVerification: boolean;
  /** 是否启用自动清理 */
  enableAutoCleanup: boolean;
  /** 截图保留天数 */
  retentionDays: number;
  /** 是否启用备份 */
  enableBackup: boolean;
  /** 备份目录 */
  backupDirectory: string;
  /** 日志级别 */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export class ScreenshotConfigManager {
  private static instance: ScreenshotConfigManager;
  private config: ScreenshotConfig;
  private configPath: string;

  private constructor() {
    this.configPath = path.join(process.cwd(), 'screenshot-config.json');
    this.config = this.loadConfig();
  }

  public static getInstance(): ScreenshotConfigManager {
    if (!ScreenshotConfigManager.instance) {
      ScreenshotConfigManager.instance = new ScreenshotConfigManager();
    }
    return ScreenshotConfigManager.instance;
  }

  private loadConfig(): ScreenshotConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf-8');
        return { ...this.getDefaultConfig(), ...JSON.parse(configData) };
      }
    } catch (error) {
      console.warn('无法加载截图配置文件，使用默认配置:', error);
    }
    return this.getDefaultConfig();
  }

  private getDefaultConfig(): ScreenshotConfig {
    const projectRoot = process.cwd();
    return {
      screenshotsDirectory: path.join(projectRoot, 'screenshots'),
      enableFileVerification: true,
      enableAutoCleanup: true,
      retentionDays: 30,
      enableBackup: true,
      backupDirectory: path.join(projectRoot, 'screenshots', 'backup'),
      logLevel: 'info'
    };
  }

  public saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('保存截图配置文件失败:', error);
    }
  }

  public getConfig(): ScreenshotConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<ScreenshotConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  public getScreenshotsDirectory(): string {
    return this.config.screenshotsDirectory;
  }

  public getBackupDirectory(): string {
    return this.config.backupDirectory;
  }

  public isFileVerificationEnabled(): boolean {
    return this.config.enableFileVerification;
  }

  public shouldAutoCleanup(): boolean {
    return this.config.enableAutoCleanup;
  }

  public getRetentionDays(): number {
    return this.config.retentionDays;
  }

  public shouldBackup(): boolean {
    return this.config.enableBackup;
  }

  public getLogLevel(): string {
    return this.config.logLevel;
  }

  /** 确保截图目录存在 */
  public ensureScreenshotsDirectory(): void {
    try {
      if (!fs.existsSync(this.config.screenshotsDirectory)) {
        fs.mkdirSync(this.config.screenshotsDirectory, { recursive: true });
      }
      if (this.config.enableBackup && !fs.existsSync(this.config.backupDirectory)) {
        fs.mkdirSync(this.config.backupDirectory, { recursive: true });
      }
    } catch (error) {
      console.error('创建截图目录失败:', error);
    }
  }

  /** 获取相对于项目根目录的相对路径 */
  public getRelativePath(absolutePath: string): string {
    return path.relative(process.cwd(), absolutePath);
  }

  /** 获取绝对路径 */
  public getAbsolutePath(relativePath: string): string {
    return path.resolve(process.cwd(), relativePath);
  }

  /** 验证路径是否在截图目录内 */
  public isPathInScreenshotsDirectory(filePath: string): boolean {
    const normalizedPath = path.normalize(filePath);
    const normalizedScreenshotsDir = path.normalize(this.config.screenshotsDirectory);
    return normalizedPath.startsWith(normalizedScreenshotsDir);
  }
}

// 创建全局配置实例
export const screenshotConfig = ScreenshotConfigManager.getInstance();
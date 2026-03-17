export interface ScreenshotRecord {
  id?: number;
  runId: string;
  testCaseId?: number;
  stepIndex: string | number;
  stepDescription?: string;
  status: 'success' | 'failed' | 'error' | 'completed';
  filePath: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  createdAt?: Date;
  fileExists?: boolean;
}

export interface StorageStats {
  totalScreenshots: number;
  totalSize: number;
  avgFileSize: number;
  oldestScreenshot: Date;
  newestScreenshot: Date;
  missingFiles: number;
  // Enhanced statistics
  sizeByStatus: {
    success: number;
    failed: number;
    error: number;
    completed: number;
  };
  countByStatus: {
    success: number;
    failed: number;
    error: number;
    completed: number;
  };
  largestFile: {
    fileName: string;
    size: number;
    runId: string;
  } | null;
  smallestFile: {
    fileName: string;
    size: number;
    runId: string;
  } | null;
  recentActivity: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  };
  storageHealth: {
    healthScore: number; // 0-100, based on missing files ratio
    issues: string[];
    recommendations: string[];
  };
}

export interface ScreenshotQueryOptions {
  orderBy?: 'step_index' | 'created_at';
  orderDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export type ScreenshotStatus = 'success' | 'failed' | 'error' | 'completed';
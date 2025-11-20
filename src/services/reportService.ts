import axios from 'axios';

const API_BASE_URL = `http://${window.location.hostname}:3001/api/reports`;

// 类型定义
export interface BugStats {
  totalBugs: number;
  passedCases: number;
  successRate: number;
  avgDuration: number;
  trend: {
    bugsChange: number;
    passedChange: number;
    successRateChange: number;
    durationChange: number;
  };
}

export interface TrendDataPoint {
  date: string;
  bugCount: number;
  caseCount: number;
}

export interface FailureReason {
  category: string;
  categoryName: string;
  count: number;
  percentage: number;
}

export interface FlakyTest {
  caseId: number;
  caseName: string;
  suiteName: string;
  totalRuns: number;
  failures: number;
  failureRate: number;
  lastFailure: string | null;
  severity: 'high' | 'medium' | 'low';
}

export interface FailedCase {
  id: number;
  timestamp: string;
  caseName: string;
  suiteName: string;
  executor: string;
  failureReason: string;
  errorCategory: string;
  screenshotUrl?: string;
  hasLogs: boolean;
}

export interface SuiteSummary {
  suiteId: number;
  suiteName: string;
  executions: number;
  successRate: number;
  bugCount: number;
  avgDuration: number;
  trend: 'up' | 'down' | 'stable';
}

class ReportService {
  /**
   * 获取BUG统计KPI
   */
  async getBugStats(params: {
    startDate: string;
    endDate: string;
    department?: string;
    suiteId?: number | string;
  }): Promise<BugStats> {
    try {
      const response = await axios.get(`${API_BASE_URL}/bug-stats`, {
        params,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      return response.data.data;
    } catch (error) {
      console.error('获取BUG统计失败:', error);
      throw error;
    }
  }

  /**
   * 获取BUG趋势
   */
  async getBugTrend(params: {
    startDate: string;
    endDate: string;
    department?: string;
    suiteId?: number | string;
    granularity?: 'day' | 'week';
  }): Promise<TrendDataPoint[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/bug-trend`, {
        params,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      return response.data.data;
    } catch (error) {
      console.error('获取BUG趋势失败:', error);
      throw error;
    }
  }

  /**
   * 获取失败原因分布
   */
  async getFailureReasons(params: {
    startDate: string;
    endDate: string;
    department?: string;
    suiteId?: number | string;
  }): Promise<FailureReason[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/failure-reasons`, {
        params,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      return response.data.data;
    } catch (error) {
      console.error('获取失败原因分布失败:', error);
      throw error;
    }
  }

  /**
   * 获取不稳定用例Top 10
   */
  async getFlakyTests(params: {
    startDate: string;
    endDate: string;
    department?: string;
    suiteId?: number | string;
    limit?: number;
  }): Promise<FlakyTest[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/flaky-tests`, {
        params,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      return response.data.data;
    } catch (error) {
      console.error('获取不稳定用例失败:', error);
      throw error;
    }
  }

  /**
   * 获取失败用例列表
   */
  async getFailedCases(params: {
    startDate: string;
    endDate: string;
    department?: string;
    suiteId?: number | string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    records: FailedCase[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    try {
      const response = await axios.get(`${API_BASE_URL}/failed-cases`, {
        params,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      return response.data.data;
    } catch (error) {
      console.error('获取失败用例列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取套件统计
   */
  async getSuiteSummary(params: {
    startDate: string;
    endDate: string;
    department?: string;
  }): Promise<SuiteSummary[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/suite-summary`, {
        params,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      return response.data.data;
    } catch (error) {
      console.error('获取套件统计失败:', error);
      throw error;
    }
  }
}

export const reportService = new ReportService();

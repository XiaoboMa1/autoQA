// 🔥 使用全局配置的 axios 实例（自动添加认证头）
import apiClient from '../utils/axios';
// 🔥 使用统一的 API 配置
import { getApiBaseUrl } from '../config/api';
const API_BASE_URL = getApiBaseUrl('/api');

// Dashboard统计数据接口
export interface DashboardStats {
  successRate: number;
  todayExecutions: number;
  averageDuration: number;
  weeklyFailures: number;
}

// 成功率趋势数据
export interface TrendData {
  x: string; // 日期
  y: number; // 成功率
}

// 最近活动
export interface RecentActivity {
  id: number;
  description: string;
  timestamp: string;
  status: 'success' | 'error' | 'info';
  user: string;
}

// 失败热力图数据
export interface FailureHeatmapData {
  x: string; // 日期
  y: string; // 测试用例名称
  value: number; // 失败次数
}

// 时长分布数据
export interface DurationDistributionData {
  range: string;
  count: number;
}

// 不稳定用例数据
export interface FlakyTest {
  id: number;
  name: string;
  failureRate: number;
  totalRuns: number;
  lastFailure: string;
  severity: 'high' | 'medium' | 'low';
}

class DashboardService {
  /**
   * 获取Dashboard统计数据
   */
  async getStats(): Promise<DashboardStats> {
    try {
      const response = await apiClient.get(`${API_BASE_URL}/dashboard/stats`);
      return response.data.data;
    } catch (error) {
      console.error('获取Dashboard统计数据失败:', error);
      // 返回默认值
      return {
        successRate: 0,
        todayExecutions: 0,
        averageDuration: 0,
        weeklyFailures: 0,
      };
    }
  }

  /**
   * 获取成功率趋势数据 (近7天)
   */
  async getTrend(days: number = 7): Promise<TrendData[]> {
    try {
      const response = await apiClient.get(`${API_BASE_URL}/dashboard/trend`, {
        params: { days }
      });
      return response.data.data;
    } catch (error) {
      console.error('获取趋势数据失败:', error);
      return [];
    }
  }

  /**
   * 获取最近活动
   */
  async getRecentActivities(limit: number = 10): Promise<RecentActivity[]> {
    try {
      const response = await apiClient.get(`${API_BASE_URL}/dashboard/activities`, {
        params: { limit }
      });
      return response.data.data;
    } catch (error) {
      console.error('获取最近活动失败:', error);
      return [];
    }
  }

  /**
   * 获取失败热力图数据
   */
  async getFailureHeatmap(days: number = 7): Promise<FailureHeatmapData[]> {
    try {
      const response = await apiClient.get(`${API_BASE_URL}/dashboard/failure-heatmap`, {
        params: { days }
      });
      return response.data.data;
    } catch (error) {
      console.error('获取失败热力图数据失败:', error);
      return [];
    }
  }

  /**
   * 获取执行时长分布
   */
  async getDurationDistribution(): Promise<DurationDistributionData[]> {
    try {
      const response = await apiClient.get(`${API_BASE_URL}/dashboard/duration-distribution`);
      return response.data.data;
    } catch (error) {
      console.error('获取时长分布数据失败:', error);
      return [];
    }
  }

  /**
   * 获取不稳定用例排名
   */
  async getFlakyTests(limit: number = 5): Promise<FlakyTest[]> {
    try {
      const response = await apiClient.get(`${API_BASE_URL}/dashboard/flaky-tests`, {
        params: { limit }
      });
      return response.data.data;
    } catch (error) {
      console.error('获取不稳定用例失败:', error);
      return [];
    }
  }
}

export const dashboardService = new DashboardService();

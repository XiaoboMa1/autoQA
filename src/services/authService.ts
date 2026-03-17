import axios from 'axios';
// 🔥 使用全局配置的 axios 实例（自动添加认证头）
import apiClient from '../utils/axios';
// 🔥 使用统一的 API 配置
import { getApiBaseUrl } from '../config/api';
const API_BASE_URL = import.meta.env.VITE_API_URL || getApiBaseUrl('');
const TOKEN_KEY = 'authToken';

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  accountName: string | null;
  project: string | null; // 🔥 修复：使用 project 字段
  isSuperAdmin: boolean;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
}

class AuthService {
  private token: string | null = null;

  constructor() {
    // 初始化时从localStorage加载token
    this.token = localStorage.getItem(TOKEN_KEY);
  }

  /**
   * 用户登录
   */
  async login(username: string, password: string): Promise<LoginResponse> {
    try {
      const response = await axios.post<{ success: boolean; data: LoginResponse; error?: string }>(
        `${API_BASE_URL}/api/auth/login`,
        { username, password }
      );

      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || '登录失败');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('登录失败，请检查网络连接');
    }
  }

  /**
   * 用户登出
   * 注意：使用 apiClient 会自动添加认证头
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post(`${API_BASE_URL}/api/auth/logout`, {});
    } catch (error) {
      console.error('登出请求失败:', error);
    }
  }

  /**
   * 获取当前用户信息
   * 注意：使用 apiClient 会自动添加认证头
   */
  async getCurrentUser(): Promise<AuthUser> {
    try {
      const response = await apiClient.get<{ success: boolean; data: AuthUser; error?: string }>(
        `${API_BASE_URL}/api/auth/me`
      );

      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || '获取用户信息失败');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('获取用户信息失败');
    }
  }

  /**
   * 修改密码
   * 注意：使用 apiClient 会自动添加认证头
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    try {
      const response = await apiClient.post<{ success: boolean; message?: string; error?: string }>(
        `${API_BASE_URL}/api/auth/change-password`,
        { oldPassword, newPassword }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || '修改密码失败');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('修改密码失败');
    }
  }

  /**
   * 设置token
   */
  setToken(token: string): void {
    this.token = token;
    localStorage.setItem(TOKEN_KEY, token);
  }

  /**
   * 获取token
   */
  getToken(): string | null {
    return this.token || localStorage.getItem(TOKEN_KEY);
  }

  /**
   * 清除token
   */
  clearToken(): void {
    this.token = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  /**
   * 获取认证请求头
   * 注意：现在使用全局 apiClient，此方法已废弃，保留用于向后兼容
   * @deprecated 使用 apiClient 会自动添加认证头，无需手动调用此方法
   */
  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    if (token) {
      return {
        Authorization: `Bearer ${token}`
      };
    }
    return {};
  }
}

export const authService = new AuthService();

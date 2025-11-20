import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;
const TOKEN_KEY = 'authToken';

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  accountName: string | null;
  department: string | null;
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
   */
  async logout(): Promise<void> {
    try {
      await axios.post(
        `${API_BASE_URL}/api/auth/logout`,
        {},
        {
          headers: this.getAuthHeaders()
        }
      );
    } catch (error) {
      console.error('登出请求失败:', error);
    }
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(): Promise<AuthUser> {
    try {
      const response = await axios.get<{ success: boolean; data: AuthUser; error?: string }>(
        `${API_BASE_URL}/api/auth/me`,
        {
          headers: this.getAuthHeaders()
        }
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
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    try {
      const response = await axios.post<{ success: boolean; message?: string; error?: string }>(
        `${API_BASE_URL}/api/auth/change-password`,
        { oldPassword, newPassword },
        {
          headers: this.getAuthHeaders()
        }
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

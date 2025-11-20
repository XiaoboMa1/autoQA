import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:3001/api`;
const TOKEN_KEY = 'authToken';

export interface User {
  id: number;
  email: string;
  username: string;
  accountName?: string;
  department?: string;
  isSuperAdmin: boolean;
  createdAt: string;
}

export interface CreateUserDto {
  email: string;
  username: string;
  password: string;
  accountName?: string;
  department?: string;
  isSuperAdmin: boolean;
}

export interface UpdateUserDto {
  email: string;
  username: string;
  accountName?: string;
  department?: string;
  isSuperAdmin: boolean;
}

class UserService {
  private baseUrl = `${API_BASE_URL}/users`;

  // 获取认证请求头
  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      return {
        Authorization: `Bearer ${token}`
      };
    }
    return {};
  }

  // 获取所有用户
  async getAllUsers(): Promise<User[]> {
    try {
      const headers = this.getAuthHeaders();
      console.log('🔍 获取用户列表 - Headers:', headers);
      console.log('🔍 API URL:', this.baseUrl);

      const response = await axios.get<User[]>(this.baseUrl, {
        headers
      });

      console.log('✅ 获取用户列表成功:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ 获取用户列表失败:', error);
      if (error.response) {
        console.error('响应状态:', error.response.status);
        console.error('响应数据:', error.response.data);
      }
      throw error;
    }
  }

  // 获取单个用户
  async getUserById(id: number): Promise<User> {
    const response = await axios.get<User>(`${this.baseUrl}/${id}`, {
      headers: this.getAuthHeaders()
    });
    return response.data;
  }

  // 创建用户
  async createUser(data: CreateUserDto): Promise<User> {
    const response = await axios.post<User>(this.baseUrl, data, {
      headers: this.getAuthHeaders()
    });
    return response.data;
  }

  // 更新用户
  async updateUser(id: number, data: UpdateUserDto): Promise<User> {
    const response = await axios.put<User>(`${this.baseUrl}/${id}`, data, {
      headers: this.getAuthHeaders()
    });
    return response.data;
  }

  // 删除用户
  async deleteUser(id: number): Promise<void> {
    await axios.delete(`${this.baseUrl}/${id}`, {
      headers: this.getAuthHeaders()
    });
  }

  // 修改密码
  async changePassword(id: number, newPassword: string): Promise<void> {
    await axios.put(`${this.baseUrl}/${id}/password`,
      { newPassword },
      {
        headers: this.getAuthHeaders()
      }
    );
  }
}

export const userService = new UserService();

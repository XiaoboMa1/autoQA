/**
 * 全局 Axios 配置
 * 自动为所有请求添加认证头
 */
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const TOKEN_KEY = 'authToken';

// 创建 axios 实例
const apiClient: AxiosInstance = axios.create({
  timeout: 30000, // 30秒超时
  headers: {
    'Content-Type': 'application/json'
  }
});

// 🔥 请求拦截器：自动添加认证头
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 从 localStorage 获取 token
    const token = localStorage.getItem(TOKEN_KEY);
    
    // 如果存在 token，自动添加到请求头
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 🔥 响应拦截器：统一处理错误
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // 处理 401 未授权错误
    if (error.response?.status === 401) {
      // 清除 token
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('authUser');
      
      // 跳转到登录页（如果不在登录页）
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;


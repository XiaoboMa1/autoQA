/**
 * 需求文档服务
 */

import { getApiBaseUrl } from '../config/api';

const API_BASE_URL = getApiBaseUrl('/api/v1');
const TOKEN_KEY = 'authToken';

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// 处理响应
const handleResponse = async (response: Response) => {
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('authUser');
    alert('登录已过期，请重新登录');
    window.location.href = '/login';
    throw new Error('认证失败，请重新登录');
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `请求失败: ${response.status}`);
  }
  return response.json();
};

/**
 * 需求文档接口
 */
export interface RequirementDoc {
  id: number;
  title: string;
  content: string;
  summary?: string;
  source_filename?: string;
  ai_session_id?: string;
  project_id?: number;
  project_version_id?: number;
  creator_id: number;
  scenario_count: number;
  test_case_count: number;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  created_at: string;
  updated_at: string;
  system?: string;  // 🆕 系统名称
  module?: string;  // 🆕 模块名称
  users?: {
    id: number;
    username: string;
  };
  project?: {
    id: number;
    name: string;
    short_name?: string;  // 🆕 项目简称
  };
  project_version?: {
    id: number;
    version_name: string;
    version_code: string;
  };
  test_cases?: Array<{
    id: number;
    case_id: number;
    name: string;
    section_name?: string;
    test_point_name?: string;
    priority: string;
    status: string;
    source: string;
    created_at: string;
  }>;
}

/**
 * 列表查询参数
 */
export interface RequirementDocListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  projectId?: number;
  projectVersionId?: number;
  module?: string;
  status?: string;
  creatorId?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * 创建需求文档参数
 */
export interface CreateRequirementDocParams {
  title: string;
  content: string;
  summary?: string;
  sourceFilename?: string;
  aiSessionId?: string;
  projectId?: number;
  projectVersionId?: number;
  scenarioCount?: number;
  system?: string;  // 🆕 系统名称
  module?: string;  // 🆕 模块名称
}

/**
 * 更新需求文档参数
 */
export interface UpdateRequirementDocParams {
  title?: string;
  content?: string;
  summary?: string;
  projectId?: number;
  projectVersionId?: number;
  status?: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  system?: string;  // 🆕 系统名称
  module?: string;  // 🆕 模块名称
}

/**
 * 需求文档服务类
 */
class RequirementDocServiceClass {
  /**
   * 获取需求文档列表
   */
  async getList(params: RequirementDocListParams = {}): Promise<{
    data: RequirementDoc[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.projectId) queryParams.append('projectId', params.projectId.toString());
    if (params.projectVersionId) queryParams.append('projectVersionId', params.projectVersionId.toString());
    if (params.module) queryParams.append('module', params.module);
    if (params.status) queryParams.append('status', params.status);
    if (params.creatorId) queryParams.append('creatorId', params.creatorId.toString());
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const response = await fetch(
      `${API_BASE_URL}/requirement-docs?${queryParams.toString()}`,
      { headers: getAuthHeaders() }
    );
    
    const result = await handleResponse(response);
    return {
      data: result.data,
      pagination: result.pagination
    };
  }

  /**
   * 获取需求文档详情
   */
  async getById(id: number): Promise<RequirementDoc> {
    const response = await fetch(
      `${API_BASE_URL}/requirement-docs/${id}`,
      { headers: getAuthHeaders() }
    );
    
    const result = await handleResponse(response);
    return result.data;
  }

  /**
   * 创建需求文档
   */
  async create(params: CreateRequirementDocParams): Promise<RequirementDoc> {
    // 🔍 调试：打印发送的参数
    console.log('📤 [前端] 创建需求文档，发送参数:', {
      system: params.system,
      module: params.module,
      projectId: params.projectId,
      title: params.title?.substring(0, 50) + '...'
    });
    
    const response = await fetch(`${API_BASE_URL}/requirement-docs`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params)
    });
    
    const result = await handleResponse(response);
    console.log('✅ [前端] 需求文档创建成功，返回数据:', {
      id: result.data.id,
      system: result.data.system,
      module: result.data.module
    });
    return result.data;
  }

  /**
   * 更新需求文档
   */
  async update(id: number, params: UpdateRequirementDocParams): Promise<RequirementDoc> {
    // 🔍 调试：打印发送的参数
    console.log('📤 [前端] 更新需求文档，发送参数:', {
      id,
      system: params.system,
      module: params.module,
      projectId: params.projectId,
      title: params.title?.substring(0, 50)
    });
    
    const response = await fetch(`${API_BASE_URL}/requirement-docs/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(params)
    });
    
    const result = await handleResponse(response);
    console.log('✅ [前端] 需求文档更新成功，返回数据:', {
      id: result.data.id,
      system: result.data.system,
      module: result.data.module
    });
    return result.data;
  }

  /**
   * 删除需求文档
   */
  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/requirement-docs/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    
    await handleResponse(response);
  }

  /**
   * 批量删除需求文档
   */
  async batchDelete(ids: number[]): Promise<{ successCount: number; failCount: number; message: string }> {
    const response = await fetch(`${API_BASE_URL}/requirement-docs/batch-delete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids })
    });
    
    return await handleResponse(response);
  }

  /**
   * 归档需求文档
   */
  async archive(id: number): Promise<RequirementDoc> {
    const response = await fetch(`${API_BASE_URL}/requirement-docs/${id}/archive`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    
    const result = await handleResponse(response);
    return result.data;
  }

  /**
   * 恢复需求文档
   */
  async restore(id: number): Promise<RequirementDoc> {
    const response = await fetch(`${API_BASE_URL}/requirement-docs/${id}/restore`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    
    const result = await handleResponse(response);
    return result.data;
  }

  /**
   * 获取关联的测试用例
   */
  async getTestCases(id: number, page: number = 1, pageSize: number = 20): Promise<{
    data: any[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const response = await fetch(
      `${API_BASE_URL}/requirement-docs/${id}/test-cases?page=${page}&pageSize=${pageSize}`,
      { headers: getAuthHeaders() }
    );
    
    const result = await handleResponse(response);
    return {
      data: result.data,
      pagination: result.pagination
    };
  }
}

export const requirementDocService = new RequirementDocServiceClass();
export default requirementDocService;


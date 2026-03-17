// 测试计划前端服务
import apiClient from '../utils/axios';
import type {
  TestPlan,
  CreateTestPlanInput,
  UpdateTestPlanInput,
  TestPlanCase,
  AddCasesToPlanInput,
  TestPlanExecution,
  StartTestPlanExecutionInput,
  TestPlanListQuery,
  TestPlanListResponse,
  TestPlanDetailResponse,
} from '../types/testPlan';

const API_BASE_URL = '/api/v1/test-plans';

/**
 * 获取测试计划列表
 */
export async function getTestPlans(query?: TestPlanListQuery): Promise<TestPlanListResponse> {
  const response = await apiClient.get(API_BASE_URL, { params: query });
  return response.data;
}

/**
 * 获取测试计划详情
 */
export async function getTestPlanDetail(planId: number): Promise<TestPlanDetailResponse> {
  const response = await apiClient.get(`${API_BASE_URL}/${planId}`);
  return response.data;
}

/**
 * 创建测试计划
 */
export async function createTestPlan(input: CreateTestPlanInput): Promise<TestPlan> {
  const response = await apiClient.post(API_BASE_URL, input);
  return response.data;
}

/**
 * 更新测试计划
 */
export async function updateTestPlan(planId: number, input: UpdateTestPlanInput): Promise<TestPlan> {
  const response = await apiClient.put(`${API_BASE_URL}/${planId}`, input);
  return response.data;
}

/**
 * 删除测试计划
 */
export async function deleteTestPlan(planId: number): Promise<void> {
  await apiClient.delete(`${API_BASE_URL}/${planId}`);
}

/**
 * 添加用例到测试计划
 */
export async function addCasesToPlan(planId: number, cases: AddCasesToPlanInput['cases']): Promise<TestPlanCase[]> {
  const response = await apiClient.post(`${API_BASE_URL}/${planId}/cases`, { cases });
  return response.data;
}

/**
 * 从测试计划中移除用例
 */
export async function removeCaseFromPlan(planId: number, caseId: number, caseType: string): Promise<void> {
  await apiClient.delete(`${API_BASE_URL}/${planId}/cases/${caseId}`, {
    params: { caseType },
  });
}

/**
 * 开始执行测试计划
 */
export async function startTestPlanExecution(input: StartTestPlanExecutionInput): Promise<TestPlanExecution> {
  const response = await apiClient.post(`${API_BASE_URL}/${input.plan_id}/execute`, input);
  return response.data;
}

/**
 * 更新测试计划执行状态
 */
export async function updateTestPlanExecution(executionId: string, update: any): Promise<TestPlanExecution> {
  const response = await apiClient.put(`${API_BASE_URL}/executions/${executionId}`, update);
  return response.data;
}

/**
 * 更新测试计划用例执行状态
 */
export async function updateTestPlanCaseStatus(
  planId: number,
  caseId: number,
  caseType: string,
  result: string
): Promise<void> {
  await apiClient.put(`${API_BASE_URL}/${planId}/cases/${caseId}/status`, {
    case_type: caseType,
    result,
  });
}

/**
 * 获取测试计划的执行历史
 */
export async function getTestPlanExecutions(planId: number): Promise<TestPlanExecution[]> {
  const response = await apiClient.get(`${API_BASE_URL}/${planId}/executions`);
  return response.data;
}

/**
 * 获取测试计划执行记录的详细信息
 */
export async function getTestPlanExecutionDetail(executionId: string): Promise<TestPlanExecution> {
  const response = await apiClient.get(`${API_BASE_URL}/executions/${executionId}/detail`);
  return response.data;
}

/**
 * 删除测试计划执行记录
 */
export async function deleteTestPlanExecution(executionId: string): Promise<void> {
  await apiClient.delete(`${API_BASE_URL}/executions/${executionId}`);
}

export const testPlanService = {
  getTestPlans,
  getTestPlanDetail,
  createTestPlan,
  updateTestPlan,
  deleteTestPlan,
  addCasesToPlan,
  removeCaseFromPlan,
  startTestPlanExecution,
  updateTestPlanExecution,
  updateTestPlanCaseStatus,
  getTestPlanExecutions,
  getTestPlanExecutionDetail,
  deleteTestPlanExecution,
};


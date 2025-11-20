import { PrismaClient } from '../../src/generated/prisma/index.js';
import { DatabaseService } from './databaseService.js';

/**
 * 列表查询参数
 */
export interface ListParams {
  page: number;
  pageSize: number;
  search?: string;
  tag?: string;
  priority?: string;
  status?: string;
  system?: string;
  module?: string;
  source?: string;
  sectionName?: string;
  createdBy?: string;
  startDate?: string;
  endDate?: string;
  riskLevel?: string;
  userDepartment?: string;
  isSuperAdmin?: boolean;
}

/**
 * 批量保存参数
 */
export interface BatchSaveParams {
  testCases: any[];
  aiSessionId: string;
  userId: number;
}

/**
 * 功能测试用例服务
 * 提供功能测试用例的CRUD操作
 */
export class FunctionalTestCaseService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = DatabaseService.getInstance().getClient();
  }

  /**
   * 获取功能测试用例列表（分页）
   */
  async getList(params: ListParams) {
    const {
      page,
      pageSize,
      search,
      tag,
      priority,
      status,
      system,
      module,
      source,
      userDepartment,
      isSuperAdmin
    } = params;

    // 构建查询条件
    const where: any = {};

    // 搜索条件
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } }
      ];
    }

    // 筛选条件
    if (system) where.system = system;
    if (module) where.module = module;
    if (priority) where.priority = priority;
    if (status) where.status = status;
    if (source) where.source = source;

    // 标签筛选
    if (tag) {
      where.tags = { contains: tag };
    }

    // 数据隔离：非超级管理员只能看到本部门数据
    if (!isSuperAdmin && userDepartment) {
      where.users = { department: userDepartment };
    }

    try {
      console.log('📊 查询条件:', JSON.stringify(where, null, 2));
      console.log('👤 用户信息 - 部门:', userDepartment, '超级管理员:', isSuperAdmin);

      // 分页查询
      const [data, total] = await Promise.all([
        this.prisma.functional_test_cases.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { created_at: 'desc' },
          include: {
            users: {
              select: {
                username: true,
                department: true,
                account_name: true
              }
            }
          }
        }),
        this.prisma.functional_test_cases.count({ where })
      ]);

      console.log(`✅ 查询结果: 找到 ${total} 条记录，返回 ${data.length} 条`);
      return { data, total };
    } catch (error: any) {
      console.error('❌ 查询功能测试用例失败:', error);
      throw new Error(`查询功能测试用例失败: ${error.message}`);
    }
  }

  /**
   * 获取功能测试用例平铺列表（以测试点为维度展示）
   * 每个测试点占据一行，一个测试用例如果有12个测试点就会展示12行
   * 新版：直接从 functional_test_points 表查询
   */
  async getFlatList(params: ListParams) {
    const {
      page,
      pageSize,
      search,
      tag,
      priority,
      status,
      system,
      module,
      source,
      sectionName,
      createdBy,
      startDate,
      endDate,
      riskLevel,
      userDepartment,
      isSuperAdmin
    } = params;

    // 构建测试用例查询条件
    const caseWhere: any = {};

    if (search) {
      caseWhere.OR = [
        { name: { contains: search } },
        { description: { contains: search } }
      ];
    }

    if (system) caseWhere.system = system;
    if (module) caseWhere.module = module;
    if (priority) caseWhere.priority = priority;
    if (status) caseWhere.status = status;
    if (source) caseWhere.source = source;
    if (sectionName) caseWhere.section_name = { contains: sectionName };

    if (tag) {
      caseWhere.tags = { contains: tag };
    }

    // 创建人筛选
    if (createdBy) {
      caseWhere.users = {
        username: { contains: createdBy }
      };
    }

    // 创建时间范围筛选
    if (startDate || endDate) {
      caseWhere.created_at = {};
      if (startDate) {
        caseWhere.created_at.gte = new Date(startDate);
      }
      if (endDate) {
        // 结束日期包含当天，设置为23:59:59
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        caseWhere.created_at.lte = endDateTime;
      }
    }

    // 数据隔离
    if (!isSuperAdmin && userDepartment) {
      // 如果已经设置了用户筛选，需要合并
      if (caseWhere.users) {
        caseWhere.users.department = userDepartment;
      } else {
        caseWhere.users = { department: userDepartment };
      }
    }

    // 构建测试点查询条件
    const pointWhere: any = {};
    if (riskLevel) {
      pointWhere.risk_level = riskLevel;
    }

    try {
      console.log('📊 平铺查询条件:', JSON.stringify(caseWhere, null, 2));
      console.log('📊 测试点查询条件:', JSON.stringify(pointWhere, null, 2));

      // 方式1：直接查询测试点表，JOIN 测试用例表（更高效）
      // 查询所有测试点，带上测试用例信息
      const testPoints = await this.prisma.functional_test_points.findMany({
        where: {
          functional_test_case: caseWhere,
          ...pointWhere
        },
        orderBy: [
          { functional_test_case: { created_at: 'desc' } },
          { test_point_index: 'asc' }
        ],
        include: {
          functional_test_case: {
            include: {
              users: {
                select: {
                  username: true,
                  department: true,
                  account_name: true
                }
              }
            }
          }
        }
      });

      // 转换为平铺行格式
      const flatRows = testPoints.map(point => {
        const testCase = point.functional_test_case;
        return {
          // 测试点ID（用于唯一标识）
          test_point_id: point.id,

          // 测试用例信息
          id: testCase.id,
          name: testCase.name,
          description: testCase.description,
          system: testCase.system,
          module: testCase.module,
          priority: testCase.priority,
          status: testCase.status,
          section_id: testCase.section_id,
          section_name: testCase.section_name,
          tags: testCase.tags,
          created_at: testCase.created_at,
          users: testCase.users,

          // 测试点信息
          test_point_index: point.test_point_index,
          test_purpose: point.test_purpose, // 🆕 测试目的
          test_point_name: point.test_point_name,
          test_point_steps: point.steps,
          test_point_expected_result: point.expected_result,
          test_point_risk_level: point.risk_level,

          // 总测试点数（需要额外计算，这里先设为0，后续补充）
          total_test_points: 0
        };
      });

      // 计算每个测试用例的总测试点数
      const casePointCounts = new Map<number, number>();
      flatRows.forEach(row => {
        casePointCounts.set(row.id, (casePointCounts.get(row.id) || 0) + 1);
      });

      // 填充总测试点数
      flatRows.forEach(row => {
        row.total_test_points = casePointCounts.get(row.id) || 0;
      });

      // 对平铺后的数据进行分页
      const total = flatRows.length;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedRows = flatRows.slice(startIndex, endIndex);

      console.log(`✅ 平铺查询结果: 找到 ${total} 条测试点记录，返回第 ${page} 页 ${paginatedRows.length} 行`);

      return {
        data: paginatedRows,
        total,
        pagination: {
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
          total
        }
      };
    } catch (error: any) {
      console.error('❌ 平铺查询功能测试用例失败:', error);
      throw new Error(`平铺查询功能测试用例失败: ${error.message}`);
    }
  }

  /**
   * 手动创建测试用例（含测试点）
   */
  async create(data: any, userId: number) {
    console.log(`✨ 创建功能测试用例: ${data.name}, 用户ID: ${userId}`);
    console.log(`📝 包含 ${data.testPoints?.length || 0} 个测试点`);

    try {
      // 使用事务确保数据一致性
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. 创建测试用例主体
        const testCase = await tx.functional_test_cases.create({
          data: {
            name: data.name,
            description: data.description || '',
            system: data.system || '',
            module: data.module || '',
            priority: data.priority || 'medium',
            status: data.status || 'DRAFT',
            tags: data.tags || '',
            source: 'MANUAL',
            creator_id: userId,
            test_type: data.testType || '',
            preconditions: data.preconditions || '',
            test_data: data.testData || '',
            section_name: data.sectionName || '',
            coverage_areas: data.coverageAreas || ''
          }
        });

        console.log(`  ✓ 测试用例已创建，ID: ${testCase.id}`);

        // 2. 创建关联的测试点
        if (data.testPoints && Array.isArray(data.testPoints) && data.testPoints.length > 0) {
          for (let i = 0; i < data.testPoints.length; i++) {
            const point = data.testPoints[i];
            await tx.functional_test_points.create({
              data: {
                test_case_id: testCase.id,
                test_point_index: i + 1,
                test_purpose: point.testPurpose || '',
                test_point_name: point.testPointName,
                steps: point.steps,
                expected_result: point.expectedResult,
                risk_level: point.riskLevel || 'medium'
              }
            });
          }
          console.log(`  ✓ 已创建 ${data.testPoints.length} 个测试点`);
        }

        // 3. 查询完整数据（含测试点）返回
        const completeTestCase = await tx.functional_test_cases.findUnique({
          where: { id: testCase.id },
          include: {
            functional_test_points: {
              orderBy: { test_point_index: 'asc' }
            },
            users: {
              select: {
                username: true,
                account_name: true,
                department: true
              }
            }
          }
        });

        console.log(`✅ 测试用例创建完成: ${testCase.id}`);
        return completeTestCase;
      });

      return result;
    } catch (error: any) {
      console.error('❌ 创建测试用例失败:', error);
      throw new Error(`创建测试用例失败: ${error.message}`);
    }
  }

  /**
   * 批量保存测试用例（新版：测试点独立存储）
   */
  async batchSave(params: BatchSaveParams) {
    const { testCases, aiSessionId, userId } = params;

    console.log(`📦 开始批量保存 ${testCases.length} 个功能测试用例`);
    console.log(`📝 会话ID: ${aiSessionId}, 用户ID: ${userId}`);
    console.log(`📄 第一个用例示例:`, JSON.stringify(testCases[0], null, 2));

    try {
      // 使用事务确保数据一致性
      const result = await this.prisma.$transaction(async (tx) => {
        let savedCount = 0;
        let totalTestPoints = 0;

        // 逐个保存测试用例及其测试点
        for (const tc of testCases) {
          // 1. 保存测试用例主体
          const savedCase = await tx.functional_test_cases.create({
            data: {
              name: tc.name,
              description: tc.testPurpose || tc.description || '',
              system: tc.system,
              module: tc.module,
              priority: tc.priority || 'medium',
              tags: Array.isArray(tc.tags) ? tc.tags.join(',') : tc.tags || '',
              status: 'PUBLISHED',
              source: 'AI_GENERATED',
              ai_session_id: aiSessionId,
              creator_id: userId,
              test_type: tc.testType,
              preconditions: tc.preconditions,
              test_data: tc.testData,
              section_id: tc.sectionId,
              section_name: tc.sectionName,
              batch_number: tc.batchNumber || 0,
              coverage_areas: tc.coverageAreas
            }
          });

          savedCount++;

          // 2. 保存该用例的所有测试点
          if (tc.testPoints && Array.isArray(tc.testPoints) && tc.testPoints.length > 0) {
            for (let i = 0; i < tc.testPoints.length; i++) {
              const point = tc.testPoints[i];
              await tx.functional_test_points.create({
                data: {
                  test_case_id: savedCase.id,
                  test_point_index: i + 1,
                  test_purpose: point.testPurpose || tc.testPurpose || '', // 🆕 保存测试目的
                  test_point_name: point.testPoint || '',
                  steps: point.steps || '',
                  expected_result: point.expectedResult || '',
                  risk_level: point.riskLevel || 'medium'
                }
              });
              totalTestPoints++;
            }
            console.log(`  ✓ 用例 "${tc.name}" 已保存，包含 ${tc.testPoints.length} 个测试点`);
          } else {
            console.log(`  ✓ 用例 "${tc.name}" 已保存（无测试点）`);
          }
        }

        // 3. 更新会话统计
        await tx.ai_generation_sessions.update({
          where: { id: aiSessionId },
          data: { total_saved: savedCount }
        });

        console.log(`✅ 成功保存 ${savedCount} 个测试用例，${totalTestPoints} 个测试点`);
        return { count: savedCount, testPointsCount: totalTestPoints };
      });

      return result;
    } catch (error: any) {
      console.error('❌ 批量保存失败:', error);
      throw new Error(`批量保存失败: ${error.message}`);
    }
  }

  /**
   * 获取测试用例详情
   */
  async getById(id: number) {
    try {
      return await this.prisma.functional_test_cases.findUnique({
        where: { id },
        include: {
          users: {
            select: {
              username: true,
              account_name: true,
              department: true
            }
          }
        }
      });
    } catch (error: any) {
      console.error('❌ 查询测试用例详情失败:', error);
      throw new Error(`查询测试用例详情失败: ${error.message}`);
    }
  }

  /**
   * 更新测试用例
   */
  async update(id: number, data: any) {
    console.log(`📝 更新功能测试用例 ID: ${id}`);

    try {
      // 构建更新数据对象
      const updateData: any = {
        name: data.name,
        description: data.description,
        steps: data.steps,
        assertions: data.assertions,
        system: data.system,
        module: data.module,
        priority: data.priority,
        tags: data.tags,
        test_type: data.testType,
        preconditions: data.preconditions,
        test_data: data.testData,
        updated_at: new Date()
      };

      // 如果有新字段，也一并更新
      if (data.testPoints !== undefined) {
        updateData.test_points = data.testPoints;
        updateData.test_points_count = data.testPoints ? data.testPoints.length : 0;
      }
      if (data.sectionId !== undefined) updateData.section_id = data.sectionId;
      if (data.sectionName !== undefined) updateData.section_name = data.sectionName;
      if (data.batchNumber !== undefined) updateData.batch_number = data.batchNumber;
      if (data.coverageAreas !== undefined) updateData.coverage_areas = data.coverageAreas;

      return await this.prisma.functional_test_cases.update({
        where: { id },
        data: updateData
      });
    } catch (error: any) {
      console.error('❌ 更新测试用例失败:', error);
      throw new Error(`更新测试用例失败: ${error.message}`);
    }
  }

  /**
   * 删除测试用例
   */
  async delete(id: number) {
    console.log(`🗑️  删除功能测试用例 ID: ${id}`);

    try {
      return await this.prisma.functional_test_cases.delete({
        where: { id }
      });
    } catch (error: any) {
      console.error('❌ 删除测试用例失败:', error);
      throw new Error(`删除测试用例失败: ${error.message}`);
    }
  }

  /**
   * 批量删除测试点
   */
  async batchDeleteTestPoints(testPointIds: number[]) {
    console.log(`🗑️  批量删除测试点，数量: ${testPointIds.length}`);

    try {
      // 使用事务批量删除
      const result = await this.prisma.functional_test_points.deleteMany({
        where: {
          id: {
            in: testPointIds
          }
        }
      });

      console.log(`✅ 成功删除 ${result.count} 个测试点`);

      return {
        deletedCount: result.count
      };
    } catch (error: any) {
      console.error('❌ 批量删除测试点失败:', error);
      throw new Error(`批量删除测试点失败: ${error.message}`);
    }
  }

  /**
   * 获取测试点详情（含关联用例信息）
   */
  async getTestPointById(id: number) {
    console.log(`📋 查询测试点详情，ID: ${id}`);

    try {
      const testPoint = await this.prisma.functional_test_points.findUnique({
        where: { id },
        include: {
          functional_test_case: {
            select: {
              id: true,
              name: true,
              system: true,
              module: true,
              section_name: true,
              description: true
            }
          }
        }
      });

      if (!testPoint) {
        return null;
      }

      console.log(`✅ 查询成功，测试点: ${testPoint.test_point_name}`);

      return {
        testPoint,
        testCase: testPoint.functional_test_case
      };
    } catch (error: any) {
      console.error('❌ 查询测试点详情失败:', error);
      throw new Error(`查询测试点详情失败: ${error.message}`);
    }
  }

  /**
   * 更新测试点
   */
  async updateTestPoint(id: number, data: any) {
    console.log(`📝 更新测试点，ID: ${id}`);

    try {
      const updateData: any = {
        test_purpose: data.testPurpose || '',
        test_point_name: data.testPointName,
        steps: data.steps,
        expected_result: data.expectedResult,
        risk_level: data.riskLevel || 'medium',
        updated_at: new Date()
      };

      const result = await this.prisma.functional_test_points.update({
        where: { id },
        data: updateData
      });

      console.log(`✅ 测试点更新成功: ${result.test_point_name}`);

      return result;
    } catch (error: any) {
      console.error('❌ 更新测试点失败:', error);
      throw new Error(`更新测试点失败: ${error.message}`);
    }
  }
  /**
   * 🆕 阶段1：智能测试模块拆分
   */
  async analyzeTestModules(requirementDoc: string) {
    const { FunctionalTestCaseAIService } = await import('./functionalTestCaseAIService.js');
    const aiService = new FunctionalTestCaseAIService();
    return await aiService.analyzeTestModules(requirementDoc);
  }

  /**
   * 🆕 阶段2：生成测试目的
   */
  async generateTestPurposes(
    moduleId: string,
    moduleName: string,
    moduleDescription: string,
    requirementDoc: string,
    relatedSections: string[]
  ) {
    const { FunctionalTestCaseAIService } = await import('./functionalTestCaseAIService.js');
    const aiService = new FunctionalTestCaseAIService();
    return await aiService.generateTestPurposes(
      moduleId,
      moduleName,
      moduleDescription,
      requirementDoc,
      relatedSections
    );
  }

  /**
   * 🆕 阶段3：生成测试点
   */
  async generateTestPoints(
    purposeId: string,
    purposeName: string,
    purposeDescription: string,
    requirementDoc: string,
    systemName: string,
    moduleName: string,
    relatedSections: string[]
  ) {
    const { FunctionalTestCaseAIService } = await import('./functionalTestCaseAIService.js');
    const aiService = new FunctionalTestCaseAIService();
    return await aiService.generateTestPoints(
      purposeId,
      purposeName,
      purposeDescription,
      requirementDoc,
      systemName,
      moduleName,
      relatedSections
    );
  }
}

// 导出单例
export const functionalTestCaseService = new FunctionalTestCaseService();

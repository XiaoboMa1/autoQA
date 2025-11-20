import { PrismaClient, Prisma } from '../../src/generated/prisma/index.js';

const prisma = new PrismaClient();

export interface System {
  id: number;
  name: string;
  description?: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSystemInput {
  name: string;
  description?: string;
  status?: 'active' | 'inactive';
  sort_order?: number;
}

export interface UpdateSystemInput {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive';
  sort_order?: number;
}

export interface GetSystemsOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: 'active' | 'inactive';
}

/**
 * 获取系统列表（支持分页、搜索、筛选）
 */
export async function getSystems(options: GetSystemsOptions = {}) {
  const {
    page = 1,
    pageSize = 50,
    search = '',
    status
  } = options;

  const skip = (page - 1) * pageSize;

  // 构建查询条件
  const where: Prisma.systemsWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } }
    ];
  }

  if (status) {
    where.status = status;
  }

  // 查询数据和总数
  const [systems, total] = await Promise.all([
    prisma.systems.findMany({
      where,
      orderBy: [
        { sort_order: 'asc' },
        { name: 'asc' }
      ],
      skip,
      take: pageSize
    }),
    prisma.systems.count({ where })
  ]);

  return {
    data: systems,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

/**
 * 获取所有启用的系统（不分页，用于下拉选择）
 */
export async function getActiveSystems() {
  return prisma.systems.findMany({
    where: { status: 'active' },
    orderBy: [
      { sort_order: 'asc' },
      { name: 'asc' }
    ],
    select: {
      id: true,
      name: true
    }
  });
}

/**
 * 根据ID获取系统
 */
export async function getSystemById(id: number) {
  return prisma.systems.findUnique({
    where: { id }
  });
}

/**
 * 创建系统
 */
export async function createSystem(input: CreateSystemInput) {
  // 检查系统名称是否已存在
  const existing = await prisma.systems.findUnique({
    where: { name: input.name }
  });

  if (existing) {
    throw new Error('系统名称已存在');
  }

  return prisma.systems.create({
    data: {
      name: input.name,
      description: input.description,
      status: input.status || 'active',
      sort_order: input.sort_order || 0
    }
  });
}

/**
 * 更新系统
 */
export async function updateSystem(id: number, input: UpdateSystemInput) {
  // 如果更新名称，检查是否与其他系统重复
  if (input.name) {
    const existing = await prisma.systems.findFirst({
      where: {
        name: input.name,
        NOT: { id }
      }
    });

    if (existing) {
      throw new Error('系统名称已存在');
    }
  }

  return prisma.systems.update({
    where: { id },
    data: input
  });
}

/**
 * 删除系统（需校验是否被引用）
 */
export async function deleteSystem(id: number) {
  const system = await prisma.systems.findUnique({
    where: { id }
  });

  if (!system) {
    throw new Error('系统不存在');
  }

  // 检查是否被测试用例引用
  const [testCaseCount, functionalTestCaseCount] = await Promise.all([
    prisma.test_cases.count({
      where: { system: system.name }
    }),
    prisma.functional_test_cases.count({
      where: { system: system.name }
    })
  ]);

  const totalReferences = testCaseCount + functionalTestCaseCount;

  if (totalReferences > 0) {
    throw new Error(`该系统正被 ${totalReferences} 个测试用例引用，无法删除`);
  }

  return prisma.systems.delete({
    where: { id }
  });
}

/**
 * 批量更新系统排序
 */
export async function updateSystemsOrder(orders: { id: number; sort_order: number }[]) {
  const updates = orders.map(({ id, sort_order }) =>
    prisma.systems.update({
      where: { id },
      data: { sort_order }
    })
  );

  return Promise.all(updates);
}

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '../../src/generated/prisma/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  accountName: string | null;
  project: string | null;
  isSuperAdmin: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthTokenPayload {
  userId: number;
  username: string;
  email: string;
  isSuperAdmin: boolean;
}

export class AuthService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * 用户登录
   */
  async login(credentials: LoginCredentials): Promise<{ user: AuthUser; token: string }> {
    const { username, password } = credentials;

    // 查找用户
    const user = await this.prisma.users.findUnique({
      where: { username }
    });

    if (!user) {
      throw new Error('用户名或密码错误');
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('用户名或密码错误');
    }

    // 生成JWT token
    const token = this.generateToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      isSuperAdmin: user.is_super_admin
    });
    
    // 返回用户信息和token
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      accountName: user.account_name,
      project: user.project,
      isSuperAdmin: user.is_super_admin
    };

    console.log(`✅ 用户登录成功: ${username} (ID: ${user.id})`);

    return { user: authUser, token };
  }

  /**
   * 生成JWT token
   */
  generateToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });
  }

  /**
   * 验证JWT token
   */
  verifyToken(token: string): AuthTokenPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    } catch (error) {
      throw new Error('无效的token');
    }
  }

  /**
   * 通过token获取用户信息
   */
  async getUserFromToken(token: string): Promise<AuthUser> {
    const payload = this.verifyToken(token);

    const user = await this.prisma.users.findUnique({
      where: { id: payload.userId }
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      accountName: user.account_name,
      project: user.project,
      isSuperAdmin: user.is_super_admin
    };
  }

  /**
   * 创建新用户
   */
  async createUser(userData: {
    email: string;
    username: string;
    password: string;
    accountName?: string;
    project?: string;
    isSuperAdmin?: boolean;
  }): Promise<AuthUser> {
    // 检查用户名是否已存在
    const existingUser = await this.prisma.users.findUnique({
      where: { username: userData.username }
    });

    if (existingUser) {
      throw new Error('用户名已存在');
    }

    // 检查邮箱是否已存在
    const existingEmail = await this.prisma.users.findUnique({
      where: { email: userData.email }
    });

    if (existingEmail) {
      throw new Error('邮箱已存在');
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // 创建用户
    const user = await this.prisma.users.create({
      data: {
        email: userData.email,
        username: userData.username,
        password_hash: hashedPassword,
        account_name: userData.accountName || null,
        project: userData.project || null,
        is_super_admin: userData.isSuperAdmin || false
      }
    });

    console.log(`✅ 用户创建成功: ${userData.username} (ID: ${user.id})`);

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      accountName: user.account_name,
      project: user.project,
      isSuperAdmin: user.is_super_admin
    };
  }

  /**
   * 修改用户密码
   */
  async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    // 验证旧密码
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isOldPasswordValid) {
      throw new Error('旧密码错误');
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码
    await this.prisma.users.update({
      where: { id: userId },
      data: { password_hash: hashedPassword }
    });

    console.log(`✅ 用户密码修改成功: ID ${userId}`);
  }
}

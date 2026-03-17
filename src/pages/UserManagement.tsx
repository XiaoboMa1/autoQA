import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Switch, Space, message, Popconfirm, Tag } from 'antd';
import { UserAddOutlined, EditOutlined, DeleteOutlined, KeyOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { motion } from 'framer-motion';
import { userService } from '../services/userService';

interface User {
  id: number;
  email: string;
  username: string;
  accountName?: string;
  project?: string; // 🔥 修复：使用 project 字段
  isSuperAdmin: boolean;
  createdAt: string;
}

interface CreateUserForm {
  email: string;
  username: string;
  password: string;
  accountName?: string;
  project?: string; // 🔥 修复：使用 project 字段
  isSuperAdmin: boolean;
}

interface UpdateUserForm {
  email: string;
  username: string;
  accountName?: string;
  project?: string; // 🔥 修复：使用 project 字段
  isSuperAdmin: boolean;
}

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);

  const [createForm] = Form.useForm<CreateUserForm>();
  const [editForm] = Form.useForm<UpdateUserForm>();
  const [passwordForm] = Form.useForm<{ newPassword: string; confirmPassword: string }>();

  // 加载用户列表
  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await userService.getAllUsers();
      setUsers(data);
    } catch (error) {
      message.error('加载用户列表失败');
      console.error('Load users error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // 创建用户
  const handleCreateUser = async (values: CreateUserForm) => {
    try {
      await userService.createUser(values);
      message.success('用户创建成功');
      setIsCreateModalOpen(false);
      createForm.resetFields();
      loadUsers();
    } catch (error: any) {
      message.error(error.message || '创建用户失败');
      console.error('Create user error:', error);
    }
  };

  // 编辑用户
  const handleEditUser = async (values: UpdateUserForm) => {
    if (!editingUser) return;

    try {
      await userService.updateUser(editingUser.id, values);
      message.success('用户信息更新成功');
      setIsEditModalOpen(false);
      setEditingUser(null);
      editForm.resetFields();
      loadUsers();
    } catch (error: any) {
      message.error(error.message || '更新用户失败');
      console.error('Update user error:', error);
    }
  };

  // 删除用户
  const handleDeleteUser = async (userId: number) => {
    try {
      await userService.deleteUser(userId);
      message.success('用户删除成功');
      loadUsers();
    } catch (error: any) {
      message.error(error.message || '删除用户失败');
      console.error('Delete user error:', error);
    }
  };

  // 打开编辑模态框
  const openEditModal = (user: User) => {
    setEditingUser(user);
    editForm.setFieldsValue({
      email: user.email,
      username: user.username,
      accountName: user.accountName,
      project: user.project, // 🔥 修复：使用 project 字段
      isSuperAdmin: user.isSuperAdmin,
    });
    setIsEditModalOpen(true);
  };

  // 打开修改密码模态框
  const openPasswordModal = (user: User) => {
    setPasswordUser(user);
    setIsPasswordModalOpen(true);
  };

  // 修改密码
  const handleChangePassword = async (values: { newPassword: string; confirmPassword: string }) => {
    if (!passwordUser) return;

    try {
      await userService.changePassword(passwordUser.id, values.newPassword);
      message.success('密码修改成功');
      setIsPasswordModalOpen(false);
      setPasswordUser(null);
      passwordForm.resetFields();
    } catch (error: any) {
      message.error(error.message || '修改密码失败');
      console.error('Change password error:', error);
    }
  };

  const columns: ColumnsType<User> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 150,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 200,
    },
    {
      title: '账户名称',
      dataIndex: 'accountName',
      key: 'accountName',
      width: 150,
      render: (text) => text || '-',
    },
    {
      title: '项目', // 🔥 修复：改为项目
      dataIndex: 'project', // 🔥 修复：使用 project 字段
      key: 'project',
      width: 150,
      render: (text) => text || '-',
    },
    {
      title: '权限',
      dataIndex: 'isSuperAdmin',
      key: 'isSuperAdmin',
      width: 120,
      render: (isSuperAdmin: boolean) => (
        isSuperAdmin ? (
          <Tag color="purple">超级管理员</Tag>
        ) : (
          <Tag color="blue">普通用户</Tag>
        )
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
            size="small"
          >
            编辑
          </Button>
          <Button
            type="link"
            icon={<KeyOutlined />}
            onClick={() => openPasswordModal(record)}
            size="small"
          >
            改密
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除此用户吗？此操作不可恢复。"
            onConfirm={() => handleDeleteUser(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">用户管理</h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600 dark:text-gray-600">
            管理系统用户账户和权限
          </p>
        </div>
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          onClick={() => setIsCreateModalOpen(true)}
          size="large"
        >
          创建用户
        </Button>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden"
      >
        <Table
          columns={columns}
          dataSource={users}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个用户`,
            className: "px-4 py-3"
          }}
          scroll={{ x: 1200 }}
          className="user-management-table"
        />
      </motion.div>

      {/* Create User Modal */}
      <Modal
        title="创建新用户"
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          createForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateUser}
          initialValues={{ isSuperAdmin: false }}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
              { max: 100, message: '用户名最多100个字符' },
            ]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>

          <Form.Item
            label="账户名称"
            name="accountName"
          >
            <Input placeholder="请输入账户名称（可选）" />
          </Form.Item>

          <Form.Item
            label="项目" // 🔥 修复：改为项目
            name="project" // 🔥 修复：使用 project 字段
          >
            <Input placeholder="请输入项目（可选）" /> {/* 🔥 修复：改为项目 */}
          </Form.Item>

          <Form.Item
            label="超级管理员"
            name="isSuperAdmin"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item className="mb-0 mt-6">
            <Space className="w-full justify-end">
              <Button onClick={() => {
                setIsCreateModalOpen(false);
                createForm.resetFields();
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                创建
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        title="编辑用户信息"
        open={isEditModalOpen}
        onCancel={() => {
          setIsEditModalOpen(false);
          setEditingUser(null);
          editForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEditUser}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
              { max: 100, message: '用户名最多100个字符' },
            ]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item
            label="账户名称"
            name="accountName"
          >
            <Input placeholder="请输入账户名称（可选）" />
          </Form.Item>

          <Form.Item
            label="项目" // 🔥 修复：改为项目
            name="project" // 🔥 修复：使用 project 字段
          >
            <Input placeholder="请输入项目（可选）" /> {/* 🔥 修复：改为项目 */}
          </Form.Item>

          <Form.Item
            label="超级管理员"
            name="isSuperAdmin"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item className="mb-0 mt-6">
            <Space className="w-full justify-end">
              <Button onClick={() => {
                setIsEditModalOpen(false);
                setEditingUser(null);
                editForm.resetFields();
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        title={`修改密码 - ${passwordUser?.username}`}
        open={isPasswordModalOpen}
        onCancel={() => {
          setIsPasswordModalOpen(false);
          setPasswordUser(null);
          passwordForm.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={handleChangePassword}
        >
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>

          <Form.Item
            label="确认密码"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>

          <Form.Item className="mb-0 mt-6">
            <Space className="w-full justify-end">
              <Button onClick={() => {
                setIsPasswordModalOpen(false);
                setPasswordUser(null);
                passwordForm.resetFields();
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                确认修改
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

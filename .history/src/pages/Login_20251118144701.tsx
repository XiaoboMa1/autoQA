import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Alert } from 'antd';
import { User, Lock, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import NET from 'vanta/dist/vanta.net.min';
import * as THREE from 'three';
import '../styles/login.css';

export const Login: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  // VANTA.js 相关
  const vantaRef = useRef<HTMLDivElement>(null);
  const vantaEffect = useRef<any>(null);

  // 初始化 VANTA.js NET 效果
  useEffect(() => {
    if (!vantaEffect.current && vantaRef.current) {
      vantaEffect.current = NET({
        el: vantaRef.current,
        THREE: THREE,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 1.0,
        scaleMobile: 1.0,
        color: 0xa855f7,        // 紫色网络线条
        backgroundColor: 0x0f0a1e, // 深紫色背景
        points: 8.0,            // 网络节点数量
        maxDistance: 20.0,      // 连接线最大距离
        spacing: 16.0,          // 节点间距
        showDots: true          // 显示节点
      });
    }

    // 组件卸载时清理 VANTA 实例
    return () => {
      if (vantaEffect.current) {
        vantaEffect.current.destroy();
        vantaEffect.current = null;
      }
    };
  }, []);

  const handleSubmit = async (values: { username: string; password: string }) => {
    setError(null);
    setLoading(true);

    try {
      await login(values.username, values.password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* VANTA.js 3D 网络背景 */}
      <div
        ref={vantaRef}
        className="absolute inset-0"
        style={{ zIndex: 0 }}
      />

      {/* 渐变背景（降级方案/VANTA加载前显示） */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" style={{ zIndex: -1 }} />

      {/* 背景光晕增强效果 */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ zIndex: 1 }} />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s', zIndex: 1 }} />

      {/* 内容层 */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-md"
        >
          {/* Logo 和标题 */}
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <motion.div
              className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 mb-6 shadow-2xl shadow-purple-500/50 p-2"
              animate={{
                boxShadow: [
                  '0 0 20px rgba(168, 85, 247, 0.5)',
                  '0 0 60px rgba(168, 85, 247, 0.8)',
                  '0 0 20px rgba(168, 85, 247, 0.5)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="w-full h-full bg-white rounded-xl p-2 flex items-center justify-center">
                <img
                  src="/logo.png"
                  alt="TestFlow Logo"
                  className="w-full h-full object-contain"
                />
              </div>
            </motion.div>

            <h1 className="text-4xl font-bold text-white mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-purple-200">
              TestFlow
            </h1>
            <p className="text-purple-200/80 text-lg">企业级自动化测试平台</p>
          </motion.div>

          {/* 登录卡片 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20"
          >
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-6"
                >
                  <Alert
                    message={error}
                    type="error"
                    closable
                    onClose={() => setError(null)}
                    className="login-alert rounded-xl"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <Form
              form={form}
              onFinish={handleSubmit}
              layout="vertical"
              requiredMark={false}
              className="space-y-5"
            >
              <Form.Item
                name="username"
                rules={[{ required: true, message: '请输入用户名' }]}
                className="login-input"
              >
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
                  </div>
                  <Input
                    placeholder="用户名"
                    autoComplete="username"
                    className="h-14 pl-12 pr-4 rounded-xl transition-all"
                  />
                </div>
              </Form.Item>

              <Form.Item
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
                className="login-input"
              >
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                    <Lock className="w-5 h-5 text-purple-300 group-hover:text-purple-200 transition-colors" />
                  </div>
                  <Input.Password
                    placeholder="密码"
                    autoComplete="current-password"
                    className="h-14 pl-12 pr-4 rounded-xl transition-all"
                  />
                </div>
              </Form.Item>

              <Form.Item className="mb-0">
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    block
                    className="login-button h-14 rounded-xl text-base font-semibold transition-all"
                    icon={!loading && <ArrowRight className="w-5 h-5 ml-2" />}
                  >
                    {loading ? '登录中...' : '登录'}
                  </Button>
                </motion.div>
              </Form.Item>
            </Form>

            {/* 提示信息 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="mt-8 pt-6 border-t border-white/10"
            >
              <div className="bg-purple-500/10 rounded-xl p-4 border border-purple-400/20">
                <p className="text-purple-200/70 text-sm text-center mb-2">
                  🔐 初始超级管理员账号
                </p>
                <div className="flex justify-center space-x-6 text-sm">
                  <div className="text-center">
                    <span className="text-purple-300/60 block mb-1">用户名</span>
                    <code className="text-white font-mono bg-white/10 px-3 py-1 rounded-lg">admin</code>
                  </div>
                  <div className="text-center">
                    <span className="text-purple-300/60 block mb-1">密码</span>
                    <code className="text-white font-mono bg-white/10 px-3 py-1 rounded-lg">admin</code>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* 底部装饰 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="mt-8 text-center"
          >
            <p className="text-purple-300/50 text-sm">
              © 2025 TestFlow. Powered by AI & Automation
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

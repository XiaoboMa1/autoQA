import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  FileCode,
  Play,
  BarChart3,
  Settings,
  Bot,
  Factory,
  Users,
  Edit3,
  PlusCircle,
  FileText
} from 'lucide-react';

export interface Tab {
  id: string;
  path: string;
  title: string;
  icon: React.ReactNode;
  closable: boolean;
}

interface TabContextType {
  tabs: Tab[];
  activeTabId: string;
  addTab: (tab: Omit<Tab, 'id' | 'closable'>) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeRightTabs: (tabId: string) => void;
  closeAllTabs: () => void;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

const STORAGE_KEY = 'app-tabs';
const MAX_TABS = 20;

// 路由配置映射
const routeConfig: Record<string, { title: string; icon: React.ReactNode }> = {
  '/': { title: '仪表板', icon: <Home className="h-4 w-4" /> },
  '/test-cases': { title: '测试用例', icon: <FileCode className="h-4 w-4" /> },
  '/test-runs': { title: '测试执行', icon: <Play className="h-4 w-4" /> },
  '/reports': { title: '测试报告', icon: <BarChart3 className="h-4 w-4" /> },
  '/test-factory': { title: '测试工厂', icon: <Factory className="h-4 w-4" /> },
  '/llm-assistant': { title: 'AI 助手', icon: <Bot className="h-4 w-4" /> },
  '/user-management': { title: '用户管理', icon: <Users className="h-4 w-4" /> },
  '/settings': { title: '设置', icon: <Settings className="h-4 w-4" /> },
};

// 动态路由匹配函数 - 支持路径参数
const getRouteConfig = (pathname: string): { title: string; icon: React.ReactNode } | null => {
  // 直接匹配
  if (routeConfig[pathname]) {
    return routeConfig[pathname];
  }

  // 匹配二级路由
  if (pathname === '/test-cases/new') {
    return { title: '新建测试用例', icon: <PlusCircle className="h-4 w-4" /> };
  }

  if (pathname.match(/^\/test-cases\/\d+\/edit$/)) {
    return { title: '编辑测试用例', icon: <Edit3 className="h-4 w-4" /> };
  }

  if (pathname.match(/^\/test-runs\/.+\/detail$/)) {
    return { title: '测试执行详情', icon: <FileText className="h-4 w-4" /> };
  }

  return null;
};

// 生成唯一ID
const generateTabId = (path: string): string => {
  return `tab-${path.replace(/\//g, '-')}-${Date.now()}`;
};

// 首页Tab（不可关闭）
const homeTab: Tab = {
  id: 'tab-home',
  path: '/',
  title: '仪表板',
  icon: <Home className="h-4 w-4" />,
  closable: false,
};

interface TabProviderProps {
  children: ReactNode;
}

export const TabProvider: React.FC<TabProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [tabs, setTabs] = useState<Tab[]>([homeTab]);
  const [activeTabId, setActiveTabId] = useState<string>(homeTab.id);

  // 从localStorage加载Tab
  useEffect(() => {
    const savedTabs = localStorage.getItem(STORAGE_KEY);
    if (savedTabs) {
      try {
        const parsed = JSON.parse(savedTabs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 恢复Tab，重新添加icon
          const restoredTabs = parsed.map((tab: any) => {
            const config = getRouteConfig(tab.path);
            return {
              ...tab,
              icon: config?.icon || homeTab.icon,
            };
          });

          // 确保首页Tab始终存在
          const hasHome = restoredTabs.some((tab: Tab) => tab.path === '/');
          const finalTabs = hasHome ? restoredTabs : [homeTab, ...restoredTabs];
          setTabs(finalTabs);

          // 恢复当前激活的Tab
          const currentTab = finalTabs.find((tab: Tab) => tab.path === location.pathname);
          if (currentTab) {
            setActiveTabId(currentTab.id);
          }
        }
      } catch (error) {
        console.error('加载Tab状态失败:', error);
      }
    }
  }, []);

  // 保存Tab到localStorage（移除React元素）
  useEffect(() => {
    if (tabs.length > 0) {
      const tabsToSave = tabs.map(({ icon, ...rest }) => rest);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabsToSave));
    }
  }, [tabs]);

  // 监听路由变化，自动创建或激活Tab
  useEffect(() => {
    const currentPath = location.pathname;
    const existingTab = tabs.find(tab => tab.path === currentPath);

    if (existingTab) {
      // Tab已存在，直接激活
      if (activeTabId !== existingTab.id) {
        setActiveTabId(existingTab.id);
      }
      return;
    }

    // 创建新Tab
    const config = getRouteConfig(currentPath);
    if (!config) {
      return;
    }

    // 检查Tab数量限制
    if (tabs.length >= MAX_TABS) {
      console.warn(`已达到最大Tab数量限制 (${MAX_TABS})`);
      return;
    }

    // 创建新Tab
    const newTab: Tab = {
      path: currentPath,
      title: config.title,
      icon: config.icon,
      id: generateTabId(currentPath),
      closable: currentPath !== '/',
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // 添加Tab
  const addTab = useCallback((tab: Omit<Tab, 'id' | 'closable'>) => {
    setTabs(prevTabs => {
      // 检查是否已存在
      const existing = prevTabs.find(t => t.path === tab.path);
      if (existing) {
        setActiveTabId(existing.id);
        return prevTabs;
      }

      // 检查Tab数量限制
      if (prevTabs.length >= MAX_TABS) {
        console.warn(`已达到最大Tab数量限制 (${MAX_TABS})`);
        return prevTabs;
      }

      // 创建新Tab
      const newTab: Tab = {
        ...tab,
        id: generateTabId(tab.path),
        closable: tab.path !== '/', // 首页不可关闭
      };

      setActiveTabId(newTab.id);
      return [...prevTabs, newTab];
    });
  }, []);

  // 移除Tab
  const removeTab = useCallback((tabId: string) => {
    setTabs(prevTabs => {
      const tab = prevTabs.find(t => t.id === tabId);

      // 不能关闭首页Tab
      if (!tab || !tab.closable) {
        return prevTabs;
      }

      const newTabs = prevTabs.filter(t => t.id !== tabId);

      // 如果关闭的是当前激活的Tab，需要切换到其他Tab
      if (activeTabId === tabId) {
        const currentIndex = prevTabs.findIndex(t => t.id === tabId);
        const nextTab = newTabs[currentIndex] || newTabs[currentIndex - 1] || homeTab;
        setActiveTabId(nextTab.id);
        navigate(nextTab.path);
      }

      return newTabs;
    });
  }, [activeTabId, navigate]);

  // 设置激活Tab
  const setActiveTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      navigate(tab.path);
    }
  }, [tabs, navigate]);

  // 关闭其他Tab
  const closeOtherTabs = useCallback((tabId: string) => {
    setTabs(prevTabs => {
      const tab = prevTabs.find(t => t.id === tabId);
      if (!tab) return prevTabs;

      // 保留首页和指定Tab
      const newTabs = prevTabs.filter(t => t.id === tabId || !t.closable);

      setActiveTabId(tabId);
      navigate(tab.path);

      return newTabs;
    });
  }, [navigate]);

  // 关闭右侧所有Tab
  const closeRightTabs = useCallback((tabId: string) => {
    setTabs(prevTabs => {
      const tabIndex = prevTabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) return prevTabs;

      // 保留当前Tab及其左侧的Tab
      const newTabs = prevTabs.slice(0, tabIndex + 1);

      return newTabs;
    });
  }, []);

  // 关闭所有Tab（除了首页）
  const closeAllTabs = useCallback(() => {
    setTabs([homeTab]);
    setActiveTabId(homeTab.id);
    navigate('/');
  }, [navigate]);

  const value: TabContextType = {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    setActiveTab,
    closeOtherTabs,
    closeRightTabs,
    closeAllTabs,
  };

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
};

export const useTabs = (): TabContextType => {
  const context = useContext(TabContext);
  if (context === undefined) {
    throw new Error('useTabs must be used within a TabProvider');
  }
  return context;
};

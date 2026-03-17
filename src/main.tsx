import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// 🔥 关闭 StrictMode 以避免开发模式下的双重渲染
// StrictMode 会故意双重挂载组件来检测副作用问题
// 这是导致接口被调用两次的根本原因
createRoot(document.getElementById('root')!).render(
  // <StrictMode>
    <App />
  // </StrictMode>
);

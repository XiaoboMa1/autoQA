# 静态资源文件夹

这个文件夹用于存放静态资源文件，如图片、图标、字体等。

## Logo上传位置

请将您的logo文件放置在这里：

### 推荐文件名：
- `logo.png` - PNG格式logo（推荐）
- `logo.svg` - SVG格式logo 
- `logo.jpg` - JPG格式logo

### 文件要求：
- **尺寸**: 256x256px 或更高分辨率的正方形
- **格式**: PNG（支持透明背景）、SVG、JPG
- **大小**: 建议小于500KB

## 如何使用

上传logo后，编辑 `src/components/Logo.tsx` 文件，将：

```jsx
<TestTube className={`${iconSizes[size]} text-blue-600`} />
```

替换为：

```jsx
<img 
  src="/logo.png" 
  alt="公司Logo" 
  className={`${sizeClasses[size]} object-contain`} 
/>
```

## 访问路径

文件放在 `public` 文件夹中后，可以通过以下路径访问：
- `public/logo.png` → 访问路径：`/logo.png`
- `public/assets/logo.svg` → 访问路径：`/assets/logo.svg`
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// 创建上传目录
const uploadDir = path.join(process.cwd(), 'uploads', 'axure');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('📁 创建上传目录:', uploadDir);
}

// 配置存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名：时间戳-随机字符串-原始扩展名
    const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const ext = path.extname(file.originalname);
    cb(null, `axure-${uniqueSuffix}${ext}`);
  }
});

// 文件过滤器（单文件上传 - 仅 HTML）
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.html' || ext === '.htm') {
    cb(null, true);
  } else {
    cb(new Error('只支持 .html 或 .htm 格式的Axure文件'));
  }
};

// 文件过滤器（多文件上传 - HTML + JS）
const multiFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.html' || ext === '.htm' || ext === '.js') {
    cb(null, true);
  } else {
    cb(new Error('只支持 .html, .htm 和 .js 格式的文件'));
  }
};

// 导出单文件上传中间件
export const axureUpload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter
});

// 导出多文件上传中间件
export const axureMultiUpload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 20 // 最多20个文件
  },
  fileFilter: multiFileFilter
});

console.log('✅ 文件上传中间件已加载');

@echo off
echo ====================================
echo 启动 Qdrant 向量数据库
echo ====================================

REM 检查Qdrant容器是否已存在
docker ps -a | findstr "qdrant" >nul
if %errorlevel% == 0 (
    echo Qdrant容器已存在，正在启动...
    docker start qdrant
) else (
    echo 创建并启动新的Qdrant容器...
    docker run -d ^
      --name qdrant ^
      -p 6333:6333 ^
      -p 6334:6334 ^
      -v %cd%\..\qdrant_storage:/qdrant/storage ^
      qdrant/qdrant
)

echo.
echo ====================================
echo Qdrant 启动成功！
echo ====================================
echo.
echo 管理界面: http://localhost:6333/dashboard
echo API地址: http://localhost:6333
echo.
echo 按任意键继续...
pause >nul

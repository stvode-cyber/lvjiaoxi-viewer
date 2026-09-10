@echo off
setlocal
cd /d %~dp0

echo ============================================================
echo   绿角犀看图 · Windows 原生客户端构建脚本
echo ============================================================

REM --- 1. 检查 Rust 工具链 ---
where cargo >nul 2>&1
if errorlevel 1 (
  echo [错误] 未检测到 Rust / cargo。
  echo.
  echo 请先安装：
  echo   1) Rust 工具链: https://rustup.rs  （安装时选 "MSVC" 默认工具链）
  echo   2) Visual Studio Build Tools 2022，勾选工作负载
  echo      "使用 C++ 的桌面开发"（提供 MSVC 链接器 cl.exe / link.exe）
  echo   3) Windows 10/11 自带 WebView2 运行时（Evergreen，通常已预装）
  echo.
  pause
  exit /b 1
)

REM --- 2. 确保图标存在（缺失则用 resvg 重新生成）---
if not exist src-tauri\icons\icon.ico (
  echo [信息] 未找到图标，尝试生成...
  call npm install @resvg/resvg-js --no-save >nul 2>&1
  if errorlevel 1 (
    echo [警告] 安装 @resvg/resvg-js 失败，请手动放置 src-tauri/icons/{32x32.png,128x128.png,128x128@2x.png,icon.png,icon.ico}
  ) else (
    node scripts\gen-icons.cjs
  )
)

REM --- 3. 安装前端依赖（含 @tauri-apps/cli）---
echo [信息] 安装前端依赖 (npm install)...
call npm install
if errorlevel 1 ( echo [错误] npm install 失败 & pause & exit /b 1 )

REM --- 4. 构建 Windows 原生客户端（NSIS 安装包 + MSI）---
echo [信息] 开始 cargo tauri build（首次会编译大量 Rust 依赖，请耐心等待）...
call npm run tauri build
if errorlevel 1 ( echo [错误] 构建失败，请查看上方日志 & pause & exit /b 1 )

echo.
echo [完成] 产物位于：
echo   src-tauri\target\release\bundle\nsis\   （绿角犀看图_x64-setup.exe 安装包）
echo   src-tauri\target\release\bundle\msi\   （绿角犀看图_x64.msi）
echo.
pause

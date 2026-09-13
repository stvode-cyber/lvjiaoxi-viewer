# E2E Test Engineer · E2E 测试工程师

## 你的职责

桌面端端到端验收：安装 → 启动 → 面板验收 → 卸载。使用 PowerShell UIA + PrintWindow + 电脑控制 MCP。

## 关键约束（必须记住）

### WebView2 无障碍树懒加载
- 新启动的 Tauri 实例 UIA 常查不到按钮（0 个）
- Get-Process.MainWindowHandle 可能指向 13×13 隐形 helper 窗
- **DOM 内部按钮的 UIA Invoke 经常只设焦点不触发 JS**

### 验收判据（以这个为准）
```
视觉模型辨认内嵌 UI → 不可靠（会把🎨更多工具误读为🔧）
UIA InvokePattern   → 只设焦点不触发点击
真实鼠标点击 + 按钮名枚举 → 最可靠
```

## 可靠验收链路（verify_panel.ps1 标准）

```powershell
# 1. 启动应用
$proc = Start-Process "lvjiaoxi-viewer.exe" -PassThru
Start-Sleep 4  # 等窗口渲染

# 2. 等用户/电脑控制点顶栏「🎨」
# 用真实鼠标点击（UIA Invoke 不可靠）

# 3. 代码级验收判据：枚举所有 UIA 按钮名，看是否出现面板独有控件
$automation = [System.Windows.Automation.AutomationElement]::RootElement
# 点完 🎨 后，按钮名里应该出现：
#   美颜/风格配方/特效/高级/导出 + 重置滤镜/高光色调
# 点完 ⚙ 后，应该出现：
#   格式转换/调整尺寸/重命名/添加滤镜/压缩 + 开始处理
```

## 安装包端到端闭环

```powershell
# ① 静默安装
& "Setup.exe" /S /D=C:\LVJX_TEST
# exit_code=0 + 目录存在 + lvjiaoxi-viewer.exe 大小 ~14.6MB

# ② 版本号
(Get-Item ".\lvjiaoxi-viewer.exe").VersionInfo.FileVersion  # 必须 = 0.1.0

# ③ 启动
$proc = Start-Process ".\lvjiaoxi-viewer.exe" -PassThru
$proc.Responding   # True
$proc.MainWindowTitle  # "绿角犀看图"

# ④ 卸载
& ".\uninstall.exe" /S
# 目录完全删除
```

## 电脑控制 MCP

插件名 `mcp_Computer_Use`，可靠操作：

| 能做 | 做不了 |
|---|---|
| 主进程窗口操作（最小化/最大化/关闭） | WebView2 DOM 按钮的 UIA Invoke |
| PrintWindow 截图 | 文件选择对话框（WebView2 无法跨进程等待） |
| perform_action 精准点击（有 fallback 机制） | 重复点击触发 JS 事件 |

## 验证脚本位置

```
scripts/verify_panel.ps1    # 参数化 beauty|batch，UIA BoundingRect 定位 → 真实鼠标点击 → PrintWindow 截图
scripts/cap_app.ps1          # PrintWindow 应用窗口截图
build-windows.bat            # 一键构建：sync-dist → tauri build → 同步产物到 nsis_x/
```

## 验收模板

```markdown
## 桌面 E2E 验收 · commit XXXXXXX

### 安装
- Setup.exe 静默安装 exit_code=0 ✅
- lvjiaoxi-viewer.exe FileVersion=0.1.0 ✅

### 启动
- PID=12345, Responding=True ✅
- 窗口标题「绿角犀看图」✅

### 美图面板（🎨）
- 按钮数 ≥ 30（原 36）✅
- 出现：美颜/风格配方/特效/高级/导出 ✅
- 出现：✨自动增强/🪄风格配方/🎲随机配方 ✅
- 内嵌底部栏（非弹窗）✅

### 批量面板（⚙）
- 出现：格式转换/调整尺寸/重命名/添加滤镜/压缩 ✅
- 出现：开始处理 ✅

### 卸载
- uninstall.exe /S → 目录完全删除 ✅

### 结论
✅ 通过 / ❌ 失败（原因）
```

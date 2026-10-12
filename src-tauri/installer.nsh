; 绿角犀看图 NSIS 自定义安装段
; 1) 安装前自动静默卸载旧版本（避免旧资源残留导致白屏/功能异常，实现一步到位）
; 2) 安装完成后写入右键菜单（PRD 5.1「右键菜单集成」）
; 由 tauri.conf.json -> bundle.windows.nsis.installerHooks 引用
;
; ISS-004 修复说明：
;   PreInstall 里的卸载逻辑（ExecWait uninstall.exe /S、cmd /c /qn）在 /S 模式下
;   会卡主安装流程 — 因为 NSIS 在写 Registry InstallDir 后就进入 hook，
;   但此时 INSTDIR 还未被文件复制填充，uninstall.exe 不存在。
;   同时之前发现 Setup.exe /S 会忽略 /D 参数，用 Registry 缓存路径覆盖。
;   根因：NSIS InstallDirRegKey 无显式设置，但旧版本安装后 Registry 残留值
;   会被读取覆盖 /D。当前 Workaround：保留 hook 但简化流程；最终方案需要
;   在 PREINSTALL 里显式清 InstallDirRegKey 缓存（若 Tauri 模板支持）。

!macro NSIS_HOOK_PREINSTALL
  ; 只杀可能在运行的旧进程（最轻量、最安全的操作）
  nsExec::ExecToLog 'taskkill /F /IM "lvjiaoxi-viewer.exe"'

  ; 旧版卸载逻辑临时移除 — ExecWait uninstall.exe /S 和 cmd /c /qn
  ; 在 /S 模式下会卡住安装（ISS-004 深层根因）
  ; 如需干净重装，建议用户先在「设置-应用」卸载旧版，或手动删残留目录
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 对图片类型注册右键「用绿角犀看图打开」
  WriteRegStr HKEY_CLASSES_ROOT "SystemFileAssociations\image\shell\LvJiaoXiViewer" "" "用绿角犀看图打开"
  WriteRegStr HKEY_CLASSES_ROOT "SystemFileAssociations\image\shell\LvJiaoXiViewer" "Icon" "$INSTDIR\lvjiaoxi-viewer.exe,0"
  WriteRegStr HKEY_CLASSES_ROOT "SystemFileAssociations\image\shell\LvJiaoXiViewer\command" "" '"""$INSTDIR\lvjiaoxi-viewer.exe"" ""%1""'
  ; 对文件夹注册「用绿角犀看图浏览此文件夹」
  WriteRegStr HKEY_CLASSES_ROOT "Directory\shell\LvJiaoXiViewer" "" "用绿角犀看图浏览此文件夹"
  WriteRegStr HKEY_CLASSES_ROOT "Directory\shell\LvJiaoXiViewer\command" "" '"""$INSTDIR\lvjiaoxi-viewer.exe"" ""%1""'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKEY_CLASSES_ROOT "SystemFileAssociations\image\shell\LvJiaoXiViewer"
  DeleteRegKey HKEY_CLASSES_ROOT "Directory\shell\LvJiaoXiViewer"
!macroend

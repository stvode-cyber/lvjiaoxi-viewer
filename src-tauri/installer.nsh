; 绿角犀看图 NSIS 自定义安装段
; 1) 安装前自动静默卸载旧版本（避免旧资源残留导致白屏/功能异常，实现一步到位）
; 2) 安装完成后写入右键菜单（PRD 5.1「右键菜单集成」）
; 由 tauri.conf.json -> bundle.windows.nsis.installerHooks 引用

!macro NSIS_HOOK_PREINSTALL
  ; 结束可能仍在运行的旧实例，避免文件占用导致覆盖失败
  nsExec::ExecToLog 'taskkill /F /IM "lvjiaoxi-viewer.exe"'

  ; 若目标目录存在旧版卸载器，静默卸载（_?=$INSTDIR 让卸载器同步执行且不复制自身）
  IfFileExists "$INSTDIR\uninstall.exe" 0 skip_uninstall
    DetailPrint "检测到旧版本，正在自动卸载..."
    ExecWait '"$INSTDIR\uninstall.exe" /S _?=$INSTDIR'
  skip_uninstall:

  ; 兼容 MSI 安装的旧版（注册表卸载项，HKCU + HKLM 均检测）
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\绿角犀看图" "UninstallString"
  StrCmp $R0 "" skip_reg_uninstall
    DetailPrint "检测到旧版注册卸载项，正在自动卸载..."
    nsExec::ExecToLog 'cmd /c ""$R0" /qn /norestart"'
  skip_reg_uninstall:
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\绿角犀看图" "UninstallString"
  StrCmp $R0 "" skip_hklm_uninstall
    DetailPrint "检测到旧版注册卸载项（HKLM），正在自动卸载..."
    nsExec::ExecToLog 'cmd /c ""$R0" /qn /norestart"'
  skip_hklm_uninstall:

  ; 清理目标目录所有残留文件，确保全新安装
  Sleep 500
  RMDir /r /REBOOTOK "$INSTDIR"
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

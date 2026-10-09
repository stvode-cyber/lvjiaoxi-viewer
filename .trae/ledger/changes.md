# changes.md · 文件变化批次

> 每个 Chg 条目记录一次独立改动的批次。末尾必须 ↔Dc/Iss 交叉引用。

---

#### Chg-001（2026-09-30 · 台帐系统初始化）

- **批次主题**：AGENTS.md 新增 §6 台帐系统硬约束 + `.trae/ledger/` 台帐骨架初始化
- **文件列表**：
  - `AGENTS.md` ← 新增 §6 台帐系统（7 个子节：目录结构、启动先看台帐、改前必扫、改完必记、成长型归类防膨胀、每轮结束总汇、跨 AI 交接铁律）
  - `.trae/ledger/START_HERE.md` ← 🟢 接手入口（30 秒读完版）
  - `.trae/ledger/context.md` ← 当前状态快照 + 完成度表
  - `.trae/ledger/issues.md` ← 活跃坑区 3 条 + 归档区骨架
  - `.trae/ledger/decisions.md` ← 6 条初始技术决策（Dc-001~006）
  - `.trae/ledger/changes.md` ← 本文件
  - `.trae/ledger/.session.md` ← 会话临时内存骨架
- **验证**：regression.cjs 全绿 404/0；AGENTS.md + .trae/ledger/ 目录不影响 app.js / sw.js / Cargo.toml 等运行时代码，无需重构建
- **关联**：↔Dc-006 ↔Iss-001 ↔Iss-002 ↔Iss-003

#### Chg-002（2026-10-01 · NSIS 重装 + 启动应用 + lnk 修正）

- **批次主题**：重装绿角犀看图 Setup.exe /S → 全局搜 EXE 定位真实路径 → 启动应用 + 修正开始菜单 lnk → 沉淀新坑 Iss-004
- **文件列表**：
  - `.trae/ledger/issues.md` ← 新增 Iss-004（NSIS 残留 lnk 指向已删除目录，踩 2 次）
  - `.trae/ledger/changes.md` ← 追加 Chg-002
- **操作动作**：
  - 执行 `绿角犀看图_0.1.0_x64-setup.exe /S`（ExitCode=0）
  - 全局搜 `lvjiaoxi-viewer.exe` 定位到 `AppData\Local\lvjx-v010-final\lvjiaoxi-viewer.exe` (14.3MB)
  - Start-Process 启动成功（PID=15264）
  - 用 WScript.Shell 修正 `绿角犀看图.lnk` 指向真实 EXE（原指向 C:\LVJX_TEST 已不存在）
- **验证**：应用启动成功（ProcessName=lvjiaoxi-viewer）
- **关联**：↔Iss-002（PS5 GBK 预防：命令参数行纯 ASCII） ↔Iss-004（新坑本身）

#### Chg-003（2026-10-01 · 顶栏按钮拆分 + 底部导航条）

- **批次主题**：顶部工具栏右侧 12 按钮挤 → 拆分成 6 核心留顶栏 + 6 次要功能移到底部新导航条
- **文件列表**：
  - `index.html` ← 顶栏 tb-right 从 12 减到 6；新增 `<nav class='bottom-nav'>` 放 6 个工具按钮（btnCopy/btnSlide/btnBatch/btnRecent/btnSettings/accountBtn）；按钮 ID 不变，app.js 事件绑定零改动
  - `styles.css` ← 新增 `.bottom-nav` 块（flex column body 下自动贴底；配色对齐 toolbar/thumb-bar；图标+标签垂直 tab bar 风格；accountBtn 绿色 accent）
  - `sw.js` ← CACHE v39→v40（硬约束 §3：改 index.html 必须 +1）
- **验证**：regression.cjs 404/0 全绿；app.js 安全扫描确认所有按钮事件靠 getElementById 无位置依赖；sync-dist.cjs 成功
- **关联**：↔Dc-003（导航条形态决策） ↔Iss-003（已归档） ↔Iss-004

#### Chg-004（2026-10-01 · 美颜工具条移到底部内嵌栏）

- **批次主题**：.beauty-bar（亮度/对比/饱和/色温/一键美颜/一键海报）从顶栏下方移到底部 app-row 之后、bottom-nav 之前
- **文件列表**：
  - `index.html` ← beauty-bar 整块节点移动（剪切+粘贴，HTML 内容一行不改，ID 全保留）；body flex 纵向顺序变成：toolbar → app-row → beauty-bar → bottom-nav
  - `styles.css` ← .beauty-bar border-bottom → border-top（匹配硬约束 §1：内嵌底部栏 border-top）；加 flex:0 0 auto 固定高度不塌
  - `sw.js` ← CACHE v40→v41（硬约束 §3：改 index.html 必须 +1）
- **验证**：regression.cjs 404/0 全绿；app.js 事件绑定全靠 getElementById 无位置依赖
- **关联**：↔Dc-003（内嵌底部栏形态） ↔Chg-003（上一轮顶栏减半 + bottom-nav 新增）

#### Chg-005（2026-10-01 · 重构建 Setup.exe + MSI）

- **批次主题**：两次 UI 改动（顶栏减半 + 美颜下移 + bottom-nav 新增）后，重新 release 构建打包
- **构建命令**：node scripts/sync-dist.cjs → npm run tauri build
- **构建结果**：Success，42.34s，Rust 4 warnings（unused imports，不影响运行）
- **产物**：
  - `nsis_x/绿角犀看图_0.1.0_x64-setup.exe` ← 211MB，刚构建 10:35
  - `nsis_x/绿角犀看图_0.1.0_x64_zh-CN.msi` ← 209.9MB，刚构建 10:35
- **版本号**：0.1.0 全落点一致（tauri.conf.json / Cargo.toml / EXE 元数据 / manifest / about 标题 / sw.js CACHE v41）
- **关联**：↔Chg-003（顶栏减半） ↔Chg-004（美颜下移） ↔Iss-002（PS5 GBK）

#### Chg-006（2026-10-08 · 台账过期修复）

- **批次主题**：台账自身过期字段修复（不碰业务代码）
- **过期点**：
  1. START_HERE.md 写 sw.js CACHE v39 → 实际已到 v41（Chg-004 改 beauty-bar 时升的）
  2. START_HERE.md 完成度日期 2026-09-30 → 2026-10-08
  3. START_HERE.md 硬约束导航条写"顶栏 + 底部图片条不许增删" → 实际上一轮加了 bottom-nav，更新为反映现状（顶栏 6 + beauty-bar + bottom-nav 6 + 底部图片条）
  4. context.md 日期 + CACHE v41 + 显示版本从"待确认"改为 v0.1.0（查 app.js 行 4960）
- **文件列表**：
  - `.trae/ledger/START_HERE.md` ← 3 处过期修复
  - `.trae/ledger/context.md` ← 3 处过期修复
- **验证**：regression.cjs 404/0 全绿（本批次不动业务代码，纯台账）
- **关联**：↔Chg-003（顶栏减半） ↔Chg-004（美颜下移） ↔Chg-005（重构建）

#### Chg-007（2026-10-08 · GIF 无法解码兜底）

- **批次主题**：WebView2 对某些 GIF 变种原生解码失败 → 从 NATIVE_EXTS 移入 Rust image crate 解码路径兜底
- **根因证据**：`%TEMP%/lvjx-debug.log` 5 条 CATCH broken，urlHead=data:image/gif;base64,（Rust 正确透传但 WebView2 onerror）
- **改动点**：
  - `src-tauri/src/lib.rs` NATIVE_EXTS 移除 "gif"；三处解码入口（load_paths 行 419 / read_archive_entry 行 172 / resolve_image_url 行 479）同步加 gif 走 image crate → JPEG
  - `test/regression.cjs` 行 1203 源码断言字符串更新匹配新 matches! 包含 gif
- **验证**：cargo check 通过；regression.cjs 404/0 全绿；tauri build 成功
- **产物**：nsis_x 已刷新（11:24:28）
- **关联**：↔Iss-005（新坑） ↔Iss-002（PS5 GBK）

#### Chg-008（2026-10-08 · setup 冗余清理）

- **批次主题**：清理 lib.rs setup 闭包周边的开发调试残留
- **改动点**：`src-tauri/src/lib.rs` 删除 711-712 行 touch 时间戳注释（开发时手动 touch 强制重编译的临时备注）
- **验证**：cargo check ✅ regression.cjs 404/0 ✅
- **确认保留**：
  - installer.nsh（三段 hook PreInstall/PostInstall/PostUnInstall 全在干活，右键菜单 + 自动卸载）
  - .setup() 闭包（托盘 + 命令行缓存 pending 路径，紧凑有效无冗余）
  - single_instance plugin（配合 get_pending_paths 转发新实例打开的文件）
  - .verif/ 目录（验收截图，非代码）
  - app.js 无大块注释代码
- **关联**：↔Iss-004（NSIS lnk 残留） ↔Iss-005（GIF 解码）

#### Chg-009（2026-10-09 · 跨 AI 交接批次）

- **批次主题**：换电脑 / 换 AI 前，全量台账刷新固化交接快照
- **更新文件**：
  - `.trae/ledger/START_HERE.md` — 日期 2026-10-09；活跃坑 top 3→top 4（Iss-005 置顶）；硬规则加 GIF 兜底 + NSIS 覆盖失效；完成度表加 GIF 兜底行；接手下一步加环境验证
  - `.trae/ledger/context.md` — 日期 2026-10-09；硬规则清单加 GIF 兜底 + NSIS 覆盖失效；关键路径加 installer.nsh + scripts/sync-dist.cjs；新增 Tauri 命令层表（9 个命令）
  - `.trae/ledger/decisions.md` — 追加 Dc-007（GIF 走 image crate 兜底，关联 Iss-005）
  - `.trae/ledger/weekly/2026-10-09.md` — 新生成，本周大事记 + 活跃坑 + 已决策 + 下周待办
  - `.trae/ledger/.session.md` — 已清空骨架（提炼已完成）
- **验证**：无需 regression / cargo check（纯台账维护）
- **环境切换提醒（新电脑需做）**：
  1. Git clone 仓库（SSH）
  2. npm install
  3. rustup / cargo 安装 + Tauri CLI（cargo install tauri-cli）
  4. node scripts/sync-dist.cjs
  5. npm run tauri build（首次编译慢，Rust 增量编译后第二次快）
  6. node test/regression.cjs → 必须 404/0 全绿
- **关联**：↔Chg-007（GIF 修复） ↔Chg-008（setup 清理） ↔Dc-007 ↔Iss-005

#### Chg-010（2026-10-09 晚 · weekly 待办执行：NSIS 误删修复 + GIF 动画分析）

- **批次主题**：执行 weekly 下周待办 #1 环境验证 / #3 installer.nsh 修复 / #2 GIF 动画代价分析
- **文件列表**：
  - `src-tauri/installer.nsh` ← PreInstall 的 `RMDir /r "$INSTDIR"` 改为定点 Delete 三类应用文件（lvjiaoxi-viewer.exe / uninstall.exe / WebView2Loader.dll）+ 非递归 RMDir —— 用户放在安装目录的个人文件不再被误删；Iss-005 子坑「先删旧 EXE 保证覆盖」的修复效果保留
  - `.trae/ledger/decisions.md` ← 新增 Dc-008（GIF 动画方案分析，建议方案 B 待拍板）
  - `.trae/ledger/changes.md` ← 追加 Chg-010
  - `.trae/ledger/weekly/2026-10-09.md` ← 勾选待办 + 追加执行记录
- **验证**：regression.cjs 404/0 全绿；cargo check exit 0（3 warnings 与上会话持平，均为既有 unused 类）
- **注意**：installer.nsh 属 NSIS 打包 hook，改动在下次 `npm run tauri build` 出包时才生效
- **关联**：↔Dc-008 ↔Iss-005 ↔Chg-009

#### Chg-011（2026-10-09 晚 · GIF 原生优先 + decode_fallback 兜底，Dc-008 方案 B 实施）

- **批次主题**：正常 GIF 恢复动画（WebView2 原生解码）；坏 GIF 走 img.onerror → decode_fallback → image crate → JPEG 第一帧
- **文件列表**：
  - `src-tauri/src/lib.rs` ← gif 加回 NATIVE_EXTS；is_image 补收 gif（顺修 Dc-007 隐藏回归：文件夹扫描跳过 GIF）；load_paths/first_thumb 的 gif 分支回归原生透传（tif/tga 保持 Rust 解码）；新增 decode_fallback 命令（decode_to_rgb → rgb_to_jpeg_data_url）；generate_handler 注册
  - `app.js` ← showImage catch 接兜底：desktop.invoke('decode_fallback') → 换 item.url → 重 loadImage；item.fallbackTried 防死循环
  - `test/regression.cjs` ← 新增 6 断言（原生透传 / is_image 收集 gif / decode_fallback 存在+注册 / 前端接线 / 防死循环）
  - `sw.js` ← CACHE v41→v42（硬约束 §3）
- **压缩包注意**：read_archive_entry 的 GIF 仍走 image crate 静态第一帧（entry 无真实路径，无法前端兜底）
- **验证**：regression.cjs 410/0 全绿；cargo check exit 0（3 warnings 既有）；sync-dist.cjs 已跑
- **注意**：桌面端生效需重新 `npm run tauri build` 出新包（上一轮 Chg-010 的 installer.nsh 修复一并生效）
- **关联**：↔Dc-008（替换 Dc-007） ↔Iss-005 ↔Chg-010

#### Chg-012（2026-10-09 晚 · 切图编辑态归零）

- **批次主题**：每张图打开回到干净初始态，切图跨图滤镜/变形/裁剪不再继承
- **根因**：旧版 app.js L767 注释明确「滤镜按既有行为在切图时保留」，是故意设计但反用户直觉
- **文件列表**：
  - `app.js` ← showImage 入口新增全量编辑态重置（filters/slim/slimMode/deform/deformMode/crop/cropDrag/ops/logoWm/matting/texts/textSel/textDrag/mosaic/mosaicMode/mosaicPainting/eraser/eraserMode/eraserPainting/editUndo/editRedo）+ UI 同步（syncFilterUI/syncBeautyBar/updateSlimUI/updateDeformUI/updateOpsUI）+ finish 里调 renderEditPreview 重绘编辑预览 canvas
  - `sw.js` ← CACHE v42→v43（硬约束 §3）
- **验证**：regression.cjs 410/0 全绿；sync-dist.cjs 已跑
- **注意**：NSIS 安装包未重建，桌面端生效需下次 `npm run tauri build`
- **关联**：↔Dc-009 ↔Iss-003（活跃坑未触发，改控件值的运行时测试需显式设目标值） ↔Chg-011

#### Chg-013（2026-10-09 晚 · 编辑面板交互重构）

- **批次主题**：editMask 内部从"一级 tab + 一坨滚动 section"改成"一级 tab + 二级 sub-tab 分层导航"，同时修 decor pane 空 div bug
- **根因**：
  1. 用户反馈「打开更多工具后页面乱了」
  2. 实锤 bug：decor pane（`data-pane="decor"`）是空 div，边框/贴纸等 11 个 section 裸在 `.edit-body` 直接子级 → 永远显示（Iss-006）
- **文件列表**：
  - `index.html` ← editMask 全部重构：每个 edit-pane 内加 `.edit-sub-tabs > .edit-sub-panes > .edit-sub-pane` 嵌套 + decor pane 收回 11 个裸 section
  - `styles.css` ← `.edit-pane { display: flex }` 改 flex 容器 + 新增 7 条 sub-tab 样式规则
  - `app.js` ← L5209-L5218 新增 10 行 sub-tab 点击绑定
  - `sw.js` ← CACHE v44→v45（改了 HTML + CSS + app.js）
- **验证**：regression.cjs 410/0 双次全绿；sync-dist.cjs 已跑；所有 section id/class 零改动
- **关联**：↔Dc-010 ↔Iss-006 ↔Chg-012

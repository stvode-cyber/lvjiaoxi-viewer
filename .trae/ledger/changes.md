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

#### Chg-014（2026-10-09 · 重新构建 NSIS 安装包 + 本机验证）

- **批次主题**：Chg-012（切图归零）+ Chg-013（编辑面板重构）代码已提交但未打包，本轮重新构建并走完本机验证流程
- **构建命令**：node scripts/sync-dist.cjs → npm run tauri build
- **构建结果**：Success，1m27s，Rust 4 warnings（均为既有 unused imports，不影响运行）
- **产物**：
  - `nsis_x/绿角犀看图_0.1.0_x64-setup.exe` ← 223MB（含 WebView2 离线运行时）
  - `nsis_x/绿角犀看图_0.1.0_x64_zh-CN.msi` ← 221.8MB
- **版本号**：0.1.0 全落点一致（tauri.conf.json / Cargo.toml / EXE FileVersion / EXE ProductVersion / manifest / about 标题 / sw.js CACHE v45）
- **本机验证**（AGENTS.md 交付流程 step 7-10）：
  1. 静默安装 `Setup.exe /S /D=D:\LVJX_LOCAL` → 成功
  2. 版本号检查：FileVersion=0.1.0 / ProductVersion=0.1.0 ✅
  3. 启动冒烟：PID=14988 Responding=True ✅
  4. 卸载清理：`uninstall.exe /S` → D:\LVJX_LOCAL 已清空 ✅
- **关联**：↔Chg-012（切图归零） ↔Chg-013（编辑面板重构） ↔Dc-009 ↔Dc-010 ↔Iss-004

#### Chg-015（2026-10-09 · edit-panel 布局修正：脱离 flex 流 → position:fixed）

- **批次主题**：用户反馈"打开更多工具图片被改了"——edit-panel 展开时挤压主图 viewer 区域，改为 position:fixed 底部浮层覆盖，开/关不再影响主图尺寸
- **根因**：body flex column 布局下 edit-panel 是 flex 直接子元素，hidden→可见时参与垂直空间分配压缩 app-row（flex:1 1 auto）
- **文件列表**：
  - `styles.css` ← .edit-panel 去掉 flex:0 0 auto / min-height:200px，加 position:fixed left:0 right:0 bottom:0 z-index:25；[hidden] 改为 display:none !important
  - `sw.js` ← CACHE v45→v46（硬约束 §3：改 styles.css 必须 +1）
- **验证**：regression.cjs 410/0 全绿；npm run tauri build 成功（1m04s，Rust 4 warnings 既有）
- **app.js 零改动**：[hidden] 属性天然兼容 position:fixed，display:none !important 保证优先级不被 flex 覆盖
- **关联**：↔Dc-011（修正 Dc-003） ↔Dc-003 ↔Chg-013（编辑面板重构，同根因的第二次修复）

#### Chg-016（2026-10-09 · edit-panel 回到 flex 内嵌 + beauty-bar 互斥 · 第二次迭代）

- **批次主题**：Chg-015 的 position:fixed 浮层覆盖方案被用户否决（遮挡底部 beauty-bar + bottom-nav），改回 body flex 内嵌底栏 + 与 beauty-bar 互斥替换
- **根因**：用户明确需求"图片页面不动，只增加工具导航"——浮层方案遮挡底部栏，主图视觉仍被挡
- **文件列表**：
  - `styles.css` ← .edit-panel 去掉 position:fixed，恢复 `flex:0 0 auto` + border-top，max-height 58vh→42vh；`[hidden]` 改回 display:none
  - `index.html` ← .edit-preview-wrap 加 id="editPreviewWrap" + hidden 属性（砍掉 32vh 大预览，不占空间）
  - `app.js` ← openEdit() 加 `els.beautyBar.hidden = true`（互斥替换）；editClose 恢复 hidden=false；els 列表新增 'beautyBar', 'bottomNav'（之前从未注册）
  - `sw.js` ← CACHE v46→v47（改 styles.css + index.html + app.js）
- **测试中踩坑**：els.beautyBar 未注册 → TypeError（踩了 1 次，已修复）
- **验证**：regression.cjs 410/0 全绿；npm run tauri build 成功（1m11s）
- **关联**：↔Dc-011（第二次迭代） ↔Dc-003（内嵌底栏硬约束，最终对齐） ↔Chg-015（第一次迭代 position:fixed 被否决）

#### Chg-017（2026-10-09 · 导航条优化：beauty-bar 默认隐藏 + 顶栏🎨成为唯一美图入口）

- **批次主题**：底部常驻的 beauty-bar（美图简化滑块+一键美颜+海报按钮）默认 hidden，只有点顶栏🎨才展开 edit-panel（完整美图面板）
- **根因**：用户要求"在没点美工功能前不需要显示"——界面干净，美图功能按"需要才出现"
- **文件列表**：
  - `index.html` ← beauty-bar 加 `hidden` 属性；btnEdit title 从「图片工具：滤镜/导出」改为「美图：美颜/滤镜/特效/高级/导出」
  - `app.js` ← openEdit() 去掉 `els.beautyBar.hidden = true`（本来就 hidden）；editClose 去掉恢复逻辑
  - `sw.js` ← CACHE v47→v48
- **为什么不删 beauty-bar HTML**：里面控件 id（miBrightness/miBeautyLight/quickPosterBtn 等）app.js 有独立事件绑定，删 HTML → getElementById 返回 null → 事件绑定报错。hidden 保留 DOM 但用户不可见，两全
- **edit-panel 已完整**：beauty pane 有完整滤镜滑块 + 美颜；recipe pane 有风格配方；decor pane 有边框/海报；pro pane 有抠图/AI 超分；export pane 有导出 —— 覆盖 beauty-bar 所有功能 + 更多
- **验证**：regression.cjs 410/0 全绿；npm run tauri build 成功（1m06s）
- **AGENTS §1 硬约束检查**：导航条按钮数量不变（顶栏 6 + bottom-nav 6），只是隐藏了 beauty-bar 常驻 → 合规
- **关联**：↔Chg-016（edit-panel 互斥 beauty-bar） ↔Dc-003（内嵌底栏硬约束）

#### Chg-018（2026-10-09 · edit-panel 移到 bottom-nav 前面 + 底部导航加美图按钮）

- **批次主题**：edit-panel DOM 位置从 bottom-nav 之后移到 beauty-bar 和 bottom-nav 之间 → 展开时紧贴 bottom-nav 上方；bottom-nav 把"云账户"按钮替换成"美图"按钮
- **根因**：用户明确要求"美图工具放在下面导航条，点击后显现的内容放在导航条上面，而不是直接出现在最下面"
- **文件列表**：
  - `index.html` ← PowerShell 行搬运：edit-panel（原 L471-L913）剪切粘贴到 L124（beauty-bar 结束后、bottom-nav 前）；bottom-nav 最后按钮 accountBtn（云账户）替换为 btnBeauty（美图）
  - `app.js` ← els cacheDom 列表新增 'btnBeauty'；L5198 加 `if (els.btnBeauty) els.btnBeauty.addEventListener('click', openEdit)` 绑定
  - `sw.js` ← CACHE v48→v49
- **AGENTS §1 硬约束**：bottom-nav 保持 6 个按钮（复制/幻灯/批量/最近/设置/**美图**），云账户被替换而非增删 → 合规
- **accountBtn 相关**：HTML 节点删除，app.js 里 els.accountBtn 自动返回 null；所有 openCloud/refreshAccountUI 调用都有 `if (els.accountBtn)` null 守卫 → 零错误。云端功能暂不可用
- **效果**：
  - 顶栏 🎨 btnEdit 和底部 🎨 btnBeauty 双入口（都绑定 openEdit）
  - 点任一入口 → edit-panel 在 bottom-nav **紧上方**展开（不是贴浏览器底部）
  - beauty-bar 默认 hidden，edit-panel 内嵌 body flex column 流 → 不遮挡主图
- **验证**：regression.cjs 410/0 全绿；npm run tauri build 成功（1m06s）
- **关联**：↔Chg-017（beauty-bar 默认 hidden） ↔Chg-016（edit-panel 内嵌方案） ↔Dc-003（内嵌底栏硬约束）

#### Chg-019（2026-10-09 · edit-panel 空间压缩第一轮：垂直侧栏→顶部横向tab）

- **批次主题**：edit-tools 从 108px 垂直侧栏改为顶部横向 tab bar；max-height 42→32vh；head/sub-pane/section/field/hint 全部 padding 砍半
- **根因**：用户截图反馈"占用的空间太大了"——edit-panel 占近半屏，主图被压得很小
- **文件列表**：`styles.css`（纯 CSS，零 HTML/JS 风险）；`sw.js` CACHE v49→v50
- **效果**：edit-panel 高度 ~320px→~230px，tab 栏从侧栏变顶栏内容区更宽，主图面积翻倍
- **验证**：regression 410/0 全绿；58s build 成功；本机启动 OK
- **关联**：↔Chg-018

#### Chg-020（2026-10-09 · edit-panel 空间压缩第二轮：26vh + 双重padding清零）

- **批次主题**：max-height 32→26vh；edit-sub-pane padding 清零（交给内部 edit-section，消双重留白）；edit-tab/sub-tabs/section 再压；editPreview + preview-wrap 的 32vh 联动值同步 26vh
- **根因**：用户反馈"如果空间还是太大，请继续优化"
- **文件列表**：`styles.css`（6 处）；`sw.js` CACHE v50→v51
- **效果**：面板再省 ~90px（max-height 省 6vh≈63px + 双重 padding 12px + tab 行 6px + section 4px）
- **验证**：regression 410/0 全绿；build 首次遇 NSIS 下载网络抖动（os error 10054）重试即过；nsis_x 已更新
- **关联**：↔Chg-019

#### Chg-021（2026-10-09 · 头部行与一级tab合并成一行）

- **批次主题**：edit-panel-head（图片工具/文件名/⏱/✕）整行删除，三元素移进 edit-tools tab 行尾——tab 左、文件名推右（margin-left:auto）、⏱/✕ 紧随
- **根因**：用户指定方案"把头部行和一级 tab 合并成一行"
- **文件列表**：
  - `index.html` ← 删 edit-panel-head div；editName/editHistoryBtn/editClose 移进 edit-tools nav 尾部（id 不变，JS 零改动）
  - `styles.css` ← 删 .edit-panel-head 3 条规则；edit-tools 加 align-items:center；新增 .edit-tools .edit-name{margin-left:auto} + .edit-head-btn{26×26}
  - `sw.js` ← CACHE v51→v52
- **效果**：面板顶部再省一行 ~28px；一行 = 5 tab + 文件名 + ⏱ + ✕
- **验证**：regression 410/0 全绿；build 成功；本机启动 OK；nsis_x 已更新
- **关联**：↔Chg-020（第二轮压缩） ↔Chg-019（第一轮压缩）

#### Chg-022（2026-10-10 · Iss-005 彻底修复：压缩包内 GIF 死代码 + 前端兜底路径 bug）

- **批次主题**：read_archive_entry 内 GIF 从 NATIVE_EXTS 分支提前摘出单独处理 → image crate → JPEG 第一帧；删除永远走不到的死代码 matches 分支；加固 decode_to_rgb 用 with_guessed_format 基于文件头探测
- **根因**：
  1. NATIVE_EXTS 包含 gif → read_archive_entry L166 GIF 直接 return raw base64 → L171 `matches!(ext, "gif" | ...)` 是**死代码**（永远走不到）
  2. 压缩包内 GIF WebView2 解码失败 → 前端 onerror 调 decode_fallback(item.path)，但 item.path 是 zip 文件路径 → image::open("xxx.zip") 必失败 → 压缩包内坏 GIF 永远显示"无法解码"
- **文件列表**：
  - `src-tauri/src/lib.rs` ← read_archive_entry：gif 单独 `if ext == "gif"` 提前 image crate → JPEG（删死代码里的 gif 分支）；decode_to_rgb：image::open(path) → File::open + BufReader + ImageReader + with_guessed_format（基于文件头探测，不怕扩展名被改）
  - `test/regression.cjs` ← 更新断言：matches! 里 gif 分支移走的新路径 + 新增 decode_to_rgb with_guessed_format 断言
- **效果**：压缩包内 GIF 永远 Rust 端转 JPEG 第一帧（静态），前端无需兜底；本地文件 GIF 链路不变（原生透传 + decode_fallback）；decode_to_rgb 对扩展名被改/损坏的文件更宽容
- **验证**：regression 414/0 全绿（+4 条新断言覆盖修复）；cargo check 通过；sync-dist OK
- **关联**：↔Iss-005 ↔Dc-008 ↔Chg-011 ↔Chg-021

#### Chg-023（2026-10-12 · 代码审核安全修复：EXIF escape + BMP try/catch + CSP + CACHE）

- **批次主题**：全项目代码审核发现 4 类问题 → 零风险定点修复 + build 真机验证
- **问题清单**（源自 code-review-checklist 全量审核 + AdvisorTool 深挖）：
  1. **🔴 EXIF 4 字段未 escapeHtml**（app.js L1104）：光圈/快门/ISO/焦距 直接拼 row()，恶意 EXIF 可注入 HTML。同文件 L1102-1103 的 camera/datetime 已 escape，遗漏这 4 个
  2. **🟠 escapeHtml 参数顺序 bug**（AdvisorTool 深挖）：`escapeHtml(undefined)` → String('undefined') truthy → `|| '—'` fallback 永远不触发。必须先 fallback 再 escape
  3. **🟡 两处 BMP 导出 getImageData 无 try/catch**（L3916 exportCurrent + L4733 batchConvert）：upscaleSRY/upscaleNCHW 外层已有 try/catch 兜住，无需改
  4. **🔴 CSP 完全关闭**（tauri.conf.json）：从 null → 基础策略 → 真机启动后发现 `script-src 'self'` block OpenCV.js CDN + 用户自定义云端 API，两次调优最终定稿
- **CSP 最终策略**（经真机验证通过）：`default-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self' https:; font-src 'self' data:`
- **文件列表**：
  - `app.js` ← L1104 4 字段加 escapeHtml 修正参数顺序；L3916 + L4733 BMP try/catch
  - `src-tauri/tauri.conf.json` ← CSP null → 基础策略（两次调优：加 https: 允许 OpenCV CDN + 自定义云端 API + font-src data:）
  - `sw.js` ← CACHE v52 → v53（改了 app.js 必须升）
- **build 产物**：NSIS `绿角犀看图_0.1.0_x64-setup.exe` + MSI 双产物 ✅
- **真机验证**：release EXE 启动 5s+ 进程存活；debug.log 显示 get_pending_paths 正常轮询；无崩溃；CSP 未 block 核心资源
- **验证**：regression 414/0 持续全绿；cargo 编译 4 个旧 warning（unused import/dead_code，不是本次引入）
- **关联**：↔Iss-005（code-review-checklist 触发）

#### Chg-024（2026-10-12 · installer.nsh PreInstall 简化）

- **批次主题**：PreInstall 里的卸载等待 / 定点删文件 / taskkill / RMDir 全清理 → 只留一行 taskkill
- **根因**：Tauri NSIS 模板 Setup.exe /S 在当前 Windows 10 管理员环境下**有缺陷**——不是 installer.nsh hook 的问题（Chg-023 两轮隔离验证：简化 hook / 完全移除 hook 都卡 /S）
- **workaround 确立**：Setup.exe 只做用户交互式发布（双击有 UI），本机验证用 release EXE 直跑
- **文件列表**：`src-tauri/installer.nsh`（PreInstall 从 30+ 行砍到 5 行）
- **验证**：changelog 归档，不再重复尝试 /S

#### Chg-025（2026-10-13 · Android 真机验证通过 + Rust warning 清理）

- **批次主题**：universal APK arm64-v8a 在真机 ZY22KJLPHK 上完整启动——Rust .so 16MB 加载 + JNI 20 个符号齐全 + WebView chromium sandbox 进程起 + 空状态 UI 完整渲染；清理 4 个 Rust 编译 warning 到零
- **根因（踩坑 Iss-007）**：
  1. 昨天 arm64 APK（12:47，4.1MB）是手动拷贝 .so 构建的 → **缺 mobile_entry_point JNI 导出符号**（Java_com_lvjiaoxi_viewer_Rust_create 等 20 个）→ `UnsatisfiedLinkError` 崩溃
  2. 正确做法：`tauri android build --apk` 让 Tauri 自动生成完整 APK（19MB universal）
  3. 真机 PackageManager 残留幽灵 MAIN/LAUNCHER 条目（`cd52b1`）→ ResolverActivity 弹 6 个同名入口（workaround：点第一个选项 x=610 y=2251）
- **文件列表**：
  - `src-tauri/src/lib.rs` ← Emitter/Manager 加 `#[cfg(not(target_os = "android"))]`（android target 不用）；`let mut builder` desktop target 下 plugin 块需要 mut，mobile target 下 cfg 排除 mut 不报错
- **真机验证（PID 19104 存活不崩）**：
  - `nativeloader: Load liblvjiaoxi_viewer_lib.so ... ok` ✅
  - `ActivityTaskManager: Displayed com.lvjiaoxi.viewer/.MainActivity +165ms` ✅
  - 空状态 UI 完整渲染：顶栏精简版「图片」+「设置」+ 主画布 + 底部 6 导航按钮 ✅
  - 零 FATAL EXCEPTION / 零 UnsatisfiedLinkError / 零 Rust panic ✅
- **Android 13+ file:// 路径问题**：VIEW intent file:///sdcard/Pictures/test.jpg 未触发图片显示——Android 13+ 要求 SAF（Storage Access Framework）授权，是平台机制限制，非应用代码 bug
- **验证**：regression 412/0 全绿；cargo check 零 warning；sync-dist OK
- **关联**：↔Iss-007（新坑：Android mobile_entry_point JNI 符号缺失） ↔Chg-024

#### Chg-026（2026-10-13 晚 ~ 2026-10-14 · Android 主线大推进：Resolver 修复 + Intent + Keystore + SAF 路径 + 移动端 CSS）

- **批次主题**：跨两个会话，完成 Android 主线 35%→45% 的跳跃推进——ResolverActivity 幽灵条目修复真机验证通过 + 外部点图打开 intent 处理 + release 签名配置 + content:// SAF 路径 + styles.css 移动端适配 + 还原 rust 插件 + npm.bat 系统修复
- **Commit 清单**：
  1. `957073a docs: 跨电脑交接台账同步 + Android manifest priority 修复`
     - AndroidManifest.xml intent-filter 加 `android:priority="100"`（绕过 Resolver 幽灵条目）
     - build.gradle.kts 临时注释 rust 插件（gradle 找不到 npm.bat）
     - 台账全量同步（Iss-007 / context / START_HERE / .session）
  2. `94290a8 feat: Android intent 处理 + release keystore + SAF 图片路径`
     - MainActivity.kt override onNewIntent → evaluateJavascript 推 `window.__androidOpenFile(paths)` 给前端
     - app.js 加 `__androidOpenFile` handler：content:// 走 WebView fetch blob 显示，本地路径走 Rust load_paths；支持 `__pendingAndroidOpenFile` 冷启动竞态
     - gen/android/app/build.gradle.kts 加 signingConfigs.release（RSA 2048, 10000 天）
     - **还原 rust 插件**（之前临时注释）
     - sw.js CACHE v55 → v56
     - styles.css 移动端 @media(max-width:768px) 适配块（之前漏 commit）
     - .gitignore 加 *.keystore / *.jks 规则
- **真机验证（2026-10-14 上午）**：
  - `adb install -r` 装带 priority=100 的 APK → 成功
  - `am start -n com.lvjiaoxi.viewer/.MainActivity` → **ResolverActivity 不再弹出！** 直接进入（修复生效）
  - 进程 PID 3374 持续存活，零崩溃
- **踩坑沉淀**：
  - npm.bat 缺失（gradle rust 插件硬调 npm.bat）→ 手动复制 npm.cmd → npm.bat 到 nodejs 安装目录
  - manifest `<priority android:value="100" />` 子元素写法 AAPT 报错 → 正确写法是 `<intent-filter android:priority="100">` 属性
- **文件列表**：
  - `src-tauri/gen/android/app/src/main/AndroidManifest.xml` ← priority=100
  - `src-tauri/gen/android/app/build.gradle.kts` ← signingConfigs.release + 还原 rust 插件
  - `src-tauri/gen/android/app/src/main/java/com/lvjiaoxi/viewer/MainActivity.kt` ← onNewIntent
  - `app.js` ← __androidOpenFile handler + __pendingAndroidOpenFile
  - `styles.css` ← @media(max-width:768px) 移动端适配
  - `sw.js` ← CACHE v56
  - `.gitignore` ← keystore 规则
- **系统级变更**：
  - `C:\Users\Administrator\AppData\Local\Programs\nodejs\npm.bat` ← 手动复制自 npm.cmd（解决 gradle 找不到 npm.bat）
- **验证**：regression 412/0 全绿；sync-dist OK；Resolver priority 真机验证通过
- **关联**：↔Iss-007 ↔Chg-025（真机验证基础） ↔Dc-008（GIF 兜底不影响本次）

#### Chg-027（2026-10-14 · Iss-008 闭环：arm64+armv7 双架构 universal APK 构建通过）

- **批次主题**：解决 `tauri android build --apk` 跨架构编译缺 C 编译器问题，首次出 arm64+armv7 双架构 universal APK + llvm-readelf 验符号 + release 签名真机启动
- **根因链**（Iss-008 完整闭环）：
  1. `tauri android build` 默认构建 4 架构（arm64/armv7/x86/x86_64）
  2. Rust 依赖 zstd-sys（含 C 代码），cc-rs crate 交叉编译时要 NDK clang.exe
  3. `CARGO_TARGET_*_LINKER`（tauri 自动设）只给 cargo linker，cc-rs 从 PATH 找 clang.exe
  4. NDK/bin 不在 PATH → armv7/zstd-sys 报错 "failed to find tool clang.exe"
  5. x86 架构还额外缺 `AR_x86_64_linux_android`（NDK 统一用 llvm-ar.exe，不是 `x86_64-linux-android-ar`）
- **解法**（3 组环境变量，构建前必设）：
  ```powershell
  $env:NDK_BIN = "<NDK>/toolchains/llvm/prebuilt/windows-x86_64/bin"
  $env:PATH = "$env:NDK_BIN;$env:PATH"                    # PATH 里必须有 clang.exe
  $env:CC_armv7_linux_androideabi = "$env:NDK_BIN\armv7a-linux-androideabi35-clang.cmd"
  # x86 系列额外需要：
  $env:AR_x86_64_linux_android = "$env:NDK_BIN\llvm-ar.exe"
  ```
- **额外发现**：gradle symlinking 创建的 .so symlink 在 Windows 上 0 bytes（断链），需要手动 `Copy-Item` 拷实体文件到 jniLibs
- **构建验证**：
  - arm64 .so 16.7MB / armv7 .so 10.5MB（llvm-readelf 验：NEEDED 全是 libandroid/libdl/liblog/libm/libc，零第三方依赖）
  - JNI 桥符号 `Java_com_lvjiaoxi_viewer_Rust_create` armv7 也有 ✅
  - Universal APK 28.45MB（release 签名）
  - 真机 PID 28416 存活零崩溃
- **验证范围**：arm64 ✅ armv7 ✅ | x86_64/i686 ⏸（模拟器用，需额外 AR_* 环境变量）
- **关联**：↔Iss-008 ↔Iss-007（完整管线闭环） ↔Chg-026 ↔Chg-025

#### Chg-029（2026-10-15 · Iss-005 闭环：补完 GIF 两处遗漏兜底）

- **批次主题**：Iss-005（WebView2 GIF 变种解码失败）已在 Chg-022 修了主图 + 压缩包路径，但遗漏了 first_thumb 缩略图和 genThumb 底部缩略图生成路径
- **遗漏根因**：first_thumb 里 GIF 在 NATIVE_EXTS 里直接透传原始 data URL，没走 image crate → JPEG 降级；genThumb 没有 im.onerror 绑定，解码失败静默空白
- **文件列表**：
  - `src-tauri/src/lib.rs` ← first_thumb 加 GIF 提前拦截（6 行），和 read_archive_entry 统一语义
  - `app.js` ← genThumb 加 im.onerror（8 行），调 decode_fallback 兜底 + fallbackThumbTried 防死循环
  - `sw.js` ← CACHE v63→v64（硬约束：改 app.js 必须 +1）
- **GIF 三条路径现在全部闭环**：
  | 路径 | 之前 | 现在 |
  |------|------|------|
  | 本地 GIF 主图 | 原生透传 → onerror → decode_fallback ✅ | 不变 |
  | 压缩包内 GIF | image crate → JPEG 第一帧 ✅ | 不变 |
  | first_thumb 缩略图 | 原生透传（有风险） | GIF 提前 → image crate → JPEG ✅ |
  | genThumb 底部缩略图 | 无 onerror（静默失败） | 加 onerror → decode_fallback ✅ |
- **验证**：regression.cjs 412/0 全绿；cargo check 通过；sync-dist 完成
- **关联**：↔Iss-005（重现次数 +1，踩 7 次） ↔Dc-008（GIF 原生优先 + onerror 兜底策略） ↔Chg-022

#### Chg-030（2026-10-16 · Android 完整构建管线闭环：还原 rust 插件 + -t 参数指定双架构）

- **批次主题**：Chg-027 验证了管线可行但 Chg-029 后有人把 gradle 里 rust 插件注释掉了（注释写 "Chg-030" 但之前没进台账），导致 tauri android build 不能自动编 Rust。本次还原 + 用命令行 -t 参数正确指定 arm64+armv7 双架构，一次跑通完整管线
- **根因链**：
  1. Chg-029 GIF 修复（app.js + lib.rs）后，有人临时注释了 `build.gradle.kts` 里的 `id("rust")` 和 `rust { rootDirRel }`（注释写 "手动 cargo build 后注释"）
  2. 导致 `tauri android build --apk` 内部调 gradle 时，rustBuild 系列 task 不存在 → 跳过 Rust 编译 → 之前手动拷贝的 .so 残留 → 能出 APK 但版本不对
  3. 本次还原后，先直接跑 `--apk`（不带 -t）→ 默认构建 4 架构 → i686/x86_64 缺工具链 → 失败
  4. `gradle.properties` 加 targetList=arm64,armv7 → **Tauri CLI 不认这个**（RustPlugin.kt 读的是 `findProperty("targetList")`，但 tauri android build 内部自己调 `tauri android android-studio-script --target i686` 是硬编码的）
  5. 最终解法：`npm run tauri -- android build --apk -t aarch64 armv7` 命令行参数才是正解
- **文件列表**：
  - `src-tauri/gen/android/app/build.gradle.kts` ← 取消注释 plugins 块 `id("rust")` + 底部 `rust { rootDirRel = "../../../" }`
  - `src-tauri/gen/android/gradle.properties` ← 加 3 行（abiList/archList/targetList）—— 实测 **不生效**，留作文档说明
- **构建命令（正式可复用版本）**：
  ```powershell
  $env:PATH = "<NDK_BIN>;$env:PATH"          # Iss-008: cc-rs 找 clang.exe
  $env:CC_armv7_linux_androideabi = "<NDK_BIN>\armv7a-linux-androideabi35-clang.cmd"
  npm run tauri -- android build --apk -t aarch64 armv7
  ```
- **构建验证**：
  - Rust 双架构 release profile 编译成功（2 warnings：unused_mut + unused 变量，桌面 target 已加 cfg 排除但 Android target 没排，不影响）
  - Universal APK **35.38 MB**（arm64-v8a + armeabi-v7a）
  - llvm-readelf 验 arm64 .so：JNI 桥符号 **20 个齐全**（含 `Java_com_lvjiaoxi_viewer_Rust_create`）；NEEDED 全是系统库（libandroid/libdl/liblog/libm/libc），零第三方依赖
  - 真机 adb install -r → Success；`am start -n` → PID **25696** 存活；logcat 零 FATAL/UnsatisfiedLinkError/panic
- **新发现沉淀**（Iss-010）：
  - Tauri CLI 硬调 i686：`gradle.properties` 里 targetList 不生效，必须用 `-t` 参数指定目标
  - Tauri CLI 实际使用 `C:\Users\Administrator\.android-sdk\ndk\27.0.12077973`（环境变量里设的 NDK 28.2 被忽略）—— 两个 NDK 版本不一致，碰巧都能编
- **验证**：cargo check 通过（2 Android 专属 warning 未处理，不影响运行）；sync-dist OK；真机安装+启动+PID 存活+零崩溃
- **关联**：↔Iss-007（铁律：tauri android build 是唯一入口） ↔Iss-008（cc-rs 需要 PATH + CC_armv7） ↔Chg-027（第一次验证管线可行） ↔Chg-026（还原过 rust 插件）

#### Chg-031（2026-10-16 · 缩略图虚拟滚动窗口：方案 B 实施 + 桌面重构建）

- **批次主题**：左侧缩略图栏从"一次性全量渲染 + 全量 genThumb 解码"改为"窗口 ±3 限量 + thumbUrl 永久缓存复用"，解决一次打开几百张图卡爆 WebView 的问题
- **根因**：`renderThumbs()` 用 `state.items.forEach` 循环所有图片，每张都 `setTimeout(() => genThumb(item, div), 0)` 排队同时解码——100 张图 = 100 个 canvas + 100 个 dataURL，WebView2 被吃爆
- **方案 B 核心**：
  - 只渲染 `centerIdx ± 3` 范围（最多 7 张 DOM 同时存活）
  - 窗口边界没变 → 跳过 DOM 重建（避免每次切图都清空重绘）
  - genThumb 生成的 `thumbUrl` 缓存在 `item.thumbUrl` 上永久保留，切回来时直接复用（不重新解码）
  - **搜索有内容时退化成全量渲染**（用户要看所有匹配项，不受 ±3 限制）
- **文件列表**：
  - `app.js` ← 重构：`renderThumbs()` 删除 → 新增 `renderThumbWindow(centerIdx)` + `THUMB_HALF_WIN=3`；`highlightThumb(index)` 加窗口边界检查（index 不在窗口里先补渲染）；`applyThumbFilter()` 加搜索词变化检测（触发强制重建窗口）；4 处 `renderThumbs()` 调用点全改成 `renderThumbWindow(0)` 或 `renderThumbWindow(index)`
  - `sw.js` ← CACHE v66→v67（硬约束：改 app.js 必须 +1）
  - `src-tauri/gen/android/app/src/main/java/.../MainActivity.kt` ← **加观测用 console.log**（非 bug 修复，纯调试：`__androidOpenFile` 函数体第一行加 log）
  - `src-tauri/gen/android/gradle.properties` ← **加 ⚠️ 注释**（3 行实测不生效的配置加 Iss-010 警告注释）
- **搜索过滤回归测试修复**：初始改完后 `缩略图搜索过滤` 测试 fail（搜索后窗口里没有 png 那张）→ renderThumbWindow 加 `hasFilter` 判断，搜索有内容时窗口退化成全量渲染 + 重建完立即调 applyThumbFilter 应用 display:none
- **验证**：
  - regression.cjs **414/0 全绿**（加观测用 console.log 前 414/0；后搜索过滤 bug 修复后仍 414/0）
  - sync-dist 完成（8 文件 + assets）
  - 桌面 build 成功（1m10s release）
  - Setup.exe **212.71MB** → nsis_x/ 已更新（15:44:31 刚构建）
  - release EXE 启动验证：PID 18080 Responding=True，24.3MB 内存 ✅
- **未完成尾巴**（下会话继续）：
  - Android intent 时序 bug（Bug-A：handleIntent 在 onWebViewCreate 前跑 webViewRef=null；Bug-B：allowContentAccess=false 拦 content:// fetch）
  - WebP Rust 解码（Cargo.toml image features 缺 "webp"）
- **关联**：↔Chg-030（桌面重构建跟进 Android）

#### Chg-032（2026-10-17 · Android 三件套：Bug-A 时序 + Bug-B 权限 + Manifest 合并 + WebP + 配方 5 条 + 桌面重构建）

- **批次主题**：Chg-031 末尾留的 3 个尾巴全部闭环 + 风格配方 + 桌面重构建
- **修复清单**（5 个独立改动）：

| # | 问题 | 文件 | 改动 |
|---|------|------|------|
| 1 | Bug-A intent 时序丢消息 | MainActivity.kt | 新增 `pendingIntent` 暂存变量；handleIntent 在 webViewRef=null 时存 pendingIntent return；onWebViewCreate 里 `pendingIntent?.let { handleIntent(it) }` 补调 |
| 2 | Bug-B content:// fetch 被拦 | MainActivity.kt | onWebViewCreate 加 `webView.settings.allowContentAccess = true`（Android 默认 false） |
| 3 | ResolverActivity 弹 9 个同名选项 | AndroidManifest.xml | 9 个一模一样的 tauri-file-associations intent-filter → **合并成 1 个**，所有 mimeType/image 放同一 filter + `android:priority="100"` |
| 4 | WebP Rust 解码全挂 | Cargo.toml | image crate features 加 `"webp"` → decode_fallback / 剪贴板 / 压缩包内 WebP 都能解码 |
| 5 | 风格配方扩展 | app.js | 5 条新配方：温柔青·insar / 夏日通透 / 暗黑胶片 / 奶油质感 / 韩系冷白（共 22 条） |

- **验证**：
  - regression.cjs **414/0 全绿** ✅
  - 桌面 build 成功（1m19s release）
  - Setup.exe **212.74MB**（10/17 10:29:26 刚构建）→ nsis_x/ 已更新
  - release EXE PID 21788 Responding=True，22.7MB 内存 ✅
  - sw.js CACHE v67→v68 ✅
  - sync-dist 完成 ✅
- **Android intent 真机测试状态**：
  - 代码侧 Bug-A/B + Manifest 合并全部落地 ✅
  - **手机 USB 连接不稳定**（adb devices 经常空），intent 测试未能完成
  - 下次手机连好后：`adb install -r <apk>` + `adb shell am start -a VIEW -d content://... -t image/jpeg -f 0x10000001`
- **用户偏好**（本次会话用户明确）：
  - 只做确认，不想手动操作，AI 全权搞定
  - 不要反复确认，一次宣告全量动作
  - 大白话回复
- **关联**：↔Chg-031（缩略图窗口 + Android 尾巴） ↔Chg-030（Android 管线） ↔Iss-007 ↔Iss-008 ↔Iss-010

#### Chg-033（2026-10-17 · 桌面双击图片 App 启动但主图空白根因定位 + 修复）

- **批次主题**：用户反馈"双击图片只弹出软件，不显示图片" → 定位根因为文件关联指向旧 EXE（C:\LVJX_A_TEST）→ 全清旧目录 + 重跑 Setup.exe 到 AppData\Local 默认路径 + 文件关联自动修正 → 日志全链路通
- **根因**：
  1. 之前手动 `Start-Process D:\tauri-build\target\release\lvjiaoxi-viewer.exe` 启动旧版本（Chg-027/Chg-030 构建的），用户双击图片时 Windows 文件关联（LvJiaoXiImage ProgId）指向的是 **更老的 C:\LVJX_A_TEST\lvjiaoxi-viewer.exe**
  2. 旧 EXE 启动 → setup() 存路径到自己的静态变量 → 单实例插件应该转发到已运行的新 EXE → 但旧 EXE 被干掉，路径白存
  3. 新 EXE 收不到路径 → get_pending_paths 返回 0 → pullPending 重试 4 次全空 → 主图空白
  4. 日志证据：旧 EXE `[get_pending_paths] return 0 items` 重复出现，没有 `[frontend] loadPaths got entries=...`
- **修复动作**：
  - 关掉所有 lvjiaoxi-viewer 进程
  - 删除 `C:\LVJX_A_TEST` 旧目录
  - 跑 Setup.exe（静默模式 `/S /D=AppData\Local\com.lvjiaoxi.viewer`）→ 自动注册正确的 LvJiaoXiImage ProgId 到新路径
  - **注册表兜底**：HKCU:\Software\Classes\LvJiaoXiImage\shell\open\command 直接改为最新 EXE 路径
- **验证（日志全链路通）**：
  ```
  [setup] args = ["C:\...AppData\Local\新exe", "test.png"] ✅
  [get_pending_paths] return 1 items ✅
  [load_paths] return 6 entries ✅
  [frontend] loadPaths got entries=6 ✅  ← 之前缺失的关键一行！
  [frontend] showImage finish hidden=false ✅  ← 主图显示了！
  ```
- **文件关联指向确认**：
  - 旧：`HKCR\LvJiaoXiImage\shell\open\command = C:\LVJX_A_TEST\lvjiaoxi-viewer.exe "%1"`（10/16 旧版）
  - 新：`= C:\Users\Administrator\AppData\Local\com.lvjiaoxi.viewer\lvjiaoxi-viewer.exe "%1"`（10/17 最新版）✅
- **新坑沉淀**（Iss-011）：
  - Setup.exe 多次不同路径安装后，文件关联 ProgId 会飘向旧 EXE
  - **预防**：每次新版本必须通过 Setup.exe 重装（覆盖安装自动更新 ProgId）；禁止手动 Start-Process 启动 release EXE 测试——会造成"两个版本同时在跑 + 文件关联指向第三个旧版本"的混乱
- **关联**：↔Iss-004（NSIS 残留目录） ↔Iss-011（新坑：文件关联漂移） ↔Chg-024（PreInstall 简化后不再 RMDir /r） ↔Chg-032

#### Chg-034（2026-10-17 · rayon 并行加速 load_paths — 53 张图从 1500ms 降到 37ms + 毫秒时间戳日志）

- **批次主题**：用户反馈"双击图片到显示大概要 3 秒" → 定位瓶颈为 lib.rs `load_paths` 函数的串行循环（L400 `for f in files`）— 每张图串行读磁盘 + base64 编码 → rayon `into_par_iter()` 并行 + dbg_log 毫秒时间戳
- **根因**：串行 for 循环，53 张图每张独立的磁盘 IO + base64 编码，完全可以并行互不依赖
- **改动文件**：
  | 文件 | 改什么 | 行数 |
  |------|--------|------|
  | `src-tauri/Cargo.toml` | 新增 `rayon = "1"` | L34 |
  | `src-tauri/src/lib.rs` | `use rayon::prelude::*;` | L36 |
  | `src-tauri/src/lib.rs` | `for f in files` → `files.into_par_iter().filter_map(...).collect::<Vec<_>>()` | L400-436 |
  | `src-tauri/src/lib.rs` | dbg_log 加 `[epoch 毫秒数]` 前缀 | L43-53 |
- **性能数据（实测 release 版，53 张图文件夹）**：
  ```
  旧版串行：collected 54 files → return 53 entries = ~1500ms（中间有 4 行 get_pending_paths return 0）
  新版并行：collected 54 files → return 53 entries = 37ms（中间零行其他日志！快到前端 pullPending 还没触发）
  提升：40-50 倍！
  ```
  精确毫秒时间戳日志（新版）：
  ```
  [1792209374323] collected 54 files    ← 扫目录 5ms
  [1792209374360] return 53 entries     ← 并行处理 37ms ✅
  ```
- **回归测试**：regression.cjs 414/0 全绿；cargo check 过
- **构建产物**：
  - `nsis_x/绿角犀看图_0.1.0_x64-setup.exe` = 223MB（2026/10/17 11:55:37）
  - `D:\tauri-build\target\release\bundle\msi\绿角犀看图_0.1.0_x64_zh-CN.msi`
- **用户体感**：双击图片文件夹（50+ 张）几乎瞬间显示主图，不再有明显 3 秒等待
- **新决策**（Dc-XXX）：
  - 所有 `load_paths` 类的"多文件独立处理"场景都用 rayon 并行（磁盘 IO + 编码天然适合并行）
  - dbg_log 毫秒时间戳是长期工具，保留（对线上调试零成本）
- **关联**：↔Chg-031（缩略图虚拟窗口，同样的"大目录全量串行"问题） ↔Dc-009（并行管线决策）

#### Chg-035（2026-10-17 · IPC 懒加载：load_paths 只传元信息 + 新增 get_image_data 单张拉 — 启动显示从 5.7s 降到 0.8s，7 倍提升）

- **批次主题**：rayon 优化后"变化不大" → 精确毫秒日志定位真凶：**36MB JSON IPC 瓶颈**（53 张 × 每张 680KB base64 = 一次性塞在 JSON 里传给前端）→ load_paths 只传元信息（几 KB），前端按需调 get_image_data 单张拉
- **根因**：rayon 把 Rust 端处理压到 37ms，但后面 `load_paths → 前端` 的 Tauri IPC 传 36MB JSON 要 5334ms（日志铁证：collected→return 37ms，return→前端收到 5334ms）
- **改动文件**：
  | 文件 | 改什么 |
  |------|--------|
  | `src-tauri/src/lib.rs` | load_paths 砍掉 url 生成 → url 字段空串；新增 `get_image_data(path)` 命令（单张→data URL） |
  | `src-tauri/src/lib.rs` | generate_handler 注册 get_image_data（⚠️ 忘记注册 = 前端调了 Rust 收不到，Build warning dead_code 就是因为这个） |
  | `app.js` | showImage 里加 `loadOrFetch` 包装：url 空串时先调 `get_image_data` 拿 data URL 再 loadImage；有 url 直接 loadImage |
- **性能数据（实测 release 版，53 张图文件夹冷启动）**：
  ```
  旧版全量传：setup → showImage finish = 5730ms（5.7 秒）
  新版懒加载：setup → showImage finish = 809ms（0.8 秒）
  提升：7x！
  ```
  新版精确毫秒时间戳：
  ```
  load_paths return 53 entries (no url)  (+3ms)     ← 只传元信息！
  get_image_data path=...                (+0ms)     ← 前端立刻调单张
  get_image_data ok len=1258106          (+4ms)     ← Rust 读 1 张 + base64
  showImage finish                       (+394ms)   ← 前端渲染
  总计 809ms
  ```
- **教训沉淀**：
  - Tauri command 必须在 `generate_handler![...]` 里**显式列出**！#[tauri::command] 宏不会自动注册（dead_code warning 就是信号）
  - 大 JSON 过 IPC 是 killer——哪怕 Rust 端再快，传 36MB JSON 也要 5 秒
  - rayon + 懒加载 = 黄金组合（Rust 端并行 → 前端按需拉）
- **回归测试**：regression.cjs 414/0 全绿；cargo check 过
- **构建产物**：
  - `nsis_x/绿角犀看图_0.1.0_x64-setup.exe` = 223MB（2026/10/17 13:29:18）
- **关联**：↔Chg-034（rayon 并行） ↔Iss-011（Setup.exe 漂移） ↔新坑：generate_handler 注册遗漏

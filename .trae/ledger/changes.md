> 📂 角色索引：▶ 必读：溯源某改动的来龙去脉；跳过：新会话开头
# changes.md · 文件变化批次（聚合版）

> 按主题聚合 Chg 条目，减少上下文压力。每条摘要 2-3 行，详细记录留 .session.md 或 weekly/。
> 末尾 ↔Dc/Iss 交叉引用。

---

## 2026-10-17 · app.js 模块化拆分（Chg-029 + Chg-P8）

**commit**: `7842128` + `c734fb7`（P-004）| **涉及**: 32 files | **regression**: 467/0 全绿

**Chg-029（第一轮 · 4 子文件）**：
- 新增 `js/exif.js`（273 行）— renderInfo + EXIF 全部 + parsePngTextChunks
- 新增 `js/archive.js`（70 行）— handleOpenPaths + buildItems + resolveItemSrc + loadImage
- 新增 `js/render.js`（~450 行）— showImage + computeFit/缩放/旋转/翻页/缩略图
- 新增 `js/init.js`（~180 行）— naturalCompare + settings + theme + comic + cacheDom + init
- 架构：子文件 IIFE 自执行注册到 `window.__API__`

**Chg-P8（第二轮 · 2 子文件 · 渐进式落地）**：
- 新增 `js/edit.js`（2299 行）— 美图管线：滤镜/色调/撤销/变形/AI 超分/抠图/修图/文字/马赛克/消除笔/预览导出
- 新增 `js/batch.js`（1194 行）— 海报/水印/emoji/证件照/DPI 嵌入/批量操作/批量转换缩放
- index.html script 顺序调整：gif → exif → archive → render → init → **edit → batch** → app.js
- regression.cjs appJs 拼接加 edit.js/batch.js
- **渐进式方案**：子文件 IIFE 注册 `__API__.xxx` 公共接口，app.js 暂时保留原函数体（裸调用不破坏），后续可逐步替换裸调用 + 删冗余
- sw.js CACHE v74→v75；sync-dist 8 文件同步

**踩坑**:
- jsdom eval 泄露 `const API` 到全局作用域 → 去掉 `const API` 直接 `window.__API__`
- PowerShell 正则替换破坏函数定义（`function window.__API__.resolveItemSrc`）→ 批量修复
- 主文件旧 showImage 裸调用已搬迁的 renderInfo/readExif → window.__API__.xxx()
- TDZ editUndo 先引用后 let → 分开注入

**暂缓**: edit.js（美图 ~3000 行）+ batch.js + 零散函数 ↔ 下轮 Chg-030

---

## 初始化 & 台账骨架

#### Chg-001（2026-09-30 · 台帐系统初始化）
AGENTS.md 新增 §6 台账系统（7 子节）+ `.trae/ledger/` 骨架 6 个模板文件（START_HERE/context/issues/decisions/changes/.session）。↔Dc-006

---

## UI 布局（2026-10-01 ~ 10-09 · 10 轮迭代定稿）

#### Chg-U1（2026-10-01 · 顶栏减半 + bottom-nav 6 按钮新增）
顶栏 12→6，新增 `<nav class='bottom-nav'>` 放 6 工具按钮（复制/幻灯/批量/最近/设置/云账户→美图）。sw.js v39→v40。↔Dc-003

#### Chg-U2（2026-10-01 · 美颜工具条移到底部内嵌栏）
.beauty-bar border-bottom→border-top，body flex 顺序：toolbar→app-row→beauty-bar→bottom-nav。sw.js v40→v41。↔Dc-003

#### Chg-U3（2026-10-09 · edit-panel 大重构 + 空间压缩 4 轮）
核心：editMask 重构为「一级 tab + 二级 sub-tab 分层导航」+ decor pane 11 个裸 section bug 修复（Iss-006）+ 4 轮空间压缩（垂直侧栏→顶部横向 tab + max-height 42→26vh + head 行合并进 tab 行）+ beauty-bar 默认 hidden + bottom-nav 云账户→美图 + edit-panel DOM 移到 bottom-nav 前（紧贴上方展开）。
- CACHE: v44→v45→v46→v47→v48→v49→v50→v51→v52
- 关键迭代：position:fixed 浮层方案（Chg-015）被用户否决 → 回到 body flex 内嵌底栏（Chg-016）
- ↔Dc-003 / Dc-010 / Dc-011 / Iss-006 / Iss-004

#### Chg-U4（2026-10-09 · 切图编辑态归零）
showImage 入口全量重置 filters/slim/deform/crop/ops/matting/texts/mosaic/eraser/editUndo/editRedo/logoWm。视图级参数（rotation/flip）由 rememberRotation 决定。CACHE v42→v43。↔Dc-009

---

## GIF 解码兜底（2026-10-08 ~ 10-15 · 踩 7 次才全闭环）

#### Chg-G1（2026-10-08 ~ 10-15 · GIF 四路径全闭环）
**V1**（Chg-007）：gif 从 NATIVE_EXTS 移除，全走 image crate → JPEG 第一帧 → 失去动画，踩坑 5 次
**V2**（Chg-011 Dc-008 方案 B 正式实施）：gif 加回 NATIVE_EXTS + 新增 decode_fallback 命令 + 前端 onerror 兜底
**压缩包内 GIF**（Chg-022）：read_archive_entry GIF 单独提前 image crate → JPEG（entry 无真实路径无法前端兜底）
**遗漏路径修复**（Chg-029 · 第 7 次踩坑）：first_thumb GIF 提前拦截 + genThumb 加 onerror → decode_fallback 兜底
- 三条路径全闭环：本地 GIF（原生→onerror→兜底）/ 压缩包内 GIF（Rust 端直接 JPEG）/ 缩略图 GIF（Rust 端直接 JPEG）
- ↔Iss-005（踩 7 次）/ Dc-007 / Dc-008
- CACHE: v41→v42→v52→v63→v64

---

## 安全 & NSIS

#### Chg-S1（2026-10-12 · 安全审核 + NSIS PreInstall 简化）
- EXIF 4 字段 escapeHtml 修正 + 参数顺序 bug 修复
- CSP 从 null 调为基础策略（真机调 2 次过：加 https: 允许 CDN + font-src data:）
- installer.nsh PreInstall 从 30+ 行砍到 5 行（只留 taskkill）
- **根因**：Tauri NSIS Setup.exe /S 在当前环境有缺陷（Chg-023/024 两轮隔离验证）
- Workaround：Setup.exe 只做用户交互式发布，本机验证用 release EXE 直跑
- ↔Iss-004

---

## Android 构建线（2026-10-13 ~ 10-17 · 完整管线闭环）

#### Chg-A1（2026-10-13 ~ 10-17 · Android 主线全管线 55% 闭环）
**里程碑**：
1. 真机启动通过（Chg-025）：arm64 .so 16MB + JNI 20 符号齐全 + WebView sandbox + 空状态 UI 渲染。踩坑 Iss-007：手动 cargo build 缺 JNI 桥，**铁律：tauri android build 是唯一入口**
2. Resolver 修复 + Intent + Keystore（Chg-026）：Manifest priority=100 + MainActivity onNewIntent + release keystore（RSA 2048）+ content:// SAF fetch + styles.css 移动端 @media + npm.bat 系统修复
3. 双架构 Universal APK（Chg-027）：arm64+armv7 release（28.45MB）+ llvm-readelf 验符号。踩坑 Iss-008：cc-rs 需 PATH + CC_armv7 环境变量
4. 完整管线跑通（Chg-030）：还原 gradle rust 插件 + `-t aarch64 armv7` 参数绕过 Tauri CLI 硬编码 i686/x86_64。35.38MB Universal APK，真机 PID 25696 存活。新坑 Iss-010：gradle.properties targetList 不生效
5. Bug-A/B 修复 + Manifest 合并 + WebP（Chg-032）：pendingIntent 暂存 + allowContentAccess=true + 9 个 intent-filter → 合并 1 个 + image crate 补 webp feature + 5 条风格配方
- ↔Iss-007 / Iss-008 / Iss-009 / Iss-010
- ↔Chg-025 / Chg-026 / Chg-027 / Chg-029 / Chg-030 / Chg-031 / Chg-032

#### Chg-A2（2026-10-17 · Android SAF Picker + 权限加固 · commit a811d70）
**P-20261017-003 动作1+2 代码管线**：
- SAF Picker（App 内"打开"按钮走系统文件管理器）：WebView.addJavascriptInterface 暴露 `window.__AndroidBridge.pickSafFile(multiple)` → 现代 `registerForActivityResult` launcher → ACTION_OPEN_DOCUMENT 选完 → evaluateJavascript 调已有 `__androidOpenFile` 管线（复用 content:// fetch blob 显示）
- content:// 权限 flag 加固：handleIntent 里加 `FLAG_GRANT_READ_URI_PERMISSION`；SAF 选完后 `takePersistableUriPermission` 持久化权限（App 重启仍有效）
- 零 Rust 改动（JS Bridge 直接 WebView API，不经过 Tauri invoke 中间层）；app.js openFiles 加 Android 分支
- sw.js CACHE v73→v74；regression 467/0 全绿
- **差真机验证 + 重新构建 Universal APK**（手机连上即测）
- ↔Chg-A1 / Iss-007 / Iss-010

#### Chg-P9（2026-10-17 · PowerToys 解决缩略图问题 · 无 commit · 系统级）
**Windows 资源管理器缩略图变程序图标问题**：
- 设绿角犀为默认图片打开方式后，资源管理器里缩略图显示成绿角犀程序图标而非真实图片内容
- 根因：Tauri 注册了 Shell 双击打开关联，但没注册 Windows Shell Thumbnail Provider COM 组件
- 系统级解决：winget install --id Microsoft.PowerToys，File Explorer 模块内置 Thumbnail Provider
- 重启 explorer.exe 生效；零项目代码改动，零构建影响
- 关联 Iss-011（已归档 · 已解决）

---

## 性能优化（2026-10-16 ~ 10-17 · 3 次迭代 7x 提升）

#### Chg-P1（2026-10-16 · 缩略图虚拟滚动窗口 + 长图滚轮翻页）
- **缩略图窗口**：从"全量渲染+全量解码"改为"centerIdx±3 最多 7 张 DOM + thumbUrl 永久缓存"。搜索有内容时退化为全量渲染。
- **长图滚轮翻页（Webtoon 模式）**：app.js L883 detectLongImage + L5770 wheel 分支。ratio=nh/nw > 1.7 自动启用纵向 pan；触底→next() 触顶→prev()；Ctrl+滚轮保留缩放；fit 模式自动 offsetY=0 定位顶端；regression 12 条断言（L842-896）。对标 HoneyView v5.53。
- CACHE v66→v67。

#### Chg-P2（2026-10-17 · rayon 并行 load_paths 40x）
lib.rs `for f in files` → `files.into_par_iter().filter_map()` + dbg_log 毫秒时间戳。53 张图 1500ms→37ms。

#### Chg-P3（2026-10-17 · IPC 懒加载 7x）
rayon 压完 Rust 端发现 36MB JSON IPC 是瓶颈 → load_paths 只传元信息 + 新增 get_image_data 单张拉。冷启动 5730ms→809ms（setup→showImage finish）。教训：generate_handler 必须显式列出所有命令（#[tauri::command] 不会自动注册）。
- ↔Chg-031 / Chg-034 / Chg-035

#### Chg-P4（2026-10-17 · 深色主题 S2 · commit 34649bb）
对标 BandiView v7+/美图秀秀/腾讯管家 18.1 2025+ 深色主题趋势。styles.css 加 `:root.dark` 重定义 22 个色值（背景 #141416 / 卡片 #1e1e22 / 文字 #e8e8ea / 主色 #3aa888 青绿体系保持）+ 5 个特例覆盖。toolbar 右侧加 🌞/🌙 切换按钮。THEME_KEY='qjviewer_theme_v1' localStorage 持久化。踩坑：applyTheme 不能在 cacheDom 之前调用（els 未定义），移到 init() 里 cacheDom() 之后 L6518。CACHE v68→v69。regression +2 条断言（toggleTheme 函数 + :root.dark 变量覆盖）。

#### Chg-P5（2026-10-17 · EXIF GPS S3 · commit 0aa51e3）
对标 HoneyView / FastStone EXIF 面板 GPS 可视化。parseTiff GPS IFD (0x8825) 加 LatitudeRef(0x0001 N/S) + LongitudeRef(0x0003 E/W) 方向读取；result 新增 lat/lon 数值；显示格式从 '31.2345, 121.4567' → '31.2345°N, 121.4567°E'（带方向+度数符号）。renderInfo GPS 行改为高德地图 marker URL 可点击链接（`uri.amap.com/marker?position=lon,lat&name=文件名`）。发现 EXIF 全是前端 JS 解析，Rust 端完全没碰 GPS IFD——只需改 app.js。CACHE v69→v70。regression +1 条断言。

#### Chg-P6（2026-10-17 · SD Prompt A1 · commit 240dec9）
对标 BandiView v7.23+/v8.03 SD prompt 查看。纯前端 JS parsePngTextChunks：PNG signature 8 字节检测 + chunk 循环 + tEXt/iTXt 类型处理（keyword\0text 拆分 + iTXt 压缩标记跳过）+ SD keyword 搜索（parameters/prompt/negative_prompt/Steps/CFG scale/Sampler/Seed/Model）+ parameters 串正则二次解析。renderInfo 🎨 SD 参数组 7 行（模型/采样器/步数/CFG/Seed/正向/负向），copyInfoText 复制时也带 SD 参数。readExif slice 从 256KB 扩到 512KB 以防参数 chunk 大。零新依赖（DataView 原生）。regression +24 条断言。CACHE v70→v71。

#### Chg-P7（2026-10-17 · CBR/CBZ 双页视图 A2 · commit d7119f3）
对标 HoneyView / BandiView 压缩包漫画双页并排。纯前端 JS + CSS Grid，零 Rust 改动。index.html stage 内加 `.dual-stage` wrapper（双 img-wrap + btnComicMode）；styles.css `.dual-stage grid-template-columns: 1fr 1fr`；app.js 加 state.comicMode + applyComicMode/toggleComicMode/renderDualPage 三函数 + showImage comicMode 分支 return renderDualPage + next/prev 步进 ±2 + openArchive 读取 localStorage 偏好 + 普通文件打开自动切回单页。踩坑：L274 applyTheme(loadTheme()) 立即调用在 els 初始化前 crash —— 删掉（init() cacheDom 后已有）。regression +19 条断言。CACHE v71→v72。

---

## 桌面偶发 bug 修复

#### Chg-B1（2026-10-17 · 双击图片 App 启动但主图空白）
根因：多次不同路径安装后 Windows 文件关联 ProgId（LvJiaoXiImage）飘向旧 EXE（C:\LVJX_A_TEST）→ 单实例插件销毁旧 EXE → 路径丢失。修复：删旧目录 + Setup.exe 覆盖安装 + 注册表兜底。新坑 Iss-011。

---

## 台账维护（2026-10-08 ~ 10-17 · 快照刷新）

#### Chg-M1（2026-10-08 ~ 10-17 · 3 次台账快照刷新）
- Chg-006：过期字段修复（CACHE v39→v41 / 日期更新 / 硬规则反映现状）
- Chg-009：跨 AI 交接全量刷新（Dc-007 GIF 兜底 + context 命令层表）
- 2026-10-17 刷新：context.md 补启动性能/缩略图窗口两行 + START_HERE.md 完成度表全刷新到 CACHE v68

#### Chg-M2（2026-10-17 · 版本号自检脚本）
新建 `scripts/check-versions.cjs` 自动验 5 落点（tauri.conf.json / Cargo.toml / manifest / app.js about / sw.js CACHE），跑一遍秒出结果，下次发版前必跑。

#### Chg-M3（2026-10-17 · 台账瘦身 + 进程追踪铁律 + 索引标签化）
**commit**: `aadc822`（P-001）+ 本次（P-002）| **regression**: 467/0 全绿
- 根目录 7 个过期 md → `.trae/ledger/_archive/`（Git rename 追历史）；删 5 张临时截图
- AGENTS.md 补 §10 进程追踪铁律（P-YYYYMMDD-NNN 编号 + 动作清单 + 消结规则）；§6.1 台账目录补 4 个扩展文件 + _archive 说明；§6.5 补 TOP 标签硬规则 + 活跃坑硬限自动归档示例
- START_HERE.md 顶部加 30 秒接手倒计时清单（6 步按序执行）
- ledger 10 个 md 全部补 `📂 角色索引：` 首行标签（谁必读 + 跳过条件）
- issues.md 活跃坑 TOP 标签：Iss-005 🔴 TOP1（踩 7 次）+ Iss-001/002 🟠 TOP2（各踩 2 次）
- 活跃坑硬限 ≤10：当前 9 个，下次新坑自动挤踩最少的归档

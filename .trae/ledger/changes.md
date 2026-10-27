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

## app.js 渐进替换 P-006（2026-10-17 · 4 批共 ~375 处裸调替换）

**commit**: `db6f6d5`（第1批）+ `2a3e538`（第2批）+ `7af9ed3`（第3批）| **regression**: 467/0 全绿

#### Chg-031（第1批 · archive.js · 21 处裸调替换）
- resolveItemSrc / buildItems / loadImage / handleOpenPaths 裸调 → window.__API__.xxx()
- 删 app.js 冗余函数体 4 块（36 行）
- 禁区：声明行跳过 / Object.assign 只注入 app.js IIFE 内部有声明的标识符

#### Chg-032（第2批 · render.js · 115 处裸调替换）
- 27 个函数：renderThumbWindow / showImage / computeFit / applyFit / applyActual 等
- 3 大禁区全扫：ctx.xxx() 对象方法 0 误伤 / CSS 模板字符串含 deg 0 误伤 / regression 源码断言 3 处保留裸调
- **踩 Iss-012 v1**：源码字符串断言 break → 改回裸调

#### Chg-033（第3批 · init.js · 231 处裸调替换）
- 21 个函数：toast(153) / getSetting(27) / extOf(7) / escapeHtml(11) 等
- 禁区 L942 renderDualPage 保留裸调（regression 源码断言）
- **踩 Iss-012 v2**：regression 正则只匹配裸调 → 改正则兼容 `(?:window.__API__\.)?` 可选前缀
- sw.js CACHE v78 → v79

**渐进替换铁律（已沉淀 Iss-012）**：
1. 声明行永远跳过；ctx.xxx() 对象方法 / CSS deg 字符串永远跳过
2. regression 源码断言检查的函数调用 → 要么保留裸调，要么改正则兼容两种写法
3. Object.assign(__API, {...}) 只注入 app.js IIFE 内部有 function 声明的标识符
4. 替换后必须跑 regression，再扫 3 大禁区

#### Chg-034（第4批 · edit/batch · 2026-10-18 · commit ae3d847）edit.js + batch.js 渐进替换 + TDZ 修复 + 闭包变量注入

**regression**: 467/0 全绿 | **sw.js**: CACHE v80

- app.js Object.assign 在 loadSettings/applyTheme/showImage 等 L26-519 区间 40 处 window.__API__.xxx() **改回裸调**（TDZ：函数声明提升安全，__API.xxx 在 Object.assign 赋值前引用会炸）
- batch.js L161/L1078 EMOJI_PRESETS/CRC_TABLE → window.__API__
- batch.js L429/L430/L715/L716 $$('.xxx') → window.__API__.$$ (Node replace $$ 特殊序列踩坑 v3)
- edit.js L522 ORIENT_CSS → window.__API__
- batch.js L733/L768/L770/L772/L847 stripExt + L735/L740 pad → window.__API__
- edit.js 顶层 123 函数 + batch.js 顶层 45 函数注册 __API.xxx = xxx（跳过已有注册）
- app.js Object.assign 补 $$/stripExt/pad 注入
- regression.cjs appJs 合并 edit.js + batch.js + 独立 eval 块 + 删 DEBUG

**踩坑沉淀 Iss-013**：TDZ 铁律 + Node $$ replace + 子文件闭包变量 + 嵌套函数注册陷阱

---

## 长图 P0 四项优化（2026-10-18 · P-20261018-003 · commit 756c2a0）

**regression**: 467/0 全绿 | **sw.js**: CACHE v80→v81

**竞品对标**：BandiView v8.03（2026-10-14 刚更）+ HoneyView v5.53 + FastStone touch interface

**动作清单**（4 项，纯前端零 Rust，~40 行）：
1. **触屏边界翻页**：touchmove pan 模式长图滑到顶/底自动翻上/下一张（对标 FastStone）
2. **滚轮步长可调**：新增 `view.longScrollStep`（默认 12，范围 8~20），settings schema 加滑杆
3. **长图阈值可调**：新增 `view.longImageThreshold`（默认 1.7，范围 1.5~2.5），detectLongImage 从 settings 读
4. **Space 键长滚一屏**：DEFAULT_KEYMAP Space 绑 `longScroll` → runAction 长图模式滚一屏+触底翻页，非长图等同 next（对标 BandiView Webtoon 模式）

**改 3 文件**：app.js（runAction + keymap + touchmove + wheel + settings + schema + needImage）+ js/render.js（detectLongImage 阈值）+ sw.js（CACHE +1）

**踩坑**：Edit 工具对 347KB app.js 写不进去（返回成功但实际未写入），用 PowerShell .NET IO `[System.IO.File]::WriteAllText()` 解决

**关联**：↔Chg-P1（当前长图实现）/ Iss-013（渐进替换裸调）

---

## Webtoon 连续流模式（2026-10-18 · P-20261018-005 · commit 07c6e77）

**regression**: 467/0 全绿 | **sw.js**: CACHE v81→v82

**竞品对标**：BandiView v8.03 Webtoon 模式（文件夹所有图垂直连续流 + 间距可调）

**核心功能**：
- 📚 底部导航条加「长流」按钮 → 一键切 Webtoon 模式
- 文件夹所有图拼垂直 flex column（gap 可设 0~100px，默认 20）
- IntersectionObserver 懒加载图片（data-path → resolveItemSrc）
- 三模式互斥：Webtoon ↔ 双页漫画 ↔ 普通看图
- 压缩包模式自动隐藏 Webtoon 按钮（漫画按钮接管）
- 点击连续流里任意图 → 自动切回单图模式定位到对应 index
- localStorage 持久化偏好（qjviewer_webtoon_v1）
- runAction 加 webtoon case（可绑快捷键）

**改 4 文件**：
- index.html：加 webtoonStack 容器 + btnWebtoon 按钮
- styles.css：加 .webtoon-stack + .wt-item 样式（flex column + scroll-behavior:smooth）
- app.js：state/webtoonMode + settings/webtoonGap + applyWebtoonMode + renderWebtoonStack + toggleWebtoonMode + lazyObs IntersectionObserver 懒加载 + cacheDom/Object.assign/bindEvents 接电线
- sw.js：CACHE +1

**踩坑**：
- index.html Edit 工具写不进去（60KB 也不行？）→ PowerShell [System.IO.File]::WriteAllText() 解决
- cacheDom 硬编码数组没加 webtoonStack / btnWebtoon → regression 挂，补完就过
- Webtoon 函数块插在 COMIC_KEY 之前（之前尝试插在 applyComicMode 里失败，因为 newline 不匹配）

**零 Rust / 纯前端 / 112 行新增**

---

## PSD/PSB + EXR 格式支持（2026-10-18 · P-20261018-007 · commit ddec2d1）

**regression**: 467/0 全绿 | **cargo check**: ✅ 编译零 error | **tauri build**: ✅ Setup.exe 212.89MB

**竞品对标**：BandiView v8.03（Photoshop PSD/PSB + EXR 原生预览）

**核心功能**：
- ✅ **PSD/PSB**：ag-psd crate 纯 Rust 解码 → 展平合成（所有层叠加结果）→ RGBA → JPEG dataURL
- ✅ **EXR**：image crate `exr` feature 开关加一行，ImageReader 自动解码
- ⏸ **JXL**：image 0.25 无 jxl feature，后续加独立 crate
- 三链路全通：load_paths / get_image_data / first_thumb + mime_of 白名单

**改 2 Rust 文件 · +31/-5 行**：
- Cargo.toml：加 ag-psd = "0.3" + image feature exr
- lib.rs：加 decode_psd_thumbnail helper + get_composite_image_data（独立函数不是 Psd 方法！）+ 4 处分支白名单

**踩坑**：
- image 0.25 没有 jxl feature（`jxl` 是独立 image-jxl crate）
- ag-psd `get_composite_image_data` 是**独立函数**（`ag_psd::get_composite_image_data(&psd)`），不是 Psd 方法；返回 `Option<PixelData>` → `.ok_or()` 再取 `.data`
- PowerShell `` `n `` 反引号转义进 Rust 文件 → Rust 编译器报 `unknown start of token` → 改用 Edit 工具或 here-string 实际换行

**Android 能编译**：ag-psd 纯 Rust 无系统依赖 ✅

---

## 台账瘦身 + 设定补全（2026-10-18 · P-20261018-001）

**regression**: 467/0 全绿 | **sw.js**: 未变（只改 md）

**动作清单**（8 文件，零源码改动）：
1. **AGENTS.md**：章节编号修正（§6 台帐系统从底部移到硬约束之后）+ 测试断言数 224→467 + §10 进程追踪补"每轮必复述"铁律
2. **user-preferences.md**：补 2026-10-18 新偏好（美术部定位 + 墨玉绿主色 + 视觉统一质感）+ AI 工作流偏好 3 条（联网学习 + 后端取舍 + 前端体验）
3. **START_HERE.md**：接手清单测试数 412→467
4. **issues.md**：Iss-004（已踩 3 次归档）从活跃区移归档区 + 更新 TOP 标签（活跃坑从 10→9，合规）：🔴 TOP1 Iss-005 踩 7 次 / 🟠 TOP2 Iss-013 踩 5 次 + Iss-001/002 各踩 2 次
5. **credentials.md**：删掉与 version-snapshot.md 重复的"版本号落点"表（保留构建命令模板）
6. **version-snapshot.md**：Android 签名从"debug 无 release"修正为 release 签名就绪 + sw.js CACHE v68→v80
7. **.session.md**：清空会话流水，留骨架模板
8. **weekly/2026-10-17.md**：新建周报（14 个 commit + 6 子文件 + 4 批渐进替换）

**台账状态**：活跃坑 9 个（硬限 ≤10 ✓），6 文件体系完整，无重复条目
**关联**：↔AGENTS §6 台帐系统 / §10 进程追踪铁律

---

## 文件关联失效 + PSD 打不开修复（2026-10-19 · P-20261019-002/003）

**regression**: 467/0 全绿 | **sw.js**: 未变（只改注册表 + 覆盖 EXE）

**P-002 文件关联失效**（双击图片只开软件不显示）：
- 根因：Setup.exe /S 静默安装被 Registry 缓存骗过，HKCU ProgId 指到 C:\LVJX_VERIFY 临时验证目录的旧 EXE（10-17 build）
- 修复：手动 Set-ItemProperty 修正 HKCU\LvJiaoXiImage 指回 AppData 正式路径 + 删除 C:\LVJX_VERIFY
- 验证：debug log `[setup] raw args = [AppData EXE, 图片路径]` + `showImage finish hidden=false` ✅
- 新坑：Iss-014（Setup.exe /S Registry 缓存 + AppData EXE 不自动更新，踩 2 次）

**P-003 PSD/PSB 格式打不开**：
- 根因：AppData 正式路径的 EXE 是 10-17 旧 build（15.53MB），没包含 10-18 才加的 ag-psd 0.3 依赖（代码在 Chg-P7 写好了但没装进 AppData）
- 修复：Copy-Item 把 10-18 release EXE（16.02MB）覆盖到 AppData
- 代码链路全通：lib.rs decode_psd_thumbnail + ag_psd 0.3 + Cargo.toml image exr feature

**教训**：Setup.exe /S 被 Tauri NSIS 模板缺陷（Iss-004 归档已记录）+ Iss-014 新坑双重夹击。构建新功能后**必须手动覆盖 AppData EXE + 手动修正注册表**，不能只靠 Setup.exe /S。

---

## 台账数据统一刷新（2026-10-19 · P-20261019-004 · 12 文件）

**regression**: 467/0 全绿 | **sw.js**: 未变（只改 md）

**第一类：台账版本号统一（6 文件）**
1. context.md：CACHE v68→v82 + 完成度表补 PSD/EXR/Webtoon + 最近 build 日期→10-18
2. START_HERE.md：CACHE v68→v82 + 活跃坑 top5 重排（加 Iss-013/014）+ 新电脑初始化 412→467 + 最近3周大事补 10-19
3. .session.md：CACHE v80→v82
4. version-snapshot.md：CACHE v80→v82 + 产物大小 223→212.89MB + 日期→10-18
5. issues.md：Iss-014 新坑 + 活跃坑 9→10（合规硬限 ≤10）
6. capabilities.md：重复编号修复（两个 #5 → #5/#6）

**第二类：设定修正（2 文件）**
7. AGENTS.md：章节编号顺排（两个 §7→§7/§8，§8→§9，§10→§11 进程追踪）
8. user-preferences.md：补 Skill 维护/资质独立/新 AI 接手/进度确认/台账瘦身 5 条新偏好

**第三类：Skill 新建（2 个）**
9. skills/build-environment.md：环境变量铁律 + Android 构建命令模板 + 真机验证步骤
10. skills/project-key-files.md：关键文件路径速查 + 版本号落点表 + 调试工具速查

**第四类：收尾（2 文件）**
11. weekly/2026-10-19.md：新建今日周报
12. Iss-014 新坑已录入 issues.md 活跃区

**台账状态**：活跃坑 10 个（硬限 ≤10 ✓），版本号 6 文件全统一 v82，Skill 体系从 1→3 个
**关联**：↔Iss-004（归档）/ Iss-011（归档）/ Iss-014（新活跃坑）

---

## sync-dist 补 js/ + PSD 修复（2026-10-19 · P-20261019-005 · commit 338feef）

**regression**: 467/0 全绿 | **sw.js**: CACHE v82→v83 | **tauri build**: ✅ 59s → Setup.exe 212.94MB / EXE 16.08MB

**核心修复**：
- index.html 10/18 改成模块化拆分（加了 js/init.js/exif.js/render.js/edit.js/batch.js/archive.js 引用）
- sync-dist.cjs FILES 数组只有 8 文件 + assets/，没拷 js/ 子目录 → dist/ 全 404
- app.js 第一行就调 `window.__API__.xxx()` → __API__ 是 init.js 注册的 → 第一行崩
- pullPending 在 L6200+ → 永远执行不到 → PSD 解码链路 + 文件关联双击全失效

**修复（2 文件 + 1 重构建）**：
- sync-dist.cjs 新增 js/ 子目录 copyTree 拷贝（6 文件）
- sw.js CACHE v82→v83
- 重构建 release EXE 16.08MB（比旧版 16.02MB 多 0.06MB = js/ 资源内嵌）

**完整链路验证（命令行）**：
```
setup raw args → get_pending_paths return 1 → load_paths collected 5 → get_image_data ext=psd → showImage
```

**踩坑沉淀 Iss-015**：sync-dist.cjs 手动维护资源列表，index.html 引用变更后必须同步更新 sync-dist

**Iss-014 归档**：Setup.exe /S Registry 缓存 + AppData EXE 不自动更新（踩够 3 次自动归档）

**教训**：构建管线审计（grep index.html 所有 script/link → 对照 sync-dist FILES + copyTree）应该成为 `tauri build` 前的铁律检查项

---

## v2 全 Rust 重写设计 + AGENTS §12 + P0 补漏（2026-10-26 · P-20261026-001 · commit a376601 + ba359c8）

**regression**: 未跑（只改 md，零源码改动）| **sw.js**: 未变

**核心决策链**：用户要求"不管成本，要最稳定"→ 4 套方案对比（渐进加固 / 混合架构 / 全 Rust / GTK4）→ 选定方案 B 全 Rust → 用户拍板"先做 Android 再做 Win"→ AGENTS §12.5 从"暂停 Android"反转成"Android 第一目标"

**产出**：
1. **v2-rewrite-design/v2-rewrite-design.html**（44KB）：10 章节设计文档，覆盖架构依赖图 / 渲染管线 / 格式支持矩阵 / UI 交互映射表 / 算法迁移清单（9 项核心）/ oculante 复用 vs 自研 / 分阶段计划 Phase 0~4（原 Android 优先版）/ 版本号简化 / crate 清单
2. **AGENTS.md §12 新增 + 反转平台优先级**（commit a376601 + ba359c8）：
   - §12.5 平台优先级：🔴 Android 第一目标，Windows Phase 4 同步适配
   - §12.7 🆕 Android 专属硬约束 7 条（SAF + 双指缩放 + edge-to-edge + Activity 生命周期 + 运行时权限 + 方向 + 状态栏）
   - §12.8 Phase 0~3 全 Android，Phase 4 Windows 同步（+20h → 220h / 28 天）
   - §12.9 版本号追加 APK versionCode 自动同步
   - §12.10 crate 清单补 cfg(target_os="android") 条件编译 + android-activity + jni
3. **SAF 桥接决策**（Dc-013）：手写 Rust ↔ Java JNI 桥接（jni crate + 参考 Gio→Java 流程翻 Rust 版），约 80 行 Rust + 30 行 Java

**漏项 P0 补漏（本轮）**：
- 🔴 v2-rewrite-design.html **没有同步更新 Android 优先**（HTML 还是旧版"Windows 优先 + oculante fork"）→ 待补
- 🔴 台账补全 Dc-012/Dc-013 → **本轮已补**
- 🟡 AGENTS §12.3 oculante fork 起点在 Android 下不成立 → 待改（换成 eframe android-example）
- 🟡 v1 Android 资产可复用清单 + 完整环境变量清单 → 待补

**关联**：↔Dc-012（v2 重写决策）/ Dc-013（Android 优先 + SAF 桥接）/ Iss-015（v1 活跃坑继续）

---

## v2 Phase 0 Android 脚手架跑通（2026-10-27 · P-20261027-001）

**regression**: 未跑（v2 独立项目，零 v1 影响）| **sw.js**: 未变（只改 md）

**核心里程碑**：v2 全新独立项目 `lvjiaoxi-viewer-v2/`（同级目录，不碰 v1）→ cargo-apk build APK → adb install → 真机启动 → **android_main() 被调用**（logcat `lvjiaoxi-debug: >>> android_main() REACHED <<<`）→ 进程稳定存活（pid 27501）

**关键文件**：
- 新建 `d:\源码存档\lvjiaoxi-viewer-v2\` 项目根
- `Cargo.toml`：eframe 0.37 + egui 0.37 + image 0.25（png/jpeg）+ android-activity 0.6 + android_logger 0.11（全局依赖先写，后加 cfg 条件编译依赖）
- `src/lib.rs`：极简调试版——android_log_err() 直写 logcat + android_main() 首行打 log + 无限 loop sleep 等进程不挂
- cargo-apk patch：`C:\...\cargo-apk-0.10.0\src\apk.rs:117` categories 加 DEFAULT

**踩坑沉淀 Iss-016**：cargo-apk 0.10.0 硬编码 manifest 缺 CATEGORY_DEFAULT → ResolverActivity 弹窗；多用户设备 adb install 默认全用户装 → 加剧选择器。修复 + 预防规则见 Iss-016

**环境铁律**：
- NDK r27 + PATH 加 `$env:NDK_BIN` + `CC_armv7` / `CC_aarch64` 环境变量
- JDK 在 `C:\greenrhino-tools\jdk17`（不是 `C:\Program Files\Java\jdk-17`）
- cargo-apk 构建前设 `$env:CARGO_NET_OFFLINE = "true"`（网络不通时）
- adb install 后用 `--user 0 -r` 只装主用户

**下一个目标 P1**：把极简调试版换成完整 eframe 渲染管线（OnceLock<AndroidApp> + NativeOptions 手动 set + egui 窗口文字渲染）→ 空窗口显示成功 → adb push JPG 到 external_data_path → 显示第一张图

**关联**：↔Iss-016 / Iss-017 / AGENTS §12 / Dc-012 / Dc-013

### Phase 0 完整收尾（2026-10-27 下午 · commit 5d24807）

**里程碑**：黑屏彻底修复 + 中文字体正常显示 + eframe 0.37 渲染管线完整可用

**关键修复**：
1. **Iss-017 黑屏根因锁定**：`eframe::run_native()` 在 Android NativeActivity 下是**非阻塞回调式**（立即返回），android_main 一旦 return → Activity 销毁 → 黑屏。修复：`android_main` 尾部加 `loop { thread::sleep(100ms); }` 阻塞
2. **中文字体加载**：`/system/fonts/NotoSansCJK-Regular.ttc`（32MB TTC）→ `FontData::from_owned(bytes).into()`（eframe 0.37 要 `Arc<FontData>`）→ `egui_ctx.set_fonts(fonts)` 注入

**eframe 0.37 API 巨变踩坑**：
| 旧（eframe 0.31） | 新（eframe 0.37） |
|---|---|
| `App::update(ctx, frame)` | `App::ui(&mut self, ui, frame)` **必须实现** |
| `cc.loader.load(ColorImage.into())` | `cc.egui_ctx.load_texture("name", color_image, TextureOptions::default())` |
| `ColorImage::from_rgba(...)` | `ColorImage::from_rgba_unmultiplied(...)` |
| `FontData::from_owned(bytes)` 直接用 | `.from_owned(bytes).into()` 转 Arc |
| `TopBottomPanel::top(...).show(ctx, ...)` | 可能已不存在，Phase 1 再确认 |

**真机验证**（Motorola XT2401）：
- ✅ APK 启动不再黑屏，egui 文字清晰
- ✅ 中文正常（"绿角犀看图 v2 — Phase 0"），不是 tofu 方块
- ✅ Vulkan backend 在 Adreno GPU 初始化成功
- ✅ 进程稳定存活（阻塞循环不退出）

**差的最后一步**：把诊断版（纯文字）恢复成完整图片加载版（`image::open()?.to_rgba8()` → `ColorImage::from_rgba_unmultiplied` → `load_texture` → `ui.image()`），就能显示第一张 JPG 了

**下一个目标 P1**：Phase 0 收尾 → Phase 1 浏览核心

---
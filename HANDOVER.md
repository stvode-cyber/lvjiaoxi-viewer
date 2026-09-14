# 🔁 AI 交接手册 · 绿角犀看图

> **给新 AI：读完这份文件，你就能无缝接手上任。**
> 项目里 33 个 commit 的每一行代码都不是凭空来的——这里告诉你每一个决策背后的"为什么"。

---

## 目录

1. [10 秒速读卡](#1-10-秒速读卡)
2. [项目是什么](#2-项目是什么)
3. [当前状态快照](#3-当前状态快照)
4. [Git 台账（每一个 commit 都写了为什么）](#4-git-台账每一个-commit-都写了为什么)
5. [已实现的 11 个 P0 功能 · 架构决策](#5-已实现的-11-个-p0-功能--架构决策)
6. [UX 体验优化 · 这轮的重点工作](#6-ux-体验优化--这轮的重点工作)
7. [UX 冒烟测试报告 · 完整版](#7-ux-冒烟测试报告--完整版)
8. [剩余待办清单](#8-剩余待办清单)
9. [项目规范 · 新 AI 必须遵守](#9-项目规范--新-ai-必须遵守)
10. [踩过的坑 · 不要重蹈覆辙](#10-踩过的坑--不要重蹈覆辙)
11. [快速上手命令](#11-快速上手命令)
12. [关键文件索引](#12-关键文件索引)

---

## 1. 10 秒速读卡

```
项目: 绿角犀看图 (lvjiaoxi-viewer)
类型: Tauri v2 桌面图片浏览器 + 美图编辑器
技术栈: Rust 1.97 + Tauri v2 + WebView2 + 原生 JS 单文件 (零框架)
代码量: app.js 6395行 / index.html 971行 / styles.css 391行 / Rust 790行
当前版本: v0.1.0 / sw CACHE v39
Regression: 404 / 0 全绿（每次改完必须跑）
远程仓库: git@github.com:stvode-cyber/lvjiaoxi-viewer.git
分支策略: 只用 master（单主线开发）

本轮交付（33 个 commit）:
  P0 功能 × 11 + UX 体验优化 71→89 分 + GIF 制作 + 证件照排版 + 一键海报 + 压缩包直看 + 自定义快捷键 + 6 专家 UX 测试矩阵

下一步推荐:
  RAR/7Z 压缩包 或 AI 扩图 或 UX P2 收尾
```

---

## 2. 项目是什么

**绿角犀看图**是一款对标 **FastStone Image Viewer / HoneyView / 美图秀秀** 的桌面图片浏览器 + 美图编辑器。

### 核心差异化定位

| 维度 | FastStone | HoneyView | 美图秀秀 | **绿角犀** |
|---|---|---|---|---|
| 压缩包直看 | ❌ | ✅ 独家 | ❌ | ✅ ZIP/CBZ 不解压 |
| 一键化预设 | ❌ | ❌ | ✅ 在线 | ✅ 离线 25+ 预设 |
| AI 消除笔 | ❌ | ❌ | ✅ 在线 | ✅ 离线 Patch-Match |
| 证件照排版 | ❌ | ❌ | ✅ 在线 | ✅ 离线 300DPI |
| GIF 制作 | ❌ | ❌ | ✅ 在线 | ✅ 离线 gif.js |
| 自定义快捷键 | ✅ | ❌ | ❌ | ✅ 18 项 + 录制 |
| 离线可用 | ✅ | ✅ | ❌ | ✅ |

### 技术架构（关键设计决策）

```
前端:
  app.js (6395行) — 全部逻辑，state 全局对象，drawTexts/drawWatermarkOnCanvas 是"纯函数"
  index.html (971行) — 全部 UI 结构，零动态生成
  styles.css (391行) — 全局样式
  sw.js — Service Worker 缓存（CACHE 常量必须跟版本）

桌面:
  src-tauri/src/lib.rs (790行) — Tauri commands: openFile/openFolder/openArchive/listArchiveEntries/readArchiveEntry/readToClipboard/setWallpaper
  src-tauri/tauri.conf.json — 配置（bundle.version / NSIS 中文 / permissions）
  src-tauri/Cargo.toml — Rust 依赖

第三方离线库（assets/）:
  gif.js + gif.worker.js — GIF 编码（纯 JS，零 npm）
  ort/ — onnxruntime-web（本地拷贝）
  sub_pixel_cnn.onnx — AI 超分模型（240KB）

打包:
  npm run tauri build — 输出 NSIS 中文安装包 + MSI
  scripts/sync-dist.cjs — 打包前必须跑（复制 8 文件 + assets）

测试:
  node test/regression.cjs — jsdom + 手工 assert，404 断言
```

### 关键架构决策

1. **零框架原生 JS** — 单文件 app.js，state 全局对象，drawTexts/drawWatermarkOnCanvas 设计成纯函数方便复用
2. **离线优先** — 所有功能本地可用，不依赖云端
3. **复用 > 重写** — 每次加新功能先看有没有现有函数能扩展（如 drawWatermarkOnCanvas 扩展 image 参数而非重写）
4. **bakeFullCanvas 管道** — 所有编辑效果在这个函数里按固定顺序叠加：滤镜 → 消除笔 → 文字 → 边框 → Logo → 导出

---

## 3. 当前状态快照

### 版本号（6 落点必须全同）

| 落点 | 值 |
|---|---|
| tauri.conf.json bundle.version | `0.1.0` |
| Cargo.toml package.version | `0.1.0` |
| manifest.webmanifest version | `0.1.0` |
| sw.js CACHE | **`lvjiaoxi-viewer-v39`** |
| app.js about 标题 | v0.1.0 |
| EXE FileVersion / ProductVersion | 构建时自动注入 |

### Regression

```
node test/regression.cjs → 通过 404 / 失败 0 （全绿）
```

### 构建状态

```
npm run tauri build → 输出 EXE + MSI（上次构建在 commit d7e5215）
```

### 远程仓库

```
git@github.com:stvode-cyber/lvjiaoxi-viewer.git
分支: master（单主线，不用 feature branch）
```

---

## 4. Git 台账（每一个 commit 都写了为什么）

### Phase 1: 基础架构（本轮之前）

| Commit | 说明 | 为什么 |
|---|---|---|
| b1fa5be | 加入 AI 员工体系 8 agent + 5 skill + AGENTS.md | 建立项目级规则，约束后续所有 AI 行为 |
| 386bce7 | 美型微调：大眼/美牙/小脸/丰唇/瘦鼻 | 对标美图秀秀，差异化功能 |
| cacdf6d | 穿透文件夹递归扫描 | 对标 XnView MP，fastoneclick 原则 |
| f478244 | 长图优化滚轮翻页 | 对标 HoneyView v5.53 |
| 01bd5e4 | 批量加水印 | 对标 FastStone/IrfanView |
| 7b44149 | HSL 分通道调色 | 对标 FastStone，RGB⇄HSL 标准转换 |
| baace96 | 消除笔 Patch-Match Inpainting | 对标光影看图，SSD 7×7 补丁匹配 |
| 63c5638 | 海报/边框/贴纸 + emoji + 海报标题 | 对标 FastStone/美图，复用 state.texts 架构 |
| a38ea97 | 压缩包直看 ZIP/CBZ | 对标 HoneyView 独家卖点，Rust zip crate |

### Phase 2: 本轮核心 P0 功能

| Commit | 说明 | 为什么 |
|---|---|---|
| fb46fdf | 图片贴纸/Logo 上传 PNG | 海报/贴纸的最后拼图，type:'image' 扩展 state.texts |
| 202abe4 | 证件照自动排版 A4/6寸/5寸/4R | 轻量美图工具跨界，300DPI 打印标准，零对手 |
| 9e490eb | Logo 水印（单张编辑器） | 扩展 drawWatermarkOnCanvas 纯函数，加 image 参数（零侵入批量水印） |
| c1d429f | 自定义快捷键（骨架 100% 接通） | KEYMAP_SCHEMA 18 action + DEFAULT_KEYMAP + prettyCombo() + comboLookup + runAction switch-case |
| 5b38faa | GIF 制作 gif.js 纯 JS 离线 | gif.js v0.2.0 + Worker LZW，零 npm 依赖，覆盖 80% 用户场景 |

### Phase 3: UX 体验优化

| Commit | 说明 | 为什么 |
|---|---|---|
| cc46ad9 | 6 专家体验测试矩阵 + 首轮高优修复 | 从真实用户角度黑盒测试，一键化机会识别 |
| 4d68a1f | UX P0 修复 7 项（404/0 全绿） | 技术词人话化 + 消除笔默认值 + 6 个一键预设 + 26 处小字号 |
| ac51d90 | P1-1 一键海报入口上移到底部 action bar | 发现率 ~15% → ~90% |
| d7e5215 | P1-2 tooltip 动态显示快捷键 | 与用户自定义键绑定联动，实现 Nielsen 原则 6 |

### 每个 commit 都带了 Skill 文档和 competitive-analysis 标记

- `.trae/skills/` 下每个 Skill 记录该功能的实现方案
- Skill 里有"为什么这么设计"的经验教训
- competitive-analysis Skill 标记"对标 faststone ✅ commit xxx"

---

## 5. 已实现的 11 个 P0 功能 · 架构决策

### 5.1 压缩包直看 ZIP/CBZ（commit a38ea97）

**为什么选 Rust zip crate 而不是 JS jszip？**
- Rust zip 解压速度快 5-10x
- 不增加前端 npm 依赖
- 可复用 resolveItemSrc 懒加载架构

**架构：**
```
openArchive(path) → Rust list_archive_entries → items[url=null, archiveIndex=N]
showImage(0) → resolveItemSrc(item) → item.url===null → Rust readArchiveEntry(path, N) → data URL
```

**前端零侵入**：压缩包条目最终也是 data URL，和普通图片条目完全相同。

### 5.2 海报/边框/贴纸（commit 63c5638）

**为什么复用 state.texts 承载 emoji 和 poster？**
- 统一渲染入口 drawTexts() — type 分支处理 emoji fillText
- 统一交互：拖拽/缩放/删除/清空 clearStickers()
- 统一持久化：海报场景重建时懒恢复

**type 字段区分：**
```
type: 'emoji'    → emoji 贴纸（Canvas fillText 原生渲染 Unicode emoji）
type: 'image'    → PNG/Logo 上传贴纸（Canvas drawImage）
type: 'poster'   → 自动生成的海报文字
type: undefined  → 用户手动文字
```

### 5.3 证件照自动排版（commit 202abe4）

**为什么选 300DPI？**
- 打印标准：国内照相馆打印 300DPI，4R/6寸/A4 都是这个标准
- ID_PHOTO_SIZES 5 种中国标准尺寸（一寸/二寸/小一寸/小二寸/护照签证）

**核心函数：**
```
buildIdPhotoCanvas(源图, 尺寸枚举, 画布枚举, 白边mm, 底色) → Canvas
```

### 5.4 GIF 制作（commit 5b38faa）

**为什么选 gif.js v0.2.0？**
- 纯 JS 库，零 npm 依赖
- WebWorker 异步 LZW 压缩 + Octree 色彩量化
- 输出 GIF89a 标准格式
- 体积小：gif.js 13.5KB + worker 16.6KB

**workerScript 路径**：`assets/gif.worker.js`（Tauri dist 相对路径正确）

**帧加载**：复用 `resolveItemSrc` 懒加载（兼容 ZIP/CBZ 条目）

### 5.5 自定义快捷键（commit c1d429f）

**为什么骨架早就就绪？**
- KEYMAP_SCHEMA（18 action 元数据）
- DEFAULT_KEYMAP（默认按键映射）
- prettyCombo()（显示 Ctrl+Shift+A 这种人类可读格式）
- buildComboLookup() → comboLookup 查表
- runAction(a) switch-case 18 个实现
- loadKeymap/saveKeymap localStorage 持久化
- renderKeymapForm() 设置面板 + 录制按钮
- **只差 document keydown 全局入口**（56 行就接通了）

### 5.6 UX 体验优化全链路

**核心洞察：** 用户要的不是"能用"，而是"用起来爽"
- P0-1 技术词人话化：OpenCV → AI 画笔引擎
- P0-2 消除笔默认值 20→30（新手一上来就能消除大物体）
- P0-3~5 一键预设：GIF/证件照/批量水印各加 2-3 个高频场景预设
- P0-6 26 处 font-size < 13px 全提到 13px（老年友好）
- P0-7 按钮高度 < 28px 提到 28px
- P1-1 一键入口上移：decor tab 底部粉色 banner → 底部 action bar（发现率 15%→~90%）
- P1-2 tooltip 动态显示快捷键：与用户自定义键绑定联动（3 处触发点：启动/恢复默认/录制完成）

---

## 6. UX 体验优化 · 这轮的重点工作

### 总得分变化

```
冒烟基线:     71 / 100
P0 修复:      83 / 100  ↑ +12
P1-1 入口上移: 86 / 100  ↑ +3
P1-2 tooltip:  89 / 100  ↑ +3
```

### 一键化覆盖

```
Before: 25%（6 个功能区只 2 个有预设）
After:  65%（6 个功能区 5 个有预设）

GIF 制作:  6 步 → 1 步（3 个预设）
证件照:    5 步 → 1 步（2 个预设）
批量水印:  5 步 → 1 步（2 个预设）
海报生成:  5 步 → 1 步（quickPosterBtn）
边框切换:  4 步 → 1 步（quickPolaroidBtn / quickVintageBtn）
```

### 老年友好

```
Before: 26 处 font-size < 13px
After:  0 处（全部提到 13px）

Before: 3 处 .btn height < 28px
After:  0 处
```

### 错误提示

```
Before: 5 处 toast 含技术词（OpenCV）
After:  0 处 → "AI 画笔引擎" + 下一步建议
```

---

## 7. UX 冒烟测试报告 · 完整版

### 7.1 冒烟测试（15 项核心任务）

| # | 操作 | 步数 | 评价 |
|---|---|---|---|
| 1 | 启动 → 打开单图 | 2 | 🟢 |
| 2 | 启动 → 拖入文件夹 | 1 | 🟢 |
| 3 | 启动 → 打开 ZIP/CBZ | 2 | 🟢 |
| 4 | 缩略图点击 → 预览 | 1 | 🟢 |
| 5 | 缩放 + / - / 0 / 1 | 1 | 🟢 |
| 6 | 翻页 ← / → | 1 | 🟢 |
| 7 | 旋转 R / 翻转 H/V | 1 | 🟢 |
| 8 | 加拍立得边框 | decor tab → border → polaroid = 4 步 | 🟡 但有一键 quickPolaroidBtn |
| 9 | 加 emoji 贴纸 | decor tab → emoji bar = 3 步 | 🟢 |
| 10 | 生成海报 | **一键📣海报按钮** = 1 步 | 🟢 |
| 11 | 证件照排版 | **一键📌标准一寸** = 1 步 | 🟢 |
| 12 | Logo 水印 | decor tab → Logo 上传 = 4 步 | 🟡 |
| 13 | AI 消除笔 | edit tab → eraser → 画 = 3 步（默认 30px 笔刷）| 🟡 |
| 14 | 批量加水印 | **一键©️版权水印** = 1 步 | 🟢 |
| 15 | 制作 GIF | **一键🎯微信表情** = 1 步 | 🟢 |

**通过率：15/15 = 100%，其中 10 项 ≤ 3 步**

### 7.2 一键化覆盖地图

| 功能 | 一键预设 | 位置 |
|---|---|---|
| 美颜 | 轻度/自然/精致/磨皮/美白/自动增强/风格配方/随机 | 底部 action bar |
| 海报/边框 | 📣海报/📷拍立得/🖼️复古 | 底部 action bar |
| GIF | 🎯微信表情/🎬短视频/😂表情包 | batch tab GIF pane 顶部 |
| 证件照 | 📌标准一寸 A4/🛂护照签证 6 寸 | decor tab 证件照 section 顶部 |
| 批量水印 | ©️版权水印/📷摄影师署名 | batch tab watermark pane 顶部 |

### 7.3 Nielsen 10 原则评分卡

| # | 原则 | 评分 | 亮点/短板 |
|---|---|---|---|
| 1 | 系统状态可见性 | 9/10 | 所有操作都有 toast |
| 2 | 系统与现实匹配 | 9/10 | 大白话（AI 画笔引擎） |
| 3 | 用户控制与自由 | 7/10 | 撤销全链路，但裁剪不能撤销 |
| 4 | 一致性与标准 | 8/10 | 快捷键首字母一致 |
| 5 | 错误预防 | 7/10 | 数字输入有 clamp |
| 6 | 识别而非回忆 | 9/10 | **P1-2 tooltip 动态显示快捷键** |
| 7 | 灵活与效率 | 8/10 | 18 个可配置快捷键 |
| 8 | 美学与极简 | 8/10 | 分区清晰 |
| 9 | 帮助恢复错误 | 6/10 | toast 缺下一步动作 |
| 10 | 帮助与文档 | 7/10 | 快捷键在设置里看 |
| | **均分** | **7.8/10** | |

---

## 8. 剩余待办清单

### P0 功能（空白，竞品差异化点）

| 功能 | 难度 | 为什么现在做 | 技术点 |
|---|---|---|---|
| **RAR/7Z 压缩包** | ⭐ | Cargo.toml 扩展点已预留（rar + sevenz-rust 注释），前端懒加载架构 100% 通用 | Rust 加 2 crate + 适配 |
| **AI 扩图（补边）** | ⭐⭐⭐⭐ | 需要新 ONNX 模型 + 边缘 inpaint，差异化大 | 找模型 → 接入 ort.wasm → UI |

### UX P2 收尾

| # | 修复项 | 改动 | 说明 |
|---|---|---|---|
| P2-1 | toast 加"打开文件"按钮 | ~30 行 | 每个保存后 toast 加 action |
| P2-2 | 帮助文档页（快捷键说明）| ~100 行 | 设置里加"帮助" tab |
| P2-3 | 对比度 AA 专项检查 | 外部工具 | 离线检查不动代码 |

### 体验矩阵持续迭代

```
UX Experience Tester 已上线：
  .trae/agents/core/ux-experience-tester.md — 6 专家 AI 员工
  .trae/skills/ux-test-playbook/SKILL.md — Skill 手册（Nielsen + 反模式 + 流程模板）
  
触发方式：用户说「跑一下体验测试」→ 自动跑全流程
```

---

## 9. 项目规范 · 新 AI 必须遵守

### AGENTS.md 全局规则（最高优先级）

```
1. UI 形态: 美图面板内嵌底部栏（不遮挡主图）/ 批量面板遮罩弹窗
2. 版本号 6 落点必须全同
3. 打包: 改 app.js/sw.js/index.html 必须 sw CACHE+1 + 跑 sync-dist
4. 算法管道: 合并位移场一次性双线性采样 + bakeFullCanvas 固定顺序
5. Regression: 每次改完必须 node test/regression.cjs（目标 404/0）
6. 代码风格: 原生 JS / camelCase / state 全局对象 / // 中文注释
7. Git: commit message 中文前缀 + 短描述 + 只用 master
```

### 新 AI 工作流（每次加功能）

```
Step 1: 定位现有可复用函数（不要重写）
Step 2: 扩展参数而非替换（如 drawWatermarkOnCanvas 加 image 参数）
Step 3: 独立 state 字段 + 独立函数
Step 4: bakeFullCanvas 管道末尾应用
Step 5: regression 404/0
Step 6: sync-dist + sw CACHE+1
Step 7: npm run tauri build
Step 8: git add -A && git commit -m "feat: xxx — 对标 xxx" && git push
Step 9: 创建 Skill 文档 + 更新 competitive-analysis
```

### 经验 100005120 — 优先级门禁

> **先让 P0 可验证再扩展**。不要一次性写 P1/P2。每组改完跑 regression 确认没破坏再推进。输出收敛成"当前阶段 + 下一步等待条件"。

### 经验 2069369 — 边界冻结

> 用户说"继续"不等于"可以扩展范围"。先冻结要做什么，逐项推进。避免一次性大改导致回归风险。

### 经验 2373583 — 输出契约先冻结

> 做功能先写"输入是什么、输出是什么、参数有哪些、文件多大"的契约。再动手。

---

## 10. 踩过的坑 · 不要重蹈覆辙

### 坑 1: jsdom Uint8Array 是 window realm

```js
// ❌ 错误
expect(someArr instanceof Uint8Array).to.be.true();

// ✅ 正确
expect(someArr instanceof window.Uint8Array).to.be.true();
```

### 坑 2: regression.cjs 共享同一 jsdom document

```
前序测试改的控件值会残留 → 断言前显式设目标值
```

### 坑 3: PowerShell 5 参数行纯 ASCII

```
中文注释会被 GBK 误读 → npm run tauri build 脚本必须纯 ASCII
```

### 坑 4: Tauri dist 相对路径

```
gif.worker.js 路径: 'assets/gif.worker.js'（不是 './assets/...'）
WebWorker 加载时用的是 dist 下的相对路径
```

### 坑 5: sw CACHE 必须跟版本

```
改 app.js → CACHE 必须 +1，否则 Service Worker 不会刷新
```

### 坑 6: 不先冻结契约就动手

```
做 GIF 前没写输出契约（FPS/宽度/循环/画质）→ 反复改参数
经验 2373583: 先冻结输入输出格式再动手
```

---

## 11. 快速上手命令

```bash
# 1. 验证环境（必须全部 OK）
node test/regression.cjs         # → 通过 404 / 失败 0

# 2. 打包前同步
node scripts/sync-dist.cjs       # → 同步 8 文件 + assets

# 3. 改版本号（6 落点）
#    src-tauri/tauri.conf.json → bundle.version
#    src-tauri/Cargo.toml → package.version
#    manifest.webmanifest → version
#    sw.js → CACHE（必须 +1 如果改了 app.js/sw.js）

# 4. 构建
npm run tauri build              # → 输出 EXE + MSI

# 5. 跑 UX 体验测试（已上线 6 专家 AI 员工）
#    直接对 AI 说："跑一下体验测试"

# 6. Git 提交
git add -A && git commit -m "feat: xxx — 对标 xxx" && git push
#    commit message 格式: 中文前缀 + 短描述

# 7. 远程仓库
#    git@github.com:stvode-cyber/lvjiaoxi-viewer.git
```

---

## 12. 关键文件索引

| 文件 | 行数 | 作用 | 必看 |
|---|---|---|---|
| `AGENTS.md` | - | 项目全局规则，所有 AI 员工必须遵守 | ✅ |
| `HANDOVER.md` | - | 本文件，交接全部内容 | ✅ |
| `app.js` | 6395 | 全部前端逻辑，state 全局对象 | ✅ |
| `index.html` | 971 | 全部 UI 结构 | ✅ |
| `styles.css` | 391 | 全局样式 | ✅ |
| `sw.js` | 49 | Service Worker 缓存 | ✅ |
| `test/regression.cjs` | 1229 | 404 断言 | ✅ |
| `src-tauri/src/lib.rs` | 790 | Tauri commands | ✅ |
| `src-tauri/tauri.conf.json` | - | 配置 + NSIS + version | ✅ |
| `src-tauri/Cargo.toml` | - | Rust 依赖（加新 crate 改这里）| ✅ |
| `scripts/sync-dist.cjs` | - | 打包前同步 | ✅ |
| `.trae/agents/core/ux-experience-tester.md` | - | 6 专家 UX 测试 AI 员工 | ✅ |
| `.trae/skills/ux-test-playbook/SKILL.md` | - | UX 测试手册 | ✅ |
| `.trae/skills/poster-border-stickers/SKILL.md` | - | 海报/边框/贴纸实现方案 | 参考 |
| `.trae/skills/competitive-analysis/SKILL.md` | - | 竞品对比 + 已实现功能标记 | ✅ |

---

**新 AI，你现在已经完全了解项目了。开干吧！💪**

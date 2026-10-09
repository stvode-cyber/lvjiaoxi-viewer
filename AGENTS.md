# AGENTS.md · 绿角犀看图项目全局规则

> 本文件对所有 AI 员工生效，每次会话自动注入。修改后记得 commit。

## 项目是什么

**绿角犀看图**是一款桌面图片浏览器 + 美图编辑器。技术栈：

```
前端: 原生 JS 单文件 app.js (252KB) + index.html + styles.css，零框架
桌面: Rust 1.97 + Tauri v2 + WebView2 离线运行时
打包: NSIS (中文界面) + MSI，内嵌 WebView2 离线安装包
测试: test/regression.cjs (Node + jsdom)，224 项断言
鸿蒙: harmony/ (ArkTS 原生，并行主线)
```

## 硬约束（违反即踩坑）

### 1. UI 形态
- 美图面板：**内嵌底部栏**（`.edit-panel` border-top），禁止改成弹窗/浮窗，不遮挡主图
- 批量面板：遮罩弹窗（`.batchMask`），覆盖主图属正常交互
- 导航条：顶栏 + 底部图片条，不可随意增删按钮

### 2. 版本号一致性（6 落点必须全同）
```
tauri.conf.json      → bundle.version
Cargo.toml            → package.version
EXE FileVersion       → .VersionInfo.FileVersion
EXE ProductVersion    → .VersionInfo.ProductVersion
manifest.webmanifest  → version
aboutContent 显示     → app.js 内 about 标题的 vX.X.X 标注
sw.js 缓存            → CACHE 常量（改 app.js 必须升）
```
改版本号 = 7 处同步 + 重构建 + 重推送。

### 3. 打包必踩
- 改 app.js / sw.js / index.html 后 **sw.js CACHE 必须 +1**
- 构建前必须跑 `node scripts/sync-dist.cjs`（复制 8 文件 + assets）
- Windows PowerShell 5：参数行纯 ASCII（中文注释会被 GBK 误读）

### 4. 算法管道
- 美图变形（slim / deform）：**合并位移场**一次性双线性采样，导出 = 预览同公式
- AI 超分：`sub_pixel_cnn.onnx` + ort.wasm，**失败自动降级 Lanczos**，绝不挂起
- 抠图：高斯似然比 + 双边滤波羽化 ≤512px 工作分辨率

### 5. 测试环境限制
- jsdom `<canvas>` 的 Uint8Array 是 window realm，`instanceof Uint8Array` 要用 `window.Uint8Array`
- regression.cjs 共享同一 jsdom document，前序测试改的控件值会残留 → 断言前显式设目标值

## 代码风格

```
原生 JS，无 TypeScript，无框架
- 函数命名: camelCase（slimCanvas, renderEditPreview）
- UI id: kebab-case（slim-reset, edit-history-btn）
- CSS 类: kebab-case（.deform-btn, .edit-section）
- 变量: 全局 state 对象（state.filters, state.slim, state.deform）
- 常量: UNDO_MAX, CACHE, STYLE_PRESETS
- 注释: // 单行，中文
```

## Git 规范

```
commit message: 中文前缀 + 短描述
  feat: 新增美型微调五大变形
  fix: NSIS 安装界面全中文
  refactor: 合并位移场替换 slimCanvas

SSH 推送（已配置）:
  git push origin master

分支: 只用 master（单主线开发）
```

## 关键文件入口

| 文件 | 角色 |
|---|---|
| `app.js` | 全部前端逻辑（252KB，单文件） |
| `index.html` | 全部 UI 结构 |
| `styles.css` | 全部样式 |
| `sw.js` | Service Worker 缓存（CACHE 常量必须跟版本） |
| `src-tauri/tauri.conf.json` | Tauri 配置 + NSIS 语言 + bundle.version |
| `src-tauri/Cargo.toml` | Rust 版本号 |
| `src-tauri/src/lib.rs` | Tauri 命令层（文件/剪贴板/壁纸） |
| `test/regression.cjs` | 224 项前端回归测试 |
| `scripts/sync-dist.cjs` | 打包前资源同步 |
| `nsis_x/*.exe` | 交付产物（Setup + MSI） |

### 6. 台帐系统（成长型 · 跨会话交接入口）

> 台帐目录：`.trae/ledger/`（跟项目走，git 可提交）
> 台账规范引擎：配合 `growth-journal` Skill 使用，冲突时 AGENTS.md 路径优先，Skill 模板规范仍适用

#### 6.1 台帐目录结构（固定，不许乱改）

```
.trae/ledger/
├── START_HERE.md           ← 🟢 新接手第一站（30 秒读完）
├── context.md              ← 当前完成度快照 + 已定硬规则
├── decisions.md            ← 技术决策（Dc-XXX 模板）
├── issues.md               ← 踩过的坑（活跃区 + 归档区，Iss-XXX 模板）
├── changes.md              ← 文件变化（Chg-XXX 模板）
├── .session.md             ← 会话临时内存（每次提炼后清空）
└── weekly/YYYY-MM-DD.md    ← 周报（每周一自动生成）
```

#### 6.2 启动时先看台帐（每次新会话必做，没商量）

1. **按序加载**：START_HERE.md → context.md → issues.md 活跃坑 → decisions.md → .session.md
2. **第一轮回复开头必出**：用 3-5 行大白话给台账速读，别等用户问：
   ```
   📋 台账速读：
   ├─ 当前进度：xxx 100% / xxx 60% / xxx 待启动
   ├─ 已定硬规则：xxx
   ├─ 高风险坑：Iss-001 xxx（踩 2 次）
   └─ 上会话收尾：xxx
   ```

#### 6.3 改之前必扫台帐（每次 Edit/Write/RunCommand 前必做）

1. 拿目标文件路径（或路径关键字）去 `issues.md` 活跃坑区做字符串匹配
2. **命中活跃坑 → 先口头提醒再操作**：「⚠️ 这个路径之前踩过 Iss-XXX [坑标签] 坑，预防规则是：xxx」
3. 没命中 → 正常操作
4. 新发现的预防规则 → 自动以 `// TODO: [坑标签] 预防：xxx` 形式注入源码文件头部

#### 6.4 改完 / 踩坑 / 决策 → 必须记台帐

| 触发时机 | 写哪 | 编号 |
|----------|------|------|
| 做了明确技术选型 | decisions.md + changes.md | Dc-XXX + Chg-XXX |
| 解决了新坑 | issues.md（活跃区）+ changes.md | Iss-XXX + Chg-XXX |
| 项目状态变了 | context.md 进度快照表 | 更新对应行百分比 |
| 改 ≥3 文件解决一个独立问题 | changes.md（批次记录） | Chg-XXX |
| 会话临时小坑 / 未决尾巴 | .session.md | 简短 bullet |

#### 6.5 成长型归类 + 加级（防台帐膨胀）

- **同类坑不重复建**：写 Iss 条目前先 Grep，命中同类则更新「重现次数」+1，不新建
- **踩够 3 次自动沉淀**：活跃区踩满 3 次的坑 → 移归档区，标注「已沉淀」，活跃坑 top 3 永远给最高频
- **活跃坑数量硬限 ≤10**：超过 10 个时，重现次数最少的那个自动降级归档
- **决策不翻旧账**：已定 Dc 条目不许无故推翻；真要推翻 → 新建 Dc-XXX（标注替换哪个），旧 Dc 保留
- **每条 ≤15 行**：只写事实不写流水，长篇过程放 .session.md 临时区，提炼时压缩

#### 6.6 每轮工作结束必须总汇（会话收尾必做）

会话快结束（用户说"就这样"、一轮大任务完成、或跑了 20+ 轮）时：

1. **5 行以内大白话总汇本轮完成了啥**，给用户看的：
   ```
   ✅ 本轮完成：
   ├─ AGENTS.md 新增 §6 台帐系统硬约束
   ├─ 初始化 .trae/ledger/ 6 个模板文件
   └─ START_HERE.md 写入当前进度快照
   ```
2. **提炼 .session.md**：有长期价值的条目 → decisions.md / issues.md / changes.md
3. **清空 .session.md** 只留骨架模板
4. **更新 context.md** 当前进度快照 + START_HERE.md 的「最近 3 周大事」
5. **生成当天 weekly/YYYY-MM-DD.md**（已存在则追加）

#### 6.7 跨 AI 交接铁律

- **换电脑 / 换 AI / 新开会话** → 第一件事读 `START_HERE.md`，30 秒接手
- START_HERE.md 必须包含：一句话定位 + 完成度表 + 已定硬规则 + 活跃坑 top 3 + 接手下一步
- 严禁出现「我不知道这个项目在干什么」「之前做了什么」的情况

---

## 交付流程（每次改动后）

```
1. 改代码 → 跑 node test/regression.cjs（必须全绿）
2. node scripts/sync-dist.cjs（dist 同步）
3. sw.js CACHE +1（如果改了 app.js 或 sw.js）
4. git add -A && git commit -m "xxx" && git push
5. npm run tauri build（需要桌面安装包时）
6. 复制产物到 nsis_x/

—— 先本机更新，确认 OK 再整体升级 ——
7. 本机静默安装: Setup.exe /S /D=<本地临时路径>
8. 验证 EXE FileVersion / ProductVersion 正确 → 启动应用 Responding=True
9. 手动目视验证核心场景（如切图归零、GIF 动画、更多工具面板布局）
10. 本机卸载: uninstall.exe /S（临时路径，不影响正式环境）
—— 以上 7-10 步全部 OK，再推整体升级 ——
```

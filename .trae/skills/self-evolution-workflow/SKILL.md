---
name: self-evolution-workflow
description: 自我进化工作流操作手册。从竞品报告 → 执行计划 → 实现 → 测试 → 构建 → 审查 → push → 写 Skill 的完整闭环。
trigger: 自我进化工程师每次工作时、触发功能迭代时
---

# Self-Evolution Workflow · 自我进化工作流

## 一条命令触发全流程

```
用户输入: "实现消除笔功能"
Self-Evolution 执行: Step 1 → Step 8 完整闭环
输出: 新功能 commit + 新 Skill + 更新的 competitive-analysis 数据库
```

---

## Step 1：读取竞品报告

### 输入来源
1. `.trae/agents/market-researcher.md` 中的**功能热度榜单**
2. `.trae/skills/competitive-analysis/SKILL.md` 中的**数据库表**
3. 用户指令（如果直接指定功能）

### 自动筛选
```js
// 只吸收 P0 + P1 功能
const candidates = marketReport.filter(f => f.priority === 'P0' || f.priority === 'P1');
// 跳过已实现的
const gaps = candidates.filter(f => !existingChecklist.includes(f.keyword));
// 跳过需要云端的（离线硬约束）
const offline = gaps.filter(f => f.offline === true);
// 取难度最低的 1-2 个
const picked = offline.sort((a, b) => a.difficulty - b.difficulty).slice(0, 2);
```

### 输出
```markdown
# 迭代周期 2026Q4-1
候选:
- [消除笔] 难度⭐⭐⭐ 对标光影看图
- [长图翻页] 难度⭐ 对标 HoneyView

本轮: 实现长图翻页（难度最低）
```

---

## Step 2：拆执行计划

### TodoWrite 格式
```js
[
  { id: 1, content: "检测图片长宽比 + state.isLongImage 标志", priority: "high", status: "in_progress" },
  { id: 2, content: "滚轮行为切换（缩放 ↔ 翻页）", priority: "high", status: "pending" },
  { id: 3, content: "自动定位到顶端", priority: "medium", status: "pending" },
  { id: 4, content: "test/regression.cjs 追加 6 条断言", priority: "high", status: "pending" },
  { id: 5, content: "regression 全绿 + sync-dist + sw CACHE +1", priority: "high", status: "pending" },
  { id: 6, content: "npm run tauri build（EXE + NSIS + MSI）", priority: "high", status: "pending" },
  { id: 7, content: "code-review 6 落点版本号巡检", priority: "medium", status: "pending" },
  { id: 8, content: "Git commit + push", priority: "high", status: "pending" },
  { id: 9, content: "写 Skill: .trae/skills/long-image-scroll/SKILL.md", priority: "medium", status: "pending" },
  { id: 10, content: "更新 competitive-analysis 数据库表", priority: "low", status: "pending" },
]
```

### 关键约束写入计划
```
- 不破坏现有 pipeline（扩展而非替换）
- 每步必须验证 regression 全绿
- 新 state 字段进 editSnap / restoreEdit
- sw.js CACHE 必须 +1
- 6 落点版本号最终巡检
```

---

## Step 3：实现（调度 frontend-dev / backend-dev）

### 改文件顺序
```
1. app.js（核心算法 + 状态 + 事件绑定）
2. index.html（DOM）
3. styles.css（样式）
4. src-tauri/src/lib.rs（新 Tauri command，如需要）
```

### 强制走现有架构
```
新 state 字段 → 加进 editSnap() 和 restoreEdit()
新 DOM id → 加进 cacheDom() 的 els 数组
新事件 → 加进 bindEvents()
新 canvas 函数 → 跟 slimWarp / slimDisp 同级（不在 DOM 里 inline）
UI 分区 → 挂在 .edit-section 里（高级 tab 下）
```

### 禁止事项
```
❌ 另起炉灶（重写整个 renderEditPreview）
❌ 绕过合并位移场（单独处理 slim 再单独处理 deform）
❌ 在 HTML 里写 inline function
❌ 改变 .edit-panel 为弹窗
```

### 每步验证
```bash
node test/regression.cjs | tail -3
# 必须: 通过 N / 失败 0
# 如果失败 → git checkout -- 回到改动前
```

---

## Step 4：自动加测试

### 测试模板
```js
// regression.cjs 末尾追加 IIFE
(function() {
  const state = { isLongImage: false, ... };
  let passed = 0, total = 0;
  function assert(cond, msg) { ... }

  // 核心功能断言
  assert(typeof detectAspectRatio === 'function', '函数存在');

  // 长图检测
  const tall = detectAspectRatio({ width: 1080, height: 1920 });
  assert(tall.isTall === true, '1080×1920 是长图');

  const wide = detectAspectRatio({ width: 1920, height: 1080 });
  assert(wide.isWide === true, '1920×1080 是宽图');

  const square = detectAspectRatio({ width: 1080, height: 1080 });
  assert(square.isTall === false && square.isWide === false, '正方形不是长/宽图');

  // 边界条件
  const edge = detectAspectRatio({ width: 1080, height: 1728 });  // ratio ≈ 0.629
  assert(edge.isTall !== undefined, '边界 ratio=0.63 有明确判断');

  console.log('========================================');
  console.log('通过 ' + passed + ' / ' + total);
})();
```

### 测试门槛
```
✅ ≥ 5 条断言
✅ 覆盖核心功能
✅ 覆盖边界条件（ratio 临界值 0.6 和 1.8）
✅ 覆盖 false/empty/null 场景
✅ 不依赖 DOM（jsdom 安全）
```

---

## Step 5：构建 + 回归验证

### 流水线
```bash
# 5.1 regression 全绿
node test/regression.cjs
# 必须: 通过 N / 失败 0

# 5.2 sync-dist
node scripts/sync-dist.cjs
# 必须: 8 文件 + assets 同步

# 5.3 sw CACHE +1（如果改了前端）
# 手动: .trae/trae-ai-vXX → .trae/trae-ai-v(XX+1)

# 5.4 tauri build
npm run tauri build
# 必须: Rust release + NSIS + MSI 全成功
# 产物: EXE + Setup.exe + MSI

# 5.5 安装包端到端
& "Setup.exe" /S /D=C:\LVJX_TEST
& ".\uninstall.exe" /S
# 必须: 成功安装 + 成功卸载
```

---

## Step 6：Code Review + 安全审计

### 6.1 code-reviewer 检查
```bash
# 6 落点版本号
rg 0\.1\.0 tauri.conf.json Cargo.toml manifest.webmanifest
rg v0\.1\.0 app.js
rg lvjiaoxi-viewer-v\d+ sw.js
# EXE
(Get-Item src-tauri\target\release\lvjiaoxi-viewer.exe).VersionInfo
# 必须: 全一致
```

### 6.2 面板形态检查
```bash
rg '\.edit-panel' styles.css -A3 | rg 'border-top'
# 必须: .edit-panel 有 border-top（内嵌底栏）
rg '\.edit-panel' styles.css -A5 | rg 'z-index|position.*fixed'
# 必须: 无 z-index / position: fixed
```

### 6.3 安全审计
```bash
# 新增 command 必须有 path 校验
rg -A15 '#\[tauri::command\]' src-tauri/src/lib.rs | rg 'canonicalize|白名单|starts_with'
# 必须: 每个 command 至少一个校验
```

### 输出格式
```markdown
## Review · commit XXXXXXX

| 维度 | 结果 |
|---|---|
| 6 落点版本号 | ✅ 全一致 |
| 面板形态 | ✅ .edit-panel border-top |
| 位移场管道 | ✅ deformTotalDisp 无绕过 |
| 撤销快照 | ✅ editSnap/restoreEdit 新字段已同步 |
| sw CACHE | ✅ 已 +1 |
| 安全边界 | ✅ 新 command 有白名单 |
| regression | ✅ 230/230 全绿 |

结论: ✅ 通过
```

---

## Step 7：Git commit + push

### commit message 规范
```
feat: 长图优化滚轮翻页（对标 HoneyView v5.53）

- 检测图片长宽比 → state.isLongImage / isWide
- 长图模式：滚轮翻页（top→bottom / bottom→top）
- 自动定位到顶端（1:1 显示时）
- regression +6 条断言，总计 230
- sw.js CACHE v23 → v24
- 新增 skill: .trae/skills/long-image-scroll/

实现计划: todo #20-29
验证: regression 全绿 + 安装包端到端 + 6 落点版本号一致
```

### 执行
```bash
git add -A
git commit -m "feat: xxx"
git push origin master
# SSH 已配置，自动认证
# 检查: git log origin/master -1 --oneline
```

---

## Step 8：自动写 Skill（关键！）

### Skill 存放位置
```
.trae/skills/<feature-name>/SKILL.md
```

### Skill 结构（必须）
```markdown
---
name: <feature-name>
description: 一句话描述 + 对标竞品 + 实现难度
trigger: 什么时候用
---

# <Title>

## 竞品对标
- 哪些竞品有这个功能

## 架构
- 代码入口（app.js 行号）
- 数据流图
- 与现有 pipeline 的关系

## 实现 Checklist
- [ ] 算法
- [ ] state 字段
- [ ] UI
- [ ] editSnap / restoreEdit
- [ ] 测试
- [ ] sw CACHE +1

## 测试模板
- 核心断言
- 边界条件
- regression 位置

## 降级方案
- 模型加载失败怎么办
```

### 同时更新 competitive-analysis 数据库表
```markdown
# 原来: | 长图优化滚轮翻页 | HoneyView/美图看看 v2 | ❌ |
# 更新: | 长图优化滚轮翻页 | HoneyView/美图看看 v2 | ✅ commit XXXXXXX |
```

---

## 周期迭代节奏

| 周期 | 动作 | 产出 |
|---|---|---|
| 每周 | 读 market-researcher 报告 | 功能候选清单 |
| 每 2 周 | 实现 1 个 P0 功能 | commit + 新 Skill |
| 每月 | 全量 code review | 架构文档更新 |
| 每季度 | 竞品大版本跟踪 | 季度热度报告 |

---

## 失败回滚清单

| Step | 失败原因 | 回滚动作 |
|---|---|---|
| 3 实现 | regression 挂了 | `git checkout -- .` 回到改动前 |
| 5 构建 | Rust 编译错误 | 检查依赖版本 / cargo update |
| 5 构建 | NSIS/MSI 失败 | 清理 target/release/bundle 重跑 |
| 6 review | 6 落点版本号不一致 | 按 devops 9 步流水线补齐 |
| 7 push | SSH 连不上 | 检查 GitHub 连通性 / 手动 push |
| 8 Skill | 格式不对 | 按模板重写 |

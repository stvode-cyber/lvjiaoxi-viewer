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

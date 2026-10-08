# 🟢 接手入口 · 30 秒懂绿角犀看图

## 一句话定位
桌面图片浏览器 + 内嵌底部栏美图编辑器。零框架原生 JS 单文件 app.js（252KB）+ Rust Tauri v2 + WebView2 离线运行时。核心卖点：合并位移场变形（导出 = 预览同公式）、AI 超分 ONNX 推理失败自动降级 Lanczos、抠图高斯似然比 + 双边羽化。

## 当前版本
`0.1.0`（tauri.conf.json / Cargo.toml / manifest.webmanifest 三处一致；sw.js CACHE v41）

## 完成度（2026-10-08）

| 模块 | 状态 | 备注 |
|------|------|------|
| 图片浏览核心 | ✅ 100% | 打开/缩放/翻页/最近访问 |
| 美图编辑器 | ✅ 100% | 内置底部栏（非弹窗），slim/deform 合并位移场 |
| AI 超分 | ✅ 100% | ONNX + ort.wasm，失败降级 Lanczos |
| 抠图 | ✅ 100% | 高斯似然比 + 双边羽化 ≤512px |
| 打包交付 | ✅ 100% | NSIS 全中文 + MSI，内嵌 WebView2 离线包 |
| 回归测试 | ✅ 100% | regression.cjs 224 项断言全绿 |
| 鸿蒙主线 | 🔄 60% | harmony/ ArkTS 原生，并行开发中 |
| 后端服务 | ⬜ 待接入 | server/mock-server.js 占位，无正式部署 |

## 已定硬规则（别再问）
- 美图面板形态：**内嵌底部栏**（`.edit-panel` border-top），禁止改弹窗/浮窗
- 批量面板形态：遮罩弹窗（`.batchMask`），覆盖主图正常
- 导航条：顶栏（6 核心按钮：撤销/重做/编辑/截图/信息/全屏）+ beauty-bar（美颜内嵌底部栏）+ bottom-nav（6 功能导航：复制/幻灯/批量/最近/设置/云账户）+ 底部图片条。**现有按钮不许随意增删；新增导航区域需跟用户确认**
- 变形算法：合并位移场一次性双线性采样，导出 = 预览同公式
- AI 超分：ONNX 失败必须自动降级，禁止挂起
- 版本号 6 落点必须全同，改版本 = 7 处同步 + 重构建
- sw.js CACHE 改 app.js / sw.js 必须 +1
- 测试前必须跑 sync-dist.cjs

## 活跃坑 top 3（踩过 ≥2 次）
1. **Iss-001** jsdom Uint8Array 是 window realm，`instanceof` 必须用 `window.Uint8Array`
2. **Iss-002** PowerShell 5 参数行纯 ASCII，中文注释被 GBK 误读
3. **Iss-004** NSIS 安装残留的 lnk 指向已删除目录（已归档 Iss-003：jsdom document 残留值）

## 接手下一步
看用户最新需求 → 按 AGENTS.md §6.3 改前必扫 issues.md → 动手

---

## 台账索引
- 完整状态快照 → `context.md`
- 所有技术决策 → `decisions.md`
- 所有踩过的坑 → `issues.md`
- 所有文件变化 → `changes.md`
- 会话临时记录 → `.session.md`
- 历史周报 → `weekly/`

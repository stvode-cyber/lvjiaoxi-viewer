# issues.md · 踩过的坑

> 活跃区：正在威胁当前开发的坑，改相关文件前必扫
> 归档区：踩够 3 次已沉淀或已解决的历史坑，只追加不准删

---

## 活跃坑（当前 ≤10 个，硬限）

#### Iss-001（活跃 · 踩 2 次）jsdom Uint8Array 跨 realm 检测失败

- **问题**：jsdom `<canvas>` 创建的 Uint8Array 是 window realm 的，`instanceof Uint8Array` 在 Node realm 里返回 false
- **根因**：jsdom 有自己的全局对象，Uint8Array 构造函数与 Node 原生不同
- **解决**：测试里用 `window.Uint8Array` 或 `Object.prototype.toString.call(buf) === '[object Uint8Array]'`
- **预防规则**：写 `// TODO: [jsdom-Uint8Array] 预防：jsdom 环境下 instanceof Uint8Array 要用 window.Uint8Array` 到 regression.cjs 头部
- **关联路径**：`test/regression.cjs`、所有用 canvas getImageData 的测试

#### Iss-002（活跃 · 踩 2 次）PowerShell 5 中文注释被 GBK 误读

- **问题**：PowerShell 5 读取含中文注释的脚本参数行时，按 GBK 解码导致参数错乱
- **根因**：Windows PowerShell 5 默认系统编码（中文系统为 GBK），参数行含 UTF-8 BOM 或中文会触发
- **解决**：所有 PS 脚本参数行纯 ASCII；中文注释放 `#` 单独行且不在参数行同一行
- **预防规则**：写 `# TODO: [PS5-GBK] 预防：参数行纯 ASCII，中文注释单独 # 行` 到构建脚本头部
- **关联路径**：`scripts/sync-dist.cjs` 调用的 PS 脚本、`build-windows.bat` 间接调用的 PS

#### Iss-003（活跃 · 踩 3 次 ⚠️ 够归档门槛）regression.cjs 共享 jsdom document 残留值

- **问题**：regression.cjs 所有测试共享同一个 jsdom document，前序测试改过的 input.value / canvas 尺寸 / global state 会残留到后序测试
- **根因**：test 框架没有每个 test 独立 setup，同一个 document 贯穿全程
- **解决**：断言前显式 `element.value = '目标值'`，不要依赖默认值
- **预防规则**：写 `// TODO: [jsdom-document] 预防：断言前显式设目标值，别依赖上一个测试的残留` 到 regression.cjs 头部
- **关联路径**：`test/regression.cjs`
- **状态**：踩够 3 次 → 下次提炼时自动移归档区

---

## 归档区（已沉淀 / 已解决，只追加不准删）

<!-- 归档条目会从活跃区迁过来，格式同活跃区 -->

#### Iss-000（已沉淀）初始化占位

- **备注**：首个条目，方便后续归档追加时有参照格式

# API Doc Writer · API 文档工程师

## 你的职责

为项目写 API 文档。注意：**绿角犀看图没有 HTTP API**，API 指的是 Tauri Commands（前端→Rust）和前端全局函数。

## 两类 API

### 1. Tauri Commands（lib.rs）

每个 command 对应前端 `invoke('xxx_command', { param: value })` 调用。

文档模板：
```markdown
### `open_file_dialog()` → `Promise<String>`

**后端**: `src-tauri/src/lib.rs:45`
**前端调用**: `invoke('open_file_dialog')`

打开系统文件选择器（Tauri dialog:open）。
返回用户选中的图片完整路径；取消则返回空字符串。

**参数**: 无
**返回**: `Ok(String)` - 选中的文件路径
         `Err(String)` - 用户取消或 dialog 未配置

**示例**:
```js
const path = await invoke('open_file_dialog');
if (path) { state.items.push({ path }); }
```
```

### 2. 前端全局函数（app.js）

app.js 是单文件，函数间通过全局 state 传递。核心 API 清单：

| 函数 | 位置 | 用途 |
|---|---|---|
| `renderEditPreview()` | 渲染预览图 | 触发管道：形变→锐化→色调→裁剪 |
| `exportCanvasOfCurrent()` | 全尺寸导出 | 返回完整处理后的 canvas |
| `editSnap() / restoreEdit()` | 撤销重做 | JSON 快照 + 恢复 |
| `deformCanvas(canvas, list, slim)` | 全尺寸形变 | 合并位移场，导出管道用 |
| `applyDeformInPlace(ctx, W, H, list, slim)` | 预览形变 | 就地改小画布像素 |
| `deformBuilders(list)` | 数组→采样对象 | 过滤 strength=0 + 预计算 invRx2/invRy2 |
| `deformTotalDisp(defs, slimW, nx, ny)` | 合并位移场 | 所有形变叠加后的 {sx, sy} |
| `bilinear(data, W, H, x, y, out, oi)` | 双线性采样 | 4 邻域加权平均 |
| `slimWarp(slim)` | 瘦脸瘦身→位移场 | 预处理，为 null 表示未启用 |
| `STYLE_PRESETS` | 25 套预设 | { name, preset: { filters... } } |

### 3. State 数据结构

```js
state = {
  // 滤镜（美颜参数）
  filters: {
    brightness: 0, saturate: 0, contrast: 0, temperature: 0,
    sharp: 0, highlight: 0, shadow: 0, fade: 0, grain: 0, vignette: 0, posterize: 0
  },
  // 瘦脸瘦身
  slim: { enabled: false, mode: 'face'|'body', strength: 0, cx: 0.5, cy: 0.5, rx: 0.22, ry: 0.22 },
  // 美型微调（数组，每种变形一个对象）
  deform: [
    { kind: 'eye', cx: 0.38, cy: 0.40, strength: 50, rx: 0.09, ry: 0.07 },
    { kind: 'teeth', cx: 0.50, cy: 0.62, strength: 30, rx: 0.10, ry: 0.06 }
  ],
  deformMode: { kind: 'eye' } | null,  // 锚点模式
  // 其他
  crop: null | { x, y, w, h },  // 归一化矩形
  mosaic: [],  // 马赛克笔触
  texts: [],   // 文字层
  matting: { mask: Uint8Array|null, mW, mH },  // 抠图蒙版
}
```

## 文档位置

```
overview.md         # 产品总览 + 功能清单
BUILD.md            # 构建说明
使用说明.md/.html     # 用户操作手册
CHANGELOG.md        # 版本变更记录
交接文档.md          # 开发交接（含架构图）
```

## 交付检查清单

- [ ] 新增 Tauri command 必须在 overview.md 里补参数表
- [ ] 新增前端全局函数必须在函数清单里注册
- [ ] CHANGELOG.md 每次发版补记（版本号 + 日期 + 变更）
- [ ] 代码注释 ≥ 30%（关键管道函数必须有中文注释）

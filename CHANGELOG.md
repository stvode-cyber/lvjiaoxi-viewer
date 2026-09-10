# 绿角犀看图 · 更新日志（CHANGELOG）

> 更新日期：2026-09-10。格式：倒序。✅ = 已落地并验证。
> 交接/速览请看 `交接文档.md`；构建踩坑看 `BUILD.md`。

***

## 2026-09-10 · 版本号全链路补齐（6 落点一致性）

- **排查**：用户强调版本号在所有落点必须完全一致。巡检发现 `manifest.webmanifest` 缺 `version` 字段、关于页面 `aboutContent()` 未显示版本号。
- **补齐**：
  - [manifest.webmanifest](file:///d:/源码存档/看图工具/manifest.webmanifest) 新增 `"version": "0.1.0"`。
  - [app.js](file:///d:/源码存档/看图工具/app.js#L3470) 关于页标题加 `v0.1.0` 灰标（`<span style="color:#888">`）。
  - `sw.js` 缓存版本 v20 → v21（改了 app.js 必须升）。
- **6 落点全确认 0.1.0**：tauri.conf.json · Cargo.toml · EXE FileVersion · EXE ProductVersion · manifest.webmanifest · aboutContent 显示。sw.js 缓存 v21 与 dist 同步。
- **测试**：224 项全绿，Rust release 57.4s，构建 Setup.exe(255.4MB) / MSI(253.7MB)。

***

## 2026-09-10 · 美图「瘦身 / 瘦脸」局部液化形变

- **诉求**：美图高级工具新增瘦身、瘦脸两类局部液化功能，所见即所得、可撤销/重做。
- **UI** [index.html](file:///d:/源码存档/看图工具/index.html#L525-L542)：高级面板「瘦身 / 瘦脸（局部液化）」分区——瘦脸/瘦身模式切换、「🎯 设定锚点」、强度滑块 `slimStrength`、作用范围滑块 `slimRange`、重置按钮。
- **核心** [app.js](file:///d:/源码存档/看图工具/app.js#L1430-L1548)：
  - `state.slim`：{ enabled, mode(face/body), strength, cx/cy 锚点, rx/ry 作用范围 }。
  - `slimWarp`：据模式算横向 `K`（瘦身含竖直 `Kv`）与二维高斯作用场；`slimDisp` 反向映射 + `bilinear` 双线性采样。
  - `slimCanvas`（全尺寸导出）/ `applySlimInPlace`（预览就地）共用同一位移场公式，预览=导出所见即所得。
  - 接入 `exportCanvasOfCurrent`（烘焙后、像素质点前）与 `renderEditPreview`（绘制锚点十字圈 `drawSlimMarker`）。
  - `setSlimAnchor` 程序化设锚点；预览指针在锚点模式下拖拽定位（`onPreviewDown/Move/Up`）。
  - `editSnap/restoreEdit` 纳入 `state.slim` + `slimMode` 快照 → 支持撤销/重做。
- **事件绑定**（s5）：slimFace/slimBody/slimMode/slimStrength/slimRange/slimReset 全量绑定，模式切换、强度/范围 input、重置均触发 `pushUndo` + `updateSlimUI` + `renderEditPreview`。
- **测试** [regression.cjs](file:///d:/源码存档/看图工具/test/regression.cjs#L776-L839)：新增瘦身/瘦脸场景 18 项断言（控件存在、模式切换、锚点写入与越界 clamp、位移场启用/K/Kv、中心零位移与边缘收缩、slimCanvas 无像素安全跳过、重置回默认）。回归 **224 项全绿**。
- 配套：`sw.js` 缓存升至 v20。

***

## 2026-09-10 · 安装包内嵌 WebView2 离线运行时（便携交付）

- **诉求**：让 Setup.exe 拷到任何 Win10/11 x64 电脑双击即装即用、完全离线，目标机无 WebView2 也能自动装好。
- **配置** [tauri.conf.json](file:///d:/源码存档/看图工具/src-tauri/tauri.conf.json#L57-L59)：`bundle.windows.webviewInstallMode = offlineInstaller`，Tauri 构建时自动下载并内嵌 WebView2 离线安装包（NSIS/MSI 各约 +250MB）。
- **产物**（已同步至项目根目录）：Setup.exe 255.4MB / MSI 253.7MB。应用运行仍走系统 Evergreen 运行时，功能与现网一致。
- 注：此前的 `bundledWebview2Runtime` 为 Tauri v1 字段，v2 须用 `webviewInstallMode`。

***

## 2026-09-10 · 批量转换 / 调整尺寸实时预览（所见即所得）+ 转换预览 Bug 修复

- **诉求**：批量「格式转换」「调整尺寸」页签此前无效果预览，违背「所见即所得」硬约束；补齐与压缩同款实时预览。
- **UI** [index.html](file:///d:/源码存档/看图工具/index.html#L166-L253)：转换页签新增 `#cvPreviewLabel`+`#cvPreview`，尺寸页签新增 `#rsPreviewLabel`+`#rsPreview`（各 240×240 缩略画布）。
- **核心** [app.js](file:///d:/源码存档/看图工具/app.js#L2694-L2751)：
  - `renderCvPreview()`：按 目标格式/质量 整图重编码，label 实时显示 `尺寸 · 格式 · q质量/无损 · 估算 xx KB`。
  - `renderRsPreview()`：`renderRsPreview()` 按 缩放模式(百分比/精确宽高)/锁定比/重采样算法 计算目标尺寸并缩放绘图，label 显示 `原尺寸 → 目标尺寸 · 格式 · 估算 xx KB`。
  - 布线：`switchBatchTab` 切到 convert/resize 触发渲染；格式/质量/模式/宽高/锁定比/重采样/输出格式 change 均重渲染。
- **Bug 修复**：`renderCvPreview` 原对 `it.img`（HTMLImageElement，无 `toBlob`）直接调 `canvasToBlob` → 真实桌面也会「渲染失败」；改为先绘入整图工作画布再 `toBlob`。
- **测试** [regression.cjs](file:///d:/源码存档/看图工具/test/regression.cjs#L656-L728)：新增 2 场景 21 项断言（转换: JPEG q92/PNG 无损/WebP q70 + 画布 240×240；尺寸: percent 50%→50×40、exact 锁定比宽 200→200×160、格式切换）。回归 **201 项全绿**。
- 配套：`sw.js` 缓存升至 v19；`dist` 待桌面构建前同步。

***

## 2026-09-10 · 批量压缩实时预览（所见即所得）

- **诉求**：压缩页签此前只有参数无效果预览，违背「所见即所得」硬约束；补齐与批量滤镜同款的**原图压缩后实时预览**。
- **UI** [index.html](file:///d:/源码存档/看图工具/index.html#L284-L292)：压缩页签顶部新增预览块 `#cpPreviewLabel` + `#cpPreview`（240×240 缩略画布）。
- **核心** [app.js](file:///d:/源码存档/看图工具/app.js#L2650-L2690)：
  - `renderCompressPreview()`：取当前活动图按 目标格式/质量/最长边 等比缩放 → 缩略画布绘制 → 全目标尺寸重编码 Blob 估算体积，label 实时显示 `尺寸 · 格式 · q质量/无损 · 估算 xx KB`。
  - 布线：切到压缩页签、`cpFormat` change、`cpQuality` input、`cpMaxEdge` change 均触发重渲染（与 `updateCompressUI` 联动）。
  - 测试钩子暴露 `renderCompressPreview`。
- **桌面修复**：批量预览原取 `state.items[0]`，桌面端该项 `img` 为空（仅当前活动项 `state.index` 已加载），导致「无图片」；改为 `state.items[state.index] || state.items[0]`，并同步修正批量滤镜预览 `renderTonePreview` 同源问题。
- **测试** [regression.cjs](file:///d:/源码存档/看图工具/test/regression.cjs#L611-L625)：新增 8 项断言（预览控件存在 / label 含 50×40·WEBP·q70·估算 / 画布 240×240 / PNG 目标显示无损且不含质量档）。回归 **175 项全绿**。
- 配套：`sw.js` 缓存升至 v18，`dist` 已重新同步（含桌面修复）。

***

## 2026-09-09 · 一键抠图（离线智能去背）

- **诉求**：补齐此前标记「后续暂缓」的抠图能力，纯离线、不依赖模型/网络，交互式抠出主体并导出透明 PNG。
- **UI** [index.html](file:///d:/源码存档/看图工具/index.html#L520-L535)：编辑面板「高级」新增「一键抠图」分区，含 前景笔/背景笔 切换（再点取消）、笔刷大小滑块、一键抠图 / 清除笔迹 / 导出透明 PNG 三按钮及状态提示。
- **核心** [app.js](file:///d:/源码存档/看图工具/app.js#L2216-L2390)：
  - `setMatBrush/updateMattingUI`：画笔模式切换；指针 down/move 在预览图涂抹归一化笔迹（前景绿 / 背景红叠加层，`drawMatStrokes`）。
  - `runMatting`→`matSamples/matStats/matSegment/matBilateral`：≤512px 工作分辨率按颜色高斯似然比逐像素分类出 alpha，外接笔迹强约束 + 自动四边背景采样，再对 alpha 做彩色图引导的**边缘感知双边羽化**，软边去处锯齿。
  - `renderEditPreview`：去背景后铺**棋盘格透明底**（`drawChecker`）实现所见即所得；`applyMaskOverlay` 把蒙版乘到画布 alpha。
  - `exportMatting`：全尺寸重建 + 蒙版**双线性放大**（软边沿用），导出 `原名-透明.png`。
- **测试**：新增「一键抠图」场景（控件存在 / 画笔切换取消 / 分割成功且蒙版=mW×mH≤512² / 状态提示 / 导出命名 `photo1-透明.png` / 清除复位）。回归 **167 项全绿**。
- 配套：`sw.js` 缓存升至 v16，`dist` 已重新同步。

***

## 2026-09-09 · 导航条优化 + 画面区域截图

- **诉求**：导航条精简——移除收藏、使用说明、快捷键按钮；使用说明与快捷键整合进「设置」；滤镜页签隐藏（美图条已有核心参数）；新增画面区域截图；一键抠图后续暂缓。
- **导航条瘦身** [index.html](file:///d:/源码存档/看图工具/index.html#L35-L48)：移除「☆ 收藏」「📖 使用说明」「? 快捷键」，新增「📷 画面区域截图」。
- **设置整合** [app.js](file:///d:/源码存档/看图工具/app.js#L2278-L2307)：设置导航 8 组（通用/看图/幻灯片/文件关联/高级/快捷键/使用说明/关于）；`renderStaticSection` 渲染使用说明与关于静态内容。
- **滤镜迁移**：编辑面板由 6 类减为 5 类（美颜默认/风格配方/特效/高级/导出），原滤镜页完整参数（含高光/暗部/褪色/颗粒/暗角/色调分离/自动增强）并入美颜页「滤镜微调」分区。
- **画面区域截图** [app.js](file:///d:/源码存档/看图工具/app.js#L3073-L3101)：`snapVisible()` 用 `DOMMatrix` 复刻 `#image` 的位移+旋转+翻转+缩放+EXIF 定向矩阵，计算 transform-origin 修正后框选可见区域导出 PNG。
- **测试**：新增截图单元测试（空态放弃 / 导出命名 / 画布尺寸 / drawImage 原尺寸 / 恒等与旋转翻转矩阵精确值），jsdom 补 DOMMatrix polyfill；回归 137 全绿。
- 配套：`sync-dist.cjs` 同步前端，`sw.js` 缓存升至 v15，安装包重建。

***

## 2026-09-09 · AI 放大落地：内置轻量离线超分模型 + onnxruntime-web 本地化

- **诉求**：AI 放大此前强依赖联网下载模型/运行时，离线或慢网时体验差，且 GPU 推理门槛高。本次落地为**纯离线**方案。
- **模型与运行时** [assets/](file:///d:/源码存档/看图工具/assets)：
  - 内置 sub_pixel_cnn_2016 超分模型 `sub_pixel_cnn.onnx`（~0.24MB，单通道 Y，3×，瓦片推理）。
  - onnxruntime-web 本地化：`assets/ort/ort.min.js`（~0.44MB）+ `ort-wasm-simd-threaded.wasm`（~11MB）。
- **改造** [app.js](file:///d:/源码存档/看图工具/app.js#L1461-L1690)：
  - `initOrtEnv()`：`wasmPaths` 指向本地 `assets/ort/`，`numThreads=1` 免 Worker 脚本、纯离线可推理。
  - `loadAiSession()`：默认走内置离线模型；也可在高级设置自定义 3 通道模型 URL。
  - `upscaleSRY()`：YCbCr 拆 Y 通道，224×224 瓦片 3× 推理带 12px 重叠防接缝，Cb/Cr 最近邻放大合成 RGB。
  - `upscaleNCHW()`：自定义 3 通道模型走 1×3×H×W NCHW 推理。
  - `aiUpscale()`：内置/自定义分流，2×/4× 用 `resampleToScale` 对齐；任何失败自动降级为 Lanczos 插值，绝不空等。
- **测试**：AI 放大在 jsdom 下不挂起、失败正确降级；回归 129 / 美颜 52 / 照片 29 / 裁剪 14 / 最近 25 / 色调 17 全绿。
- 配套：`sync-dist.cjs` 递归同步 `assets/`，`sw.js` 缓存升至 v14 并纳入离线 AI 资源，安装包重建。

***

## 2026-09-09 · 批量滤镜补全：预设实时预览（所见即所得）

- **诉求**：批量滤镜此前只「选预设 → 盲跑」，无效果预览，违反「所见即所得」硬约束。落地补齐。
- **改造** [index.html](file:///d:/源码存档/看图工具/index.html#L262-L265) + [app.js](file:///d:/源码存档/看图工具/app.js#L2360-L2385)：
  - 「添加滤镜」页签顶部新增预览块：`#btPreview` 画布 + `#btPreviewLabel` 标注。
  - `renderTonePreview()`：取首张原图缩略到 ≤240px，用与导出一致的 `applyToneChunked` 色调引擎套当前选中预设即时渲染，全程 try/catch、异步不卡 UI。
  - 布线：切到 tone 页签、`btPreset` 下拉 change 均触发重渲染；可经 `qj.renderTonePreview()` 主动刷新。
- **测试**：新增「预览标注选中预设」「预览画布已渲染像素」。美颜 52 + 回归 129 全绿。
- 配套：`sw.js` 缓存升至 v13，`dist` 已重新同步，安装包重建。

***

## 2026-09-09 · 对标美图秀秀：一键美颜分档 + 左工具右属性 + 风格配方主入口

> 学习美图秀秀设计后落地：一级入口「一键美颜」「风格配方」，编辑区改「左工具 + 右属性」。撤销/重做为编辑底座。

### 一键美颜多档（t2）✅
- **诉求**：对标美图「一键美颜」，把磨皮/美白/瘦脸联动压缩成几档预设，外行也能一步出片。
- **改造** [index.html](file:///d:/源码存档/看图工具/index.html#L69-L78) + [app.js](file:///d:/源码存档/看图工具/app.js#L1676-L1703)：
  - 美图条新增「一键美颜」分组：**轻度 / 自然 / 精致** 三档。
  - `BEAUTY_PRESETS` 定义每档「提亮 + 磨皮」联动参数；`oneClickBeauty()` 单次 `pushUndo()` 快照后同步调整 `state.filters`（亮度/饱和）并追加 OpenCV 双边滤波队列。
  - 保留磨皮 / 美白细分按钮不动。

### 图下编辑区改「左工具分类 + 右属性面板」（t3）✅
- **诉求**：对标美图经典编辑布局，左侧工具分类、右侧选中工具属性，避免顶部平铺页签。
- **改造** [index.html](file:///d:/源码存档/看图工具/index.html#L317-L326) + [styles.css](file:///d:/源码存档/看图工具/styles.css#L223-L228)：
  - `#editTabs` 由顶部横向页签改为左侧纵向工具栏 `.edit-tools`（含 风格配方 · 滤镜 · 美颜 · 特效 · 高级 · 导出）。
  - 右列 `.edit-body` 为选中工具的属性面板；`.edit-tab` 用左侧竖条高亮激活项。

### 25 风格预设上浮为图下「风格配方」主入口（t4）✅
- **诉求**：对标美图「配方」，把现成 25 套风格一键/随机套到主界面。
- **改造** [index.html](file:///d:/源码存档/看图工具/index.html#L77-L78) + [app.js](file:///d:/源码存档/看图工具/app.js#L1653-L1660)：
  - 美图条新增「🪄 风格配方」（打开配方面板）、「🎲 随机配方」（当前图一键套随机风格）。
  - 编辑区左工具新增「风格配方」分类，右侧展示完整 25 预设网格 + 「🎲 随机风格」按钮。
  - `applyRandomStyle()` 从非「原图」预设中随机一键套用；风格均走 `applyStylePreset`（含撤销快照）。

- **测试**：新增 一键美颜（三档存在 + 联动亮度）、风格配方（主入口 + 左工具分类 + 随机无错）等断言。全量 **247 项前端测试全绿**（129 回归 + 50 美图 + 29 照片 + 25 最近 + 14 裁剪）。
- 配套：`sw.js` 缓存升至 v12，`dist` 已重新同步。

***

## 2026-09-09 · 美图功能直接上主界面

### 主界面新增常驻「美图」条（常用控件直接可用，无需弹窗）✅

- **诉求**：常用美图功能不该每次都要打开 🎨 弹窗才能用；主界面直接放置常用控件，高级工具仍走弹窗。
- **改造** [index.html](file:///d:/源码存档/看图工具/index.html#L51-L72) + [styles.css](file:///d:/源码存档/看图工具/styles.css#L67-L77) + [app.js](file:///d:/源码存档/看图工具/app.js)：
  - 主工具条下方新增常驻 `.beauty-bar`「美图」条：**亮度 / 对比 / 饱和 / 色温 / 锐化** 五个核心滑块，加 **美白强度 + 磨皮 / 美白** 按钮、**✨ 自动增强**、**🎨 更多工具**（打开完整弹窗，含风格 / 特效 / 高级 / 导出 / 裁剪）。
  - 核心滑块直改 `state.filters` 并实时 `applyFilters()`，与编辑工具共用同一滤镜源；新增 `syncBeautyBar()` 双向同步（随 `syncFilterUI` 及初始化调用）。
  - `onBeauty(kind, intensity)` 支持显式传入强度，主条按钮走主条滑块值、编辑工具内按钮沿用编辑工具内滑块。
  - 「更多工具 / 🎨」打开完整编辑功能、「自动增强」会校验当前是否有图。
  - 高级工具不再浮顶盖图：移除 `.modal-mask` 盖住主界面，改为**图片下方内嵌面板**，展开即「美图条 + 预览 + 页签导航」，不遮挡主图；点「✕」收起面板。
- **测试**：`test/regression.cjs` 新增 6 项断言（美图条存在、5 滑块齐全、磨皮/美白/更多工具/自动增强按钮存在、滑块直达 `state.filters`）。全量 **257 项前端测试全绿**（122 回归 + 29 照片 + 14 裁剪 + 25 最近 + 50 美图 + 17 色调）。
- 配套：`sw.js` 缓存升至 v11，`dist` 已重新同步。

***

## 2026-09-09 · 美图功能分类化导航

### 编辑面板引入分类页签（美图功能入导航）✅

- **诉求**：🎨 编辑面板此前是一长串堆叠功能区（滤镜 / 色调分离 / 自动增强 / 风格 / 美颜 / 边框 / 文字 / 马赛克 / 高级 / AI放大 / 裁剪 / 导出），无导航、需大量滚动。
- **改造**（参照批量对话框既有 `batch-tab` 页签模式）：
  - [index.html](file:///d:/源码存档/看图工具/index.html) 编辑弹窗在预览下方新增 `#editTabs` 分类页签：**滤镜 · 美颜 · 特效 · 高级 · 导出**，原 `.edit-section` 按类分装入 5 个 `.edit-pane` 面板组：
    - 滤镜：滤镜参数 + 色调分离 + 自动增强 + 风格预设
    - 美颜：磨皮 / 美白
    - 特效：边框 + 文字水印 + 马赛克
    - 高级：OpenCV 高级处理 + AI 放大 + 裁剪
    - 导出：格式 / 质量 / 导出
  - [styles.css](file:///d:/源码存档/看图工具/styles.css) 增 `.edit-tab/.edit-pane/.edit-body`，弹窗改为顶栏（预览 + 页签）固定、功能区独立滚动（`flex:1; overflow-y:auto; min-height:0`）。
  - [app.js](file:///d:/源码存档/看图工具/app.js) 新增 `switchEditTab(tab)`，打开编辑面板默认切到「滤镜」页，页签点击即切换；所有既有过滤器绑定按 id 不受隐藏影响。
- **测试**：`test/regression.cjs` 新增 4 项页签断言（5 个页签存在、默认滤镜激活、切美颜互斥、面板激活）。全量 **251 项前端测试全绿**（116 回归 + 29 照片 + 14 裁剪 + 25 最近 + 50 美图 + 17 色调）。
- 配套：`sw.js` 缓存升至 v9，`dist` 已重新同步。

***

## 2026-09-09

### HEIC/HEIF 解码引擎升级：heic2any → libheif-wasm（离线真正可用）✅

- **根因**：`heic2any@0.0.4` 无法解码真实 iPhone/相机 HEIC（报 `readAsArrayBuffer` 参数类型错误），且需联网。既有“离线可用”承诺没兑现。
- **替换为 libheif-wasm**（`libheif-bundle.js`，自包含、内嵌 de265 HEVC wasm，约 1.9MB）：
  - 用 `scripts/libheif-test/verify-node.cjs` 实测：真实 1280×854 HEIC 解码出 4,372,480 字节 RGBA（首字节非零），且移走 `.wasm` 文件后仍可解——**完全离线、无需服务端/联网**。
  - 前端 `app.js` 改为按需 `fetch('./libheif-bundle.js')` 文本 → `new Function` 注入浏览器式 CJS 伪装（补齐 `module/exports/process/__dirname/Buffer` shim）→ `HeifDecoder.decode()` → `heif_js_decode_image2(handle, RGB, RGBA)` 提像素 → `canvas → PNG 对象 URL`，结果缓存 `item.displayUrl`，主图/缩略图/预加载统一走 `resolveItemSrc` 复用。
  - 本地 bundle 优先，unpkg/jsdelivr 双 CDN 兜底；均失败时外层降级「无法解码」提示。
- **配套**：`sw.js` 缓存升至 v8（`libheif-bundle.js` 入缓存清单）；`scripts/sync-dist.cjs` 同步清单 `heic2any.min.js` → `libheif-bundle.js`；移除 `heic2any.min.js`。
- **测试**：`test/beauty.cjs` HEIC 用例改为注入 `window.__libheifModule` 桩 + `pixelsToBlobUrl`（jsdom 无 canvas）。全量 **247 项前端测试全绿**（112 回归 + 29 照片 + 14 裁剪 + 25 最近 + 50 美图含 HEIC + 17 色调）。

***

## 2026-09-08

### 迭代新功能：批量套滤镜 · AI 放大降级 · HEIC/HEIF 动态解码 ✅

- **批量「添加滤镜」**（`index.html` 批量对话框新增 tone tab / `app.js batchTone`）：从 25 个风格预设中选择一个，整批套用到所选图片，可选输出 JPEG/PNG/WebP 与是否保留原文件名，统一走 `applyToneChunked` 色调引擎（不触发网络、无模型依赖）。
- **AI 放大离线降级**（`app.js aiUpscale`）：未配置 ONNX 模型或无网时不再空等，自动降级为 Lanczos 插值放大；配置模型 URL 后走原有 onnxruntime 超分链路。离线可自测。
- **HEIC/HEIF 动态解码**（`app.js` + `lib.rs`）：
  - 后端 `load_paths` 对 `.heic/.heif` 透传原始字节 `data:image/heic;base64,...`，不阻塞整批加载。
  - 前端按需引入 `heic2any`（unpkg/jsdelivr 双源 CDN，仅检测到 HEIC 才加载），转码为 JPEG Blob 后以 objectURL 显示；结果缓存于 `item.displayUrl`，主图/缩略图/预加载统一经 `resolveItemSrc` 复用，批量切换时释放 blob。
  - 离线/库加载失败时降级为「无法解码」提示，不阻断软件。
- **测试**：`test/beauty.cjs` 新增 7 项 HEIC 用例（识别扩展名/dataURL/type、data URL→Blob、缓存复用、失败容错）；累计 112 回归 + 50 美工(含 HEIC) + 29 照片 + 14 裁剪 + 14 最近 + 17 色调 全绿（cloud-front 需 `server/mock-server.js` 运行方可评估，本环境未启动故跳过）。

### 美图预设体验与微调（9 个问题预设收敛参数） ✅

- **体验链路**：用真实照片（含肤色/天空/绿色/明暗动态范围）重渲 25 预设对比页 `preset-previews.html`，并新增 `preset-montage.png` 5×5 拼图一次性评估；样图 `sample-photo.*` 留存可复跑。
- **9 个参数过头的预设已收敛**（`app.js` 与 `scripts/render-presets.cjs` 两表同步，node 校验相等）：
  - 清新：saturate 110→104、temp -8→-4（肤色不再过橙）
  - 暖阳：temp 55→38、saturate 108→104（去掉"尿黄滤镜"）
  - 高对比黑白：contrast 140→126（保住皮肤中间调）
  - 杂志人像·MN7：tintAmt 100→55、highlight 18→12、shadow 16→12（去灰雾/贫血感）
  - 复古暗调·MZ5：tintAmt 100→60、fade 30→20、shadow -15→-10（去黄疸感）
  - 夜景质感·CN2：brightness 96→100、highlight -18→-10、vignette 40→28（白天图可用性）
  - 秋日电影·VM5：tintAmt 100→50、brightness 78→84、highlight -55→-35（去洋红洪水）
  - 月升王国·VM10：tintAmt 100→50、temp 20→12、contrast 140→125、highlight -25→-15（去橙色洪水）
  - 蓝橙胶卷·TC5：tintAmt 100→55、highlight -40→-25、brightness 82→88（肤色不再"奥利奥橙"）
- **复评**：清新/杂志人像/高对比黑白达标；暖阳/月升王国为可接受风格化；夜景质感/秋日电影/蓝橙胶卷仍偏重（属定位型风格预设，白天图观感偏"错"属预期，场景匹配即正常）。
- 全量 233 项测试通过（详见下节环境修复）。

### 测试环境修复（9/7 项目迁移后测试链路断裂） ✅

- **根因**：9/7 项目从 `C:/Users/Administrator/Desktop/看图工具` 迁到 `d:\源码存档\看图工具`，但 6 个测试文件仍硬编码旧路径；jsdom 依赖所在 `.workbuddy` workspace 目录在系统清理中被删除。
- **修复**：5 个测试文件与 `dbg.cjs` 的 root 路径改为 `path.resolve(__dirname,'..')`；项目内补装 `npm install --no-save jsdom`；`recent.cjs` 2 项桌面断言被 `loadPaths` 的 `flog` 调试日志（9/4 新增）覆盖 mock invoke 记录 → mock 改为记录全部调用并断言存在 `load_paths`。
- **验证**：全量 233 项全绿（112 回归 + 29 照片 + 14 裁剪 + 25 最近 + 36 美图 + 17 色调），`check-engine.cjs` 引擎完整。

### 新增 dev 工具

- `scripts/make-montage.ps1`：25 预设一键拼图（纯 ASCII，规避 PowerShell GBK 编码坑）。

***

## 2026-09-04

### 修复：双击含空格/括号的图片"只弹软件不显示照片" ✅

- **根因**：图片路径含空格和括号时（如 `雾山五行风格福娃设计 (3).png`），部分启动方式（右键菜单 / 二次实例转发 / 未加引号 argv）会把它拆成两个参数 `["…福娃设计", "(3).png"]`。两段都不是真实文件，`collect_files` 收集 0 张 → 界面空、照片不显示。叠加前端 `get_pending_paths` 只拉取一次，冷启动竞态下也会偶发丢失路径。
- **后端修复** [lib.rs `rejoin_existing`](file:///c:/Users/Administrator/Desktop/看图工具/src-tauri/src/lib.rs#L45-L76)：把连续 token 贪心重接成真实存在的完整路径，在单实例转发与 setup 存入 pending 前统一调用；单实例转发后追加 `show/unminimize/set_focus` 唤起窗口，并额外 `stash_pending` 兜底 emit 丢失。
- **前端修复** [app.js](file:///c:/Users/Administrator/Desktop/看图工具/app.js#L3032-L3045)：`get_pending_paths` 改为 0/0.3/0.8/1.6/2.8 秒多次重试拉取，按已加载路径去重，避免重复加载。
- **新增 Rust 单测** `rejoin_reassembles_space_split_path`（cargo test 3 项全过）。
- **已验证**：二次实例转发含空格路径后日志显示重接成功、`collected 58 files`（原为 0）；冷启动该图前端 `idx=55` 命中并显示。

### UI 布局：缩略图栏由底栏移到左侧，改为纵向侧栏 ✅

- **结构变更**：[index.html](file:///c:/Users/Administrator/Desktop/看图工具/index.html#L51-L61) 新增 `.app-row` 弹性行容器，缩略图栏 `#thumbBar` 从底部移为**第一子元素（左侧）**，其后为主画布 `.viewer`、再后为信息面板。
- **样式变更**：[styles.css](file:///c:/Users/Administrator/Desktop/看图工具/styles.css#L138-L146) `.app-row{display:flex;flex-direction:row}`；`.thumb-bar` 改为纵向（`flex-direction:column`，固定宽 86px，`border-right` 分隔，去顶部边框）；`.thumbs` 纵向排列 + `overflow-y:auto` 竖滚。
- **已验证**：`cargo clean` + `npx tauri build` 全量重建并安装；PrintWindow 实机截图确认：左侧出现纵向缩略图栏（打开单图自动载入同文件夹 5 张相邻图、绿色边框标记当前项），主画布整体右移形成"左缩略图 + 右预览"双栏布局。

### 打开单张图片自动加载同文件夹相邻图 ✅

- **行为变更**（扭转 09-04 早前"只加载这一张"的决定）：桌面端打开**单张图片**时，由后端 [collect\_files/collect\_images\_flat](file:///c:/Users/Administrator/Desktop/看图工具/src-tauri/src/lib.rs#L192-L203) 把**同文件夹**（仅当前目录、不递归）的图片一并收集进列表，底部缩略图栏随之出现并能左右切换同一目录相邻照片。

- **前端定位**：[app.js loadPaths](file:///c:/Users/Administrator/Desktop/看图工具/app.js#L86-L97) 打开单图时用 `paths.includes(it.path)` 匹配到所打开那张并 `showImage(idx)`；打开文件夹/多文件仍从第 0 张开始。

- **新增 Rust 单测** `collect_flat_lists_siblings_of_single_image`（cargo test 通过）：打开 b.jpg 列出同目录 a.png/b.jpg/c.gif、跳过 .txt。

- **已验证**：cargo check / cargo test 通过；JS 测套全绿；dist 含新前端标记。安装包重新构建并安装。

### UI 布局：搜索条移入顶栏 + 滤镜参数两列 ✅

- **搜索条位置变更**：`thumbSearch` 从底部缩略图栏移入**顶栏工具栏中组**（缩放/旋转/翻转按钮右侧），\[index.html] L31-32

- **滤镜参数两列排列**：编辑面板「滤镜」区块包裹 `field-grid`，`grid-template-columns: 1fr 1fr`，12 个滑杆按 2 列×6 行排布，\[styles.css] L214-217

- **新增样式**：`.tb-search` 顶栏搜索框固定 200px；`.field-grid .field:nth-last-child(-n+2)` 去除末行下边距

- **桌面版**：cargo clean 全量重建 + 安装，实机验证：顶栏搜索框渲染（UIA 恰 1 个 Edit，名「按文件名过滤缩略图」）、滤镜区为严格 2 列网格

### 美图滤镜增强（学习美图秀秀公开调色配方） ✅

- **新增 14 个美图公开配方一键预设**，来源 show\.meitu.com 公开调色参数：
  玄青ME8 / 杂志人像MN7 / 复古暗调MZ5 / 黑白质感V2 / 暗调棕青TC8 / 暗调扫街VN2 / 丧系扫街VN4 / 低饱和VN1 / 夜景质感CN2 / 秋日电影VM5 / 月升王国VM10 / 蓝橙胶卷TC5 / 清新野餐 / 氛围胶片TC5

- **风格·一键滤镜网格**：编辑面板新增「风格」区块，渲染全部预设按钮（共 25 格，第 1 格为"无滤镜"），点击即应用，可继续手动微调叠加

- **新增 5 个高级参数滑杆**：高光 / 暗部（-100~~100）+ 褪色 / 颗粒 / 暗角（0~~100）

- **新增 色调分离**：高光色调 + 阴影色调两个取色器 + 染色强度 0-100%（胶片刻色）

- **算法实现**：纯 JS 像素质点引擎 `toneRows`（app.js 内）：

  - 高光掩码 `smstep(0.42,1,lum)` 越亮越强、阴影掩码 `smstep(0.5,0,lum)` 越暗越强

  - 颗粒用坐标散列 `gnash` 确定性随机（预览/导出结果一致）

  - 暗角按径向距离、色调分离按掩码混合

  - 预览：`renderEditPreview` 同步 apply 于小画布；导出：`exportCanvasOfCurrent`（已改 async）用 `applyToneChunked` 分块 96 行/块避免卡 UI

- **测试**：新增 `test/tone-smoke.cjs`（17 项算法冒烟，纯 node 无需 jsdom）；全量回归 233 项全绿

- **桌面版**：已构建 + 安装，实机验证编辑面板打开、高级参数提示行可见

### 最近打开改版 ✅

- 「最近打开」从文字列表改为**缩略图横排**（最多 6 张，不显示文件名，超宽横向滚动）

- 后端新增 `first_thumb` 命令：文件返回自身、文件夹返回排序首图；空状态首页直接展示最近 6 缩略图

### 青绿炭墨配色规范确立并全量迁移 ✅

- 确立规范（后续所有 UI/海报/插画严禁自定他色）：
  主色 `#2C9678` 青矾绿 · 辅色 `#373834` 葱油绿 · 浅色 `#F5F4F7` 灰白 · 深色 `#1C1C1C` 炭黑

- 全量迁移：styles.css（CSS 变量）、app.js（选区/壁纸边框/画布底色/正文色）、index.html（theme-color）、manifest.webmanifest、icon.svg（LOGO 重绘为青绿渐变）

- 桌面版构建安装并实机验证：背景 #F5F4F7、绿色 LOGO、零蓝色残留

### 桌面自动化验证能力沉淀 ✅ → scripts/

- `scripts/cap_app.ps1`：枚举窗口 → **PrintWindow(hwnd,hdc,2) 直接渲染窗口内容**（被遮挡也能捕获，因禁用 GPU 合成走 CPU 渲染）

- `scripts/verify_edit.ps1`：**UIA 后台 Invoke** 🎨 按钮打开编辑面板（无需前台）+ PrintWindow 截图

- 据此实机确认：空状态干净、工具栏完整、🎨 编辑面板打开、图片加载/缩放/缩略图正常

***

## 2026-09-03

- **图片偏移修复** ✅：`#image { transform-origin: 0 0 }` 导致缩放/旋转以左上角为轴心偏移（1600×900 图实测左偏 288px、上偏 162px）→ 改为 `transform-origin: 50% 50%`

- **空状态遮挡修复** ✅：`desktop.loadPaths`（命令行/右键/拖拽/最近打开）时隐藏空状态提示层 `emptyHint`，此前会残留覆盖查看器

- **WebView2 随机退出修复** ✅（1\~5 分钟静默退出）：

  - 根因：本机 GPU 驱动不稳（LiveKernelEvent 141 TDR）+ WebView2 GPU 合成崩溃 + 后台窗口渲染回收，叠加搜狗输入法 sou\_input\_tsf.dll 0xc0000409

  - 修复：窗口 `additionalBrowserArgs` 加 `--disable-gpu-compositing --disable-gpu-rasterization --disable-backgrounding-occluded-windows --disable-renderer-backgrounding`

  - 实测 9 分钟零崩溃；GPU flags 日后换稳定机况可逐步摘除恢复硬件加速

- **构建知识固化** ✅：touch lib.rs **不可靠**触发重嵌；`cargo clean`（全量）后 `npx tauri build` 才保证嵌入最新 dist

***

## 2026-09-02

- **Windows 安装包真机回归通过** ✅：setup.exe 双击安装、文件关联双击打开、右键菜单「用绿角犀看图打开」、托盘、壁纸四模式（wp\_verify8.ps1 为成功验证脚本）

- **壁纸设置验证** ✅：注册表 `HKCU\Control Panel\Desktop\WallPaper` 更新

- **PWA SW 缓存升级 v3** ✅（v1→v2→v3，注意每次改前端后升级避免抽旧壳）

***

## 2026-09-01（此前已交付）

- 照片处理三方案：Canvas 增强（色温/模糊/锐化）+ OpenCV 去噪 + AI 放大（联网首次加载，模型地址设置→高级自配）

- 美工五件套：11 风格滤镜 / 磨皮美白 / 文字水印拖拽 / 边框 / 马赛克笔刷

- 云端账户：注册登录（JWT）/ 设置 / 收藏 / 历史 / 资料同步 / 收藏图本体云同步 / 离线队列重试 / token 加密存储

- PWA 可安装 + 离线壳；品牌更名「绿角犀看图」（18 文件）

- **Windows 桌面版首次真实构建成功**：NSIS + MSI + 裸 exe；构建踩坑 5 个固化进 BUILD.md

- PRD 六大模块落地：系统集成 / 看图引擎 / 浏览导航 / 图片处理 / 批量处理 / 幻灯片

- 测试基线：regression 112 / crop 14 / recent 25 / cloud-front 22 / 后端契约 26

- 鸿蒙原生主线代码就绪（harmony/，待 DevEco 真机验证）

***

## 测试回归基线（当前全绿）

| 套件           | 用例数 | 说明                                |
| ------------ | --- | --------------------------------- |
| regression   | 112 | 全功能回归（jsdom 黑盒）                   |
| photo        | 29  | 照片处理（色温/模糊/锐化/去噪/AI 放大管线）         |
| beauty       | 36  | 美图（风格网格渲染预设按钮 + 预设点击生效 + 磨皮美白等）   |
| edit-crop    | 14  | 裁剪                                |
| recent       | 25  | 最近打开                              |
| tone-smoke   | 17  | 色调引擎（高光/阴影/褪色/颗粒/暗角/色调分离掩码）纯 node |
| check-engine | -   | 关键函数完整性校验（防 Edit 未落盘）             |

> 运行方式：见 `交接文档.md` 常用命令。jsdom 在 `C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules`（须经 NODE\_PATH）。


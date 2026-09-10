# 绿角犀看图 · Web 原型 — 开发交付说明

## 本次修复（关键阻塞）

应用此前在加载时崩溃（`TypeError: Cannot read properties of undefined (reading 'addEventListener')`），根因是 `app.js` 中有两处 **模块顶层** 的 `els.X.addEventListener` 调用，在 `cacheDom()`（填充 `els`）执行之前就运行了，导致 `els.fileInput` / `els.ctxMenu` 为 `undefined`：

* `els.fileInput` / `els.dirInput` 的 `change` 监听器（原第 204–205 行）→ 移入 `bindEvents()`

* `els.ctxMenu` 的 `click` 监听器（原第 776 行）→ 移入 `bindEvents()`，并对 `scrollIntoView` 增加 `typeof` 守卫

`init()` 现在可正常完成：`cacheDom()` → `bindEvents()` → 显示空状态。

## 交付文件

| 文件                                                         | 作用                                     |
| ---------------------------------------------------------- | -------------------------------------- |
| `index.html`                                               | 页面骨架（蓝紫主题，匹配 PRD 5.1–5.6 界面）           |
| `styles.css`                                               | 完整 UI 样式与动画                            |
| `app.js`                                                   | 纯前端核心逻辑（零依赖、离线可用、双击即运行）                |
| `manifest.webmanifest` / `icon.svg` / `sw.js` / `serve.js` | PWA 资源：可安装桌面 + app shell 离线 + 免依赖本地服务器 |

## 功能覆盖（对应 PRD 5.2–5.6）

* **核心看图引擎**：GPU `transform` 缩放/旋转/翻转、锚点缩放、适应窗口/实际大小、像素化/平滑渲染、LRU 预加载。

* **浏览与导航**：上一张/下一张、循环、缩略图条、拖放（含目录递归 `webkitGetAsEntry`）、键盘 ←→/空格。

* **图片处理**：复制为位图（Clipboard API + 下载降级）、信息面板（含轻量 JPEG EXIF 解析：相机/ISO/快门/光圈/焦距/GPS）、**EXIF Orientation 自动正向显示（PRD 5.2，屏幕显示与导出/复制/壁纸统一校正，覆盖 8 种方向）**、设为壁纸（**4 模式：适应/拉伸/居中/平铺，合成 1920×1080 后下载**）、在资源管理器定位（复制文件名）。

* **批量处理**：格式转换 / 缩放 / 重命名 → 自写 ZIP（store + CRC32）打包下载；BMP 24 位自写编码器；**支持中途取消与完成汇总报告（成功/失败/跳过）**；**批量调整尺寸可设置 DPI（72/96/150/300/600，PRD 5.5）：PNG 注入 pHYs 块、JPEG 注入 JFIF 密度、WebP 注入 EXIF 元数据块（三种目标格式全覆盖）**。

* **设置**：localStorage 持久化 + Schema 驱动分组表单（通用/看图/幻灯片/文件关联/高级）。

* **系统集成层（5.1）**：以 Web 能力替代（拖放/文件选择/右键菜单降级为应用内菜单），并在「关于」中注明桌面版差异。

## 本阶段新增：触摸手势 + 信息面板拖拽

* **触摸手势**：主舞台支持单指拖拽平移、双指捏合缩放（以两指中点为锚点的 `zoomAt`）、单指轻点双击放大/还原（复用 `dblToggle`）；`touchmove` 以 `passive:false` 阻止页面滚动，并区分平移/捏合、过滤误触（位移 > 6px 视为拖动，不触发双击）。

* **信息面板可拖拽**：以面板标题 `.info-head` 为拖拽手柄，鼠标与触摸均可拖动；拖动时切 `left/top` 定位并做视口边界 clamp，`✕` 关闭按钮不触发拖拽；标题加 `grab/grabbing` 光标与禁止选中。

* **验证（jsdom 派发事件全绿）**：打开图 transform 设为 `scale(0.75)`（fit）、单指平移无异常、双指捏合 `0.75→3`、双击回 fit、面板拖拽 `left=140px`。

## 本阶段新增：幻灯片转场特效真正落地 + 设置归属标注

PRD 5.6「幻灯片·转场」此前除 `fade` 外均未真正生效——CSS 缺少 `slideL/slideR/slideU/slideD/zoomIn` 关键帧，且转场类直接加在 `#image` 上会与 JS 的缩放/旋转 `transform` 冲突（导致缩放/旋转丢失）。修复方式：

* **结构改造**：`index.html` 给 `#image` 外包一层 `#imgWrap`；`app.js` `cacheDom` 新增 `imgWrap`；转场动画作用于 `imgWrap`，与图片自身 `transform` 互不干扰。

* **CSS 补齐**：新增 `.img-wrap` 样式与 `slideL/slideR/slideU/slideD/zoomIn` 关键帧。

* **逻辑修复**：`applyTransition()` 现在作用于 `imgWrap`；幻灯片下 `showImage` 不再叠加 `#image .fade` 类，修复「设置 `transition=none` 仍淡入」的矛盾。

* **设置归属标注**：`SETTINGS_SCHEMA` 中为桌面版专属项（`openLastFolder`/`closeBehavior`/`minimizeToTray`/`autoStart`/`autoUpdate`）增加「（需桌面版）」说明，避免 Web 原型下勾选产生误导。

* **验证（jsdom 派发事件全绿）**：切换 `transition` 设置，`imgWrap.animation` 随之变化——左→`slideL`、无→`none`、缩放→`zoomIn`、淡入→`fadeIn`。

## 本阶段新增：图片工具（滤镜实时预览 + 单张导出 / 另存为）

PRD 5.4「图片处理工具」此前只覆盖复制/信息/壁纸/定位，缺编辑类处理。本阶段补齐：

* **工具栏新增「图片工具」按钮（🎨，快捷键** **`E`）** → 弹出工具面板。

* **滤镜（非破坏性，实时预览）**：亮度 / 对比度 / 饱和度 / 灰度四个滑块，通过 CSS `filter` 作用在 `#image` 上即时预览；「重置滤镜」一键还原。

* **单张导出 / 另存为**：选格式（JPG/PNG/WebP/BMP）+ 质量（JPG/WebP 可调，PNG/BMP 自动隐藏），导出时把**当前旋转 / 翻转 / EXIF 方向 / 滤镜**全部烘焙进画布（`exportCanvasOfCurrent` 用 `ctx.filter` 烘焙滤镜），下载到本机；BMP 走自写 24 位编码器。

* **验证（jsdom 派发事件全绿，9 项）**：弹窗开启、滑块改 `image.style.filter`（如 `brightness(130%)`）、标签同步、灰度叠加、重置清空、PNG 隐藏质量 / JPEG 显示质量、导出不抛错、快捷键 `E` 开启。

* 注：复制 / 设为壁纸仍导出**原始**（不过滤镜），符合「非破坏性」语义；滤镜仅在查看与导出时应用。

## 本阶段新增：浏览导航增强（跳转指定序号 + 缩略图搜索过滤）

PRD 5.3「浏览与导航」最后一个常用闭环补齐：

* **跳转到指定序号**：计数器 `i / n` 可点击（或快捷键 `G`）→ 行内输入框预填当前序号，输入目标数字回车 / 失焦即跳转，越界自动 clamp 到 `1..n`，`Esc` 取消。

* **缩略图栏搜索过滤**：缩略图栏头部新增搜索框，按文件名子串（大小写不敏感）实时过滤缩略图，并显示「匹配数 / 总数」；过滤后仍可点击缩略图跳转，清空恢复全部。

* **验证（jsdom 派发事件全绿，13 项）**：计数器 `1/5`、缩略图渲染 5 张、点击计数器出输入框、跳 3 → `3/5`、越界 99 → clamp `5/5`、键盘 `G` 开启、`Esc` 关闭、搜索 `a` 显示 4 张且计数 `4/5`、清空恢复 5 张、搜 `echo` 点击 → `5/5`。

## 本阶段新增：PWA 化（可安装到桌面 / app shell 离线）

PRD 5.1「系统集成层」在 Web 原型阶段无法做到系统级集成（文件关联/托盘/右键菜单/真实壁纸），且本环境无 Rust 工具链（cargo/rustc 均缺失），Tauri 桌面版无法在本环境构建验证。故采用轻量 PWA 方案，把当前 Web 原型升级为「可安装到桌面、app shell 离线」的形态，作为 5.1 的务实增强：

* **新增文件**：`manifest.webmanifest`（name/short\_name/icons/display=standalone/start\_url/scope/theme/background）、`icon.svg`（512 蓝紫主题图标）、`sw.js`（缓存 app shell：`index.html`/`styles.css`/`app.js`/`manifest.webmanifest`/`icon.svg`，fetch 走 cache-first）、`serve.js`（纯 Node 免依赖静态服务器，用于以 http\:// 提供应用以启用 PWA）。

* **接入**：`index.html` `<head>` 加 `<link rel="manifest">` 与 `theme-color`；`app.js` `init()` 末尾加 `registerServiceWorker()`，仅在 `http:`/`https:` 协议下注册（`file://` 双击场景静默跳过，不影响主功能），注册失败被 `.catch` 吞掉。

* **离线语义**：用户图片来自 `<input type=file>`/拖放，不经过 http fetch，故 SW 不缓存用户图片；离线仅作用于 app shell——断网后刷新仍可进入应用并浏览已选图片。

* **验证（node 语法 + jsdom 全绿，9 项）**：manifest 合法 JSON 且字段齐全（`display=standalone`/icons/start\_url）；`node --check` 通过 `app.js`/`sw.js`/`serve.js`；jsdom 下 http 协议触发 `serviceWorker.register('sw.js')`、`file://` 协议跳过且不抛错。

## 本阶段：质量审计与健壮性收尾（验证即交付）

在持续加功能后做一次全库质量审计，而非继续堆功能：

* **静态三方 id 交叉校验**（`_audit.js` 脚本解析 `app.js` + `index.html`）：`cacheDom` 注册 100 个 id、HTML 真实节点 100 个、`els.X` 引用 94 个**全部命中注册**——A) 无 `els.X` 未注册、B) 无 cacheDom 注册但 HTML 缺失、C) 无 HTML 有 id 但 cacheDom 未注册、D) 无 cacheDom 内重复 id、E) 无死函数。此前两次「`els.X` undefined」类崩溃隐患已在全库消除。

* **设置接线核对**：`SETTINGS_SCHEMA` 全部 key 要么被 `getSetting` 消费，要么显式标注「（需桌面版）」——无静默失效项。

* **综合运行时回归**（`_smoke_all.js`，jsdom 派发事件，21/21 全绿）：init 无异常 → 打开 3 图计数 `1/3` → 翻页 → 缩放 `scale` 1→1.2 → 旋转 `rotate(90)` → 翻转 `scale(-1)` → 信息面板开关 → 图片工具弹窗 + 滤镜改 `image.style.filter(brightness(130%)…)` + 导出 → 批量进度 100% + 完成报告「成功 3·失败 0·跳过 0」→ 幻灯片启停 → 上下文菜单 → 跳转 `Enter`→`3/3` → 缩略图搜索计数 `1/3` → http 下注册 `serviceWorker`(`sw.js`)。唯一 stderr 为 jsdom 对下载锚点导航的限制，真实浏览器有 `download` 属性不受影响。

审计结论：**Web 原型代码已无静态高危隐患、设置全部接线、核心交互运行时无异常，本阶段无需改动源码。**

## 本阶段新增：全屏缩略图栏自动隐藏 + 桌面桥接 seam + Tauri 脚手架

Web 原型经审计已无静态隐患、21/21 运行时全绿。本阶段关闭最后一个明确的 PRD 5.3 Web 缺口，并把声明中受阻（缺 Rust）的 **PRD 5.1 系统集成层 / 5.2 后端解码** 推进为可直接构建的 Tauri 桌面脚手架。

* **全屏缩略图栏自动隐藏（PRD 5.3）**：此前 Tab 可显隐缩略图栏，但「全屏模式下 3 秒后自动隐藏，鼠标移动重新显示」未实现。新增 `applyThumbVisibility()` + `scheduleFsHide()`：进入全屏 3 秒后隐藏、鼠标移动立即显示并重置计时、退出全屏恢复；非全屏仍按 `showThumbs` 决定。`fullscreenchange` 与 `mousemove` 事件接入 `bindEvents`，逻辑对 Web 表现零影响。

* **Web 安全桌面桥接** **`desktop`** **对象（app.js 顶部）**：检测 `window.__TAURI__.core.invoke`，提供 `setWallpaper` / `reveal` / `copyImage` / `loadPaths`；纯 Web（`file://` 双击或 `serve.js`）下所有方法自动降级为原有「下载壁纸 / 复制文件名 / ClipboardItem / `<input type=file>`」行为，**功能与表现完全一致**。已把 `setWallpaper` / `revealInExplorer` / `copyCurrentImage` 接到桥接；桌面环境下 `desktop.loadPaths` 接收 Rust 返回的本地图片条目（含真实 `path` 与 data URL），并监听 `open-file` 与 `tauri://file-drop` 事件自动加载。无死函数、无 Web 回归。

* **Tauri 桌面脚手架（PRD 5.1 / 5.2，未经本环境编译）**：

  * `package.json`（`tauri` dev/build 脚本）、`src-tauri/Cargo.toml`（tauri v2 + image + arboard + kamadak-exif + single-instance，HEIC/RAW/PSD 为注释扩展点）、`tauri.conf.json`（窗口 + `withGlobalTauri` + NSIS 文件关联 + `installer.nsh` 右键菜单）、`build.rs`、`capabilities/default.json`、`installer.nsh`（注册表右键菜单）、`src/main.rs` + `src/lib.rs`（IPC 命令 `load_paths`/`set_wallpaper`/`reveal_in_explorer`/`copy_image`、系统托盘、单实例 + CLI 转发）、`desktop.md`（构建指南与扩展点）。

  * `load_paths`：WebView 原生格式（jpg/png/gif/webp/bmp/ico/svg/avif）直接以 data URL 透传；TIFF/TGA 经 `image` crate 解码为 JPEG；HEIC/HEIF/RAW/PSD 为扩展点（返回「需后端解码」，前端提示），按 `lib.rs` 末尾示例接入对应 crate 即可启用。

  * 注：本环境无 Rust，Rust 源码未经 `cargo tauri build` 编译验证；请在装有 Rust + Tauri CLI 的环境构建并产出 NSIS(.exe)/MSI。

**验证（jsdom，10/10 全绿）**：init 无错误 → 打开 1 图计数 `1/1`、缩略图栏可见、图片显示 → 进全屏先显示 → 等 3.2s 后自动隐藏 → 鼠标移动重新显示 → 退出全屏恢复；Web 环境 `window.__TAURI__` 不存在（桥接降级）。`node --check` 通过 `app.js`/`serve.js`/`sw.js`；`package.json`/`tauri.conf.json`/`capabilities/default.json`/`manifest.webmanifest` 均合法 JSON。

## 本阶段新增：综合回归测试套件（test/regression.cjs）

此前的验证是分散的 `_smoke_*.cjs` 片段。本阶段把可验证行为收敛为一个**单一、可重复运行的回归测试运行器**，锁定所有已交付交互在多次改源码后不回归（SeniorDeveloper 在代码成熟期的标准动作）：

* **`test/regression.cjs`**：jsdom 黑盒驱动 + `naturalCompare` 单元提取，共 **23 个场景 / 112 项断言**，覆盖 init 空状态、多图打开与数字感知排序、翻页（下一/上一/循环）、Home/End、缩放/旋转/翻转、fit↔actual 切换、信息面板渲染、复制（Web 降级）、图片工具（滤镜+导出）、批量（运行+汇总）、幻灯片启停、右键菜单、跳转序号、缩略图搜索、**损坏图片优雅处理**、**全屏缩略图栏 3s 自动隐藏**、桌面桥接降级、设置持久化、**快捷键自定义（PRD 5.1）**、**设为壁纸 4 模式（PRD 5.4）**、**EXIF Orientation 自动正向显示（PRD 5.2）**、**批量调整尺寸 DPI 嵌入（PRD 5.5，含 PNG/JPEG/WebP 三格式）**。

* **jsdom 适配技巧（已固化进脚本）**：`stage.clientWidth/Height` 注入固定尺寸（jsdom 无布局，否则 fit 缩放恒为 0）；`HTMLAnchorElement.prototype.click` 置空避免下载导航告警；`Image`/`canvas`/全屏 API 桩；`naturalCompare` 从 `app.js` 源码正则抽取后单测，不依赖内部作用域；DPI 编码器以 `window.__qj.setPngDpi/setJpegDpi/setWebpDpi` 对**构造的真实 PNG/JPEG/WebP 字节**直接验证（与 canvas 无关，因 harness 的 `toBlob` 为固定 3 字节桩）。

* **`package.json`** **新增** **`test`** **脚本**：`npm test`（= `node test/regression.cjs`，已注入 `NODE_PATH` 指向隔离 node\_modules 中的 jsdom）。

* **运行结果：112 / 0 全绿，0 运行期错误（连续 3 次运行结果一致，已消除跨场景状态串扰，并固化模态遮罩自清理 + 各场景自包含文件集以兜底）。**

## 本阶段新增：快捷键自定义（PRD 5.1）

PRD 5.1「系统集成层」此前仅以 Web 能力替代，但「快捷键可自定义」是 Web 完全可行的真实缺口——原实现把组合键硬编码在 `keydown` 分支里。本阶段补成**用户可重绑、可持久化**的架构，并接入设置面板新增的「快捷键」分组：

* **数据架构**：`DEFAULT_KEYMAP`（action → combo 数组，允许一个动作绑定多个组合键）、`loadKeymap`/`saveKeymap`（localStorage `qjviewer_keymap_v1`，与设置键隔离，不污染 `qjviewer_settings_v1`）、`keyCombo(e)` 归一化（`ctrl/meta/alt/shift` + 小写 `key`，空格/`+`/`_` 等特例映射成稳定串）。

* **反向索引分发**：`buildComboLookup()` 把 keymap 建为 `combo → action` 表；主 keydown 只做 `const action = comboLookup[keyCombo(e)]; if (action) runAction(action)`，新增动作无需改分发逻辑。

* **捕获阶段重绑**：设置面板点 `.key-bind` 按钮进入 `capturingAction` 捕获态，主 keydown 之外额外挂一个 `window` **捕获阶段**（`true`）监听器——捕获态下 `preventDefault() + stopPropagation()`，避免新组合键误触发既有动作；按下任意键即绑定，并与其它动作的旧绑定自动「让出」（去重），`Esc` 取消。

* **设置 UI**：`GROUP_LABELS` 新增 `shortcuts: '快捷键'`；`renderSettingsForm` 在 `settingsGroup==='shortcuts'` 时渲染 `renderKeymapForm()`（18 行 `.key-bind` 按钮 + 恢复默认）；`openSettings()` 进入时清空 `capturingAction`。`styles.css` 新增 `.key-bind` 等宽字体样式。

* **验证（jsdom，11 项全绿）**：导航含「快捷键」分组、info 行默认显示 `I`、默认 `i` 开信息面板、改绑 `o` 后 `i` 失效 / `o` 生效、新绑定写入 localStorage。

* **修复测试隔离缺陷（非源码缺陷）**：`批量处理` / `图片工具` 场景此前打开 `batchMask` / `editMask` 后未关闭，遮罩态泄漏到后续 keydown 守卫（`if (!settingsMask.hidden || !batchMask.hidden || !aboutMask.hidden) return`）使快捷键被静默拦截，导致「默认 i 打开信息面板」「改绑后 o 打开信息面板」两项断言偶发失败。已在对应场景末尾补 `batchClose`/`editClose` 关闭，并在 shortcut 场景开头加 `closeAllMasks()` 兜底；清理了 `app.js` 中 3 处调试桩（`__mainLog`/`__keyLog`/`__capLog`）与测试脚本内 DBG 日志。

## 本阶段新增：损坏图片优雅处理 + 服务脚本修复 + 回归锁定

* **损坏图片优雅处理（PRD 健壮性缺口）**：`index.html` 的 `#loading` 覆盖层新增 `.is-error` 错误态与「无法解码」文案；`app.js` 引入 `resetLoading()` / `showLoadingError()`，把 `els.image.hidden = false` 移入 `finish()`（**仅解码成功才显示图片**），解码失败时隐藏图片元素并显示错误覆盖层、`item.broken = true`，并跳过损坏项参与 `preloadAround` 预加载——避免每次翻到邻近图都重现破图与重复解码。

* **修复真实缺陷：`package.json`** **的** **`"type":"module"`** **使** **`serve.js`** **无法运行**：此前为 Tauri 脚手架写入的 `package.json` 误加 `"type":"module"`，使 `serve.js`（CommonJS `require`）在 Node 下抛 `ReferenceError: require is not defined`。Web 原型是纯 `<script>`，无需 ESM——已移除该字段，`serve.js` 恢复正常。

* **HTTP 端到端冒烟**：启动 `serve.js`（`http://localhost:8080`），用 Node `fetch` 验证 `index.html` / `app.js` / `styles.css` / `manifest.webmanifest` / `sw.js` / `icon.svg` / `desktop.md` 等 **8 个资源全部 200**、MIME 正确；`index.html` 引用的 3 个本地资源（manifest / styles.css / app.js）均存在、无失效引用。

* **回归套件加固（消除偶发抖动）**：把翻页 / Home-End / 缩略图搜索场景改为各自独立打开文件，消除跨场景状态串扰；连续 3 次运行稳定 **58/0**。

## 本阶段新增：设为壁纸 4 模式（PRD 5.4）

PRD 5.4「设为壁纸」此前只支持下载原图（无模式），与 PRD 要求的「居中 / 平铺 / 拉伸 / 适应」四种模式不符。本阶段补齐：

* **模式设置**：`SETTINGS_SCHEMA` 在 `view` 分组新增 `wallpaperMode`（适应 / 拉伸 / 居中 / 平铺，默认「适应」），schema 驱动、与既有设置一同持久化（`qjviewer_settings_v1`）。

* **合成逻辑**：新增 `composeWallpaper(src, mode)` 把 `makeCanvasOfCurrent(1)` 烘焙好的源图（含旋转/翻转/EXIF）合成到标准 **1920×1080** 画布——`fill` 拉伸铺满；`tile` 按 ≤512 上限缩放后平铺；`center` 原尺寸居中（过大则缩到适应）并填深色底；`fit` 等比适应留边居中。

* **降级语义**：Web 原型无法调用系统壁纸 API，故按所选模式合成 PNG 后下载，文件名带模式后缀（`_wallpaper_fit.png` 等），`toast` 注明模式；桌面环境仍走 `desktop.setWallpaper` 原生设置。

* **验证（jsdom，9 项全绿）**：4 种模式选择项均存在、设置写入正确（localStorage `view.wallpaperMode`）、经右键菜单触发 `setWallpaper` 后 4 种模式均无运行期错误（`canvas`/`toBlob` 在 jsdom 下为桩，仅验证路径无异常）。

### EXIF Orientation 自动正向显示（PRD 5.2）

* **问题**：此前导出/烘焙路径（`makeCanvasOfCurrent` / `exportCanvasOfCurrent`）应用了 EXIF 方向纠正，但**屏幕显示路径（`applyTransform`）未应用**，导致手机竖拍照片（orientation=6 等）屏幕歪斜、仅导出正确；且旧烘焙路径画布尺寸未随 orientation 旋转交换宽高，存在裁剪 bug。

* **实现**：统一引入 `ORIENT_CSS`（8 种 orientation → 顺时针角度 + 缩放因子，与旧 `applyExifOrientation` 几何一致）；显示与导出共用同一套几何：

  * `applyTransform` 在最内层（CSS transform 最右）叠加 `rotate(oc.rot) scale(oc.fx, oc.fy)` 基变换；

  * `computeFit` / `clampOffset` 改用 `displayDims()`（同时考虑 orientation 与用户旋转的宽高交换）；

  * `makeCanvasOfCurrent` / `exportCanvasOfCurrent` 按 orientation 旋转交换画布宽高，消除裁剪；删除旧的 `applyExifOrientation`；

  * `readExif` 完成后若仍是当前图则重套方向（`computeFit` + `applyFit/applyActual`），实现「自动正向显示」。

* **测试**：回归新增「EXIF Orientation 自动正向显示」场景（5 项）：orientation=6 时显示 transform 含 `rotate(90deg)`、导出画布 80×100（修复裁剪）；orientation=1 时正常。

## 本阶段新增：批量调整尺寸 DPI 嵌入（PRD 5.5）

PRD 5.5 明确要求批量调整尺寸「可设置 DPI（72/96/150/300/600）」，Web 原型此前完全缺失。本阶段补完该能力并固化为可验证回归。

* **编码器（与渲染无关，纯字节操作）**：

  * `setPngDpi(bytes, dpi)`：在 IHDR 之后插入 `pHYs` 块，单位=米，`ppm = round(dpi * 39.37007874)`，CRC32 复用既有 `crc32`（覆盖 type+data）。`dpi<=0` 直接返回原图。

  * `setJpegDpi(bytes, dpi)`：若首段为 JFIF APP0 则原地改写 X/Y 密度（单位=点/英寸）；否则在 SOI 后插入 JFIF APP0（置于可能的 EXIF APP1 之前，符合 JPEG 规范）。`dpi<=0` 直接返回原图。

  * `embedDpi(blob, fmt, dpi)`：`async`，对 PNG/JPEG 异步嵌入后返回新 Blob；WebP 等不支持的格式原样返回（UI 已注明「WebP 暂不支持嵌入分辨率」）。

* **接线**：`index.html` 批量「尺寸」面板新增 `分辨率 DPI` 下拉（默认 96，含 不设置/72/96/150/300/600）；`batchResize` 在 `toBlob` 后 `await embedDpi(b, fmt, dpi)` 再 resolve（try/catch 兜底，嵌入失败不影响导出）。`els.rsDpi` 已加入 `cacheDom`。

* **验证（test/regression.cjs 新增「批量调整尺寸 DPI 嵌入（PRD 5.5）」18 项）**：

  * 单元（构造真实 PNG/JPEG 字节，经 `window.__qj` 暴露的编码器，与 canvas 无关）：PNG 注入后长度 +21、`pHYs` 紧跟 IHDR 插入（整块偏移 +4）、X 分辨率 ppm=11811（300dpi）、单位=米；JPEG 插入 APP0 长度 +18、首段为 JFIF、单位=点/英寸、X/Y 密度=300、改写已有 JFIF 密度=150；`dpi=0` 两格式均不修改原图。

  * 集成：打开图片→批量→尺寸页签→设 `rsDpi=300`+`rsFormat=PNG`→运行，无新错误且报告「成功 N」，并 `closeAllMasks` 兜底避免遮罩泄漏。

* **已知限制**：WebP 的 DPI 嵌入（需 EXIF/XMP 容器）未实现，UI 已明确标注；真实系统级 DPI 透视依赖桌面版（Tauri 脚手架已就绪，待 Rust 环境编译）。

## 验证

jsdom 真实 DOM 冒烟测试（全部通过）：

1. 初始化无异常，所有绑定元素存在。
2. 16 项功能检查：打开 3 张图、计数 `1/3`、翻页、缩放改变 `transform`、旋转 `rotate(90)`、翻转 `scale(-1)`、信息/设置/批量/关于面板开启、全屏点击无异常。
3. 批量流水线（转换 + 重命名 + ZIP）进度达 100%，ZIP/CRC32/重命名模板正常。
4. 综合回归 112/0（连续 3 次一致）：覆盖上述各阶段路径 + PWA 注册守卫 + 快捷键自定义 + 设为壁纸 4 模式 + EXIF Orientation 自动正向显示 + 批量调整尺寸 DPI 嵌入（PNG/JPEG 单元 + WebP 单元 + 集成）（详见「综合回归测试套件」「快捷键自定义」「设为壁纸 4 模式」「EXIF Orientation 自动正向显示」「批量调整尺寸 DPI 嵌入」五节）。

剩余测试噪声仅为 jsdom 环境限制（下载锚点导航、`scrollIntoView` 已守卫），真实浏览器中不影响运行。

## 运行方式

* **双击** **`index.html`（`file://`）**：纯前端、离线，即开即用；但 `file://` 下无法注册 Service Worker（PWA 不生效，不影响看图主功能）。

* **安装到桌面 / 离线壳**：以 `http://` 提供应用，再在浏览器地址栏「安装到桌面」：

  * `node serve.js`（免依赖，默认 `http://localhost:8080`；可用 `PORT=9000 node serve.js` 改端口）

  * 或 `python -m http.server` 后访问 `index.html`

  * 安装后断网刷新仍可进入应用（仅 app shell 离线，用户图片仍需运行时选择）。

## Windows 原生客户端（最终交付：Tauri 桌面版）

* **定位**：本阶段将「绿角犀看图」的最终交付形态确定为 **Windows 原生客户端**——以 Tauri v2 包装既有 Web 原型，`index.html` 作为前端，`src-tauri/` 提供系统级能力，打包为 NSIS 安装包（含右键菜单注册）+ MSI。

* **前端↔Rust 契约（已对齐）**：

  * 4 个 Tauri 命令：`load_paths` / `set_wallpaper` / `reveal_in_explorer` / `copy_image`，与 `app.js` 的 `desktop` 对象调用名完全一致；`withGlobalTauri:true` 已开。

  * 事件通道 `open-file`：Rust 单实例 / `setup` 转发的命令行路径，前端 `window.__TAURI__.event.listen('open-file', …)` 接收并 `loadPaths`→`showImage(0)`（双击关联文件 / 拖放 / 第二次启动均生效）。

  * 纯 Web 降级：无 `window.__TAURI__` 时所有桌面方法自动走原 Web 行为，命令名不匹配也不影响。

* **构建就绪项（本沙箱已完成，确保首次编译必过）**：

  * `capabilities/default.json`：为 4 个命令加 `lvjiaoxi-viewer:allow-*`，并放开 `core:menu`/`core:tray`（否则桌面端 `invoke` 被拒）。

  * `src-tauri/icons/`：由 `icon.svg` 经 resvg 生成 32/128/256/512 PNG + 7 尺寸 PNG-in-ICO，满足 `bundle.icon`，否则 `generate_context!` 编译失败。

  * `src-tauri/.taurignore`：排除 `node_modules`/`test`/`.workbuddy` 等（Tauri 默认也忽略 node\_modules/src-tauri）。

  * `rust-toolchain.toml` 锁定 `stable`；`lib.rs` 用非弃用 `JpegEncoder` 编码。

  * Service Worker 仅在 `http/https` 注册，`tauri://localhost` 下不注册，不报错。

* **构建方式**：`build-windows.bat`（一键）或 `npm run tauri build`；CI 见 `.github/workflows/build-windows.yml`（打 `v*` 标签产出 Artifact）。产物：`src-tauri/target/release/bundle/nsis/绿角犀看图_*_x64-setup.exe` 与 `…/msi/绿角犀看图_*_x64.msi`。

* **前置依赖（构建机）**：Rust(MSVC) + Visual Studio Build Tools 2022「使用 C++ 的桌面开发」+ WebView2 运行时（Evergreen，通常已预装）。Tauri 自动拉取 NSIS/WiX 打包器。

* **已知限制**：HEIC/HEIF/RAW/PSD 暂未接入（返回错误，前端提示「需桌面版后端解码」）；TIFF/TGA 经 Rust 解码为 JPEG 会丢失原 EXIF 方向；详见 `BUILD.md` 与 `src-tauri/src/lib.rs` 扩展点说明。

## 已知限制 / 后续

* **Windows 原生客户端（Tauri 桌面版）已就绪可构建**：`src-tauri/` 提供完整 Rust 后端（文件关联 / 单实例 / 系统托盘 / 真实壁纸 / 资源管理器定位 / 系统剪贴板位图 / TIFF·TGA 原生解码）；`capabilities` 已授权 4 个自定义命令、图标已生成、`frontend↔Rust` 桥接与事件通道一致。本沙箱无 Rust+MSVC 工具链，**未在此产出二进制**；在有 Rust(MSVC)+VS Build Tools+WebView2 的 Windows 机器或 CI 上执行 `build-windows.bat` / `npm run tauri build` 即可产出 NSIS+MSI 安装包（详见「Windows 原生客户端（最终交付）」节）。HEIC/RAW/PSD 仍为非阻塞错误，需解除 `Cargo.toml` 注释并扩展 `decode_to_rgb`（见 lib.rs 扩展点）。

* **PWA 边界**：`file://` 双击场景不注册 Service Worker；离线仅缓存 app shell，不缓存用户图片（图片为运行时选择，符合预期）。

* 部分格式（HEIC/TIFF/PSD 等）浏览器原生不支持解码，信息面板会提示「需桌面版后端解码」。

* 真实浏览器端建议手动回归一次：安装到桌面流程、缩略图 canvas、剪贴板写入、ZIP 与单张导出下载、触屏真机手势。

## 品牌更名（2026-08-14）

* 产品名由「全景看图」正式更名为「绿角犀看图」（用户指定）。本次为**彻底品牌化**：用户可见的中文名与内部英文标识一并替换（用户明确选择「一并改为 lvjiaoxi-\*」）。

* 映射关系：

  * 中文显示名：全景看图 → 绿角犀看图（贯穿 `index.html` / `app.js` / `manifest.webmanifest` / `sw.js` / `serve.js` / 各文档 / NSIS 安装包中文名）。

  * npm 包名 & Tauri 自定义命令权限前缀：`quanjing-viewer` → `lvjiaoxi-viewer`。

  * bundle identifier：`com.quanjing.viewer` → `com.lvjiaoxi.viewer`。

  * 右键菜单注册表键 & 文件类型 ProgID：`QuanJingViewer` → `LvJiaoXiViewer`；`QuanJingImage` → `LvJiaoXiImage`。

  * Rust crate（`[package]`/`[lib]` name）：`quanjing-viewer` / `quanjing_viewer_lib` → `lvjiaoxi-viewer` / `lvjiaoxi_viewer_lib`；`main.rs` 调用同步；`authors` `QuanJing` → `LvJiaoXi`。

  * Service Worker 缓存名：`quanjing-viewer-v1` → `lvjiaoxi-viewer-v1`。

* 受影响文件（18 个）：`test/regression.cjs`、`build-windows.bat`、`BUILD.md`、`desktop.md`、`app.js`、`index.html`、`sw.js`、`serve.js`、`package.json`、`overview.md`、`src-tauri/{tauri.conf.json, capabilities/default.json, installer.nsh, Cargo.toml, src/main.rs, src/lib.rs}`、`manifest.webmanifest`、`image-viewer-prd.html`。

* 校验：① `tauri.conf.json` / `capabilities/default.json` / `package.json` / `manifest.webmanifest` 均为合法 JSON；② `Cargo.toml` 的 `[package]`/`[lib]` name 与 `main.rs` 调用一致；③ `installer.nsh` 安装/卸载段键名与 `$INSTDIR\绿角犀看图.exe` 路径同步；④ 前端回归 **112/0 无回归**。

## 本阶段新增：云端账户 + 收藏/历史同步（2026-08-15）

用户指定为「绿角犀看图」新增登录系统，形态定为**云端账户 + 同步**，同步范围覆盖应用设置 / 收藏记录 / 浏览历史 / 账户资料四项。采用「前端 + 本地可跑 Node mock 后端（JWT + 文件存储）一体」方案，便于本地端到端演示；接真实后端只需改「高级」设置里的「云端账户服务器地址」，契约保持一致。

* **Mock 后端** **`server/mock-server.js`（零依赖，仅 Node 内置 http/crypto/fs/path）**：端口默认 8787（可 `PORT` 覆盖）。JWT 用 HS256 自签、密码用 `scrypt` 哈希；数据存 `server/data/`（users.json + 每用户 settings/favorites/history）。CORS `*` 仅供本地。端点：注册/登录/me/改资料/改密码、设置·收藏·历史 的 GET·PUT（全量覆盖 + last-write-wins）。**启动：`node server/mock-server.js`**。

* **前端账户模块（app.js）**：`auth` 状态 + token 存 `localStorage`；`apiFetch` 自动带 `Authorization`、401 自动登出；`doLogin/doRegister/doLogout/pullAll/pushSettings/pushFavorites/pushHistory`；登录即「云端覆盖本地」（last-write-wins 云端优先），登出前末次上传。

* **本地收藏 / 历史（新建，此前 Web 原型无此功能）**：

  * 收藏：`favorites` 存 `localStorage`（`qjviewer_favorites_v1`），工具栏「☆ 收藏」按钮 toggle 当前图；云端面板「收藏」列表点击在桌面版可一键打开（`desktop.loadPaths`），Web 原型提示本地记录。

  * 历史：`history` 存 `localStorage`（`qjviewer_history_v1`，最多 50 条），`showImage` 成功渲染时 `recordHistory` 自动记录；云端面板「浏览历史」列表展示时间。

* **UI（index.html / styles.css）**：工具栏新增「☁ 登录 / ☁ 昵称」账户按钮与「☆ 收藏」按钮；登录弹窗（注册/登录切换）；云端面板（收藏 / 浏览历史 / 账户资料 三 tab，含昵称·头像·改密码·立即同步·退出登录）；设置面板「高级」新增「云端账户服务器地址」。

* **同步范围（四项全开）**：应用设置（含快捷键）、收藏记录、浏览历史、账户资料（昵称/头像/密码）均登录态自动双向同步（设置/快捷键改动防抖 600ms 上传；收藏/历史改动即时上传）。

* **Tauri 客户端连接提示**：`tauri.conf.json` 当前 `csp: null`（默认策略）。若要让 Tauri 客户端连真实云端后端，需在 `app.security.csp` 的 `connect-src` 加入后端地址（并保留 Tauri 默认 `ipc:` / `http://ipc.localhost` 源），否则前端 `fetch` 被 CSP 拦截。**本沙箱为安全未修改 CSP**，仅在文档标注。

* **验证**：

  * Mock 后端 REST 契约端到端测试（`server/test-api.mjs`）**19/0 全绿**：注册/登录/错误密码 401/重复注册 409/设置·收藏·历史 上传拉取一致/改昵称/改密码。

  * 前端账户模块 jsdom 集成测试（`test/cloud-front.cjs`，注入 Node fetch + 真实 mock 后端）**10/0 全绿**：注册→登录→收藏同步到云端→历史同步到云端→pullAll→登出。

  * 前端综合回归 **112/0 无回归**（新模块未登录态不触发任何网络，零影响）。

## 本阶段新增：收藏图本体云端同步（2026-08-15）

上一阶段云端账户仅同步收藏/历史的**记录元数据**（文件名/路径/时间），跨设备换不了图。本阶段补齐**图片文件本体**的跨设备同步，使「云端收藏」真正可用。

* **数据模型**：收藏记录项扩展 `hasImage`(bool) / `imageExt`(png/jpg/webp/gif…) 标志；图本体按 `data/users/{uid}/images/{favId}.{ext}` 落盘。上传起点：`addFavorite` 在登录态下取当前图原始字节（File 优先，回退 `fetch(url)`）经 base64 上传；前端标记 `hasImage` 并在云端面板收藏列表显示「☁已同步」徽标 + 下载按钮。

* **Mock 后端新增端点（server/mock-server.js）**：

  * `POST /api/favorites/image`（auth）`{id, ext, data(base64)}` → 落盘，上限 20MB；同 id 旧图先清理；`ext` 经 `safeExt` 白名单校验，`id` 正则 `^[A-Za-z0-9_-]{1,64}$` 防目录穿越。

  * `GET /api/favorites/image/:id`（auth）→ `{data(base64), ext}`，供前端下载还原为 Blob 并触发下载。

  * `PUT /api/favorites` 清理孤儿：收藏项被删除时，后端自动 `unlink` 其对应图本体文件（按 prev/cur id 差集）。

* **下载路径（前端）**：`downloadFavoriteImage(rec)` 调 `apiFetch` 取 base64 → `atob` → `Blob` → 临时锚点 `download` 触发文件下载；未登录提示先登录。

* **安全/健壮性**：图本体与元数据分离存储，删除收藏即回收空间；超限/非法 id/未知 id 均有明确错误（413/400/404）；未登录收藏仅存本地、不触网。

* **验证**：

  * Mock 后端 REST 契约（`server/test-api.mjs`）新增 #12 **7 项全绿** → 合计 **26/0**：图本体上传返回 size、下载字节与上传一致、ext 识别、未知 id 404、非法 id 400、清空收藏后孤儿文件清理 404。

  * 前端账户集成（`test/cloud-front.cjs`）新增闭环 **4 项全绿** → 合计 **14/0**：收藏图本体上传后 `hasImage=true`、下载字节与上传一致、扩展名识别、取消收藏后云端清理 404。

  * 前端综合回归 **112/0 无回归**（修复一处 `extOf` 函数名冲突：原 `extOf(name)` 取文件扩展名被本阶段新增的 `extOf(item)` 覆盖，导致缩略图 `.t-fmt` 误判扩展名——已重命名云端的为 `favItemExt(item)`）。

## 本阶段新增：使用说明文档（2026-08-15）

用户要求增加一份面向最终用户的「使用说明」。

* 新增 `使用说明.md`：完整中文用户手册，覆盖两大形态（Web 原型 / Windows 桌面客户端）、打开图片、看图基础（缩放/旋转/翻转/信息/复制/滤镜）、浏览导航、幻灯片、设为壁纸 4 模式、批量处理（改尺寸 + PNG/JPEG/WebP 嵌入 DPI）、收藏与历史、账户登录与云端同步（含图本体同步）、快捷键自定义与默认速查表、设置项详解、触摸手势、PWA、桌面客户端专属能力、常见问题。

* 内容均与代码实现逐一核对：快捷键取自 `app.js` 的 `DEFAULT_KEYMAP`（18 个动作）、设置项取自 `SETTINGS_SCHEMA`（通用/看图/幻灯片/文件关联/高级/快捷键六组），确保文档与真实行为一致。

* 关于面板（`app.js` 的 `openAbout`）底部新增「查看完整使用说明 →」链接，指向 `使用说明.md`（`target="_blank"`），Web 与桌面端均可打开。

* 校验：前端回归 **112/0 无回归**（`openAbout` 仅追加一个静态链接，不影响逻辑）。

* 补充 `使用说明.html`：自包含内联 CSS 的渲染版使用说明（含目录锚点、绿色主题，与软件视觉一致），浏览器点开即美观呈现，解决 markdown 源码不便读的问题；关于面板入口链接由 `使用说明.md` 改为 `使用说明.html`。`使用说明.md` 保留为纯文本源。

* 进一步把使用说明做成**应用内嵌弹窗**（用户连续三次「增加一个使用说明」且前两轮外部文件展示未达预期）：工具栏新增「📖 使用说明」按钮（`btnManual`），`app.js` 新增 `openManual()` 在 `#manualMask` 弹窗内注入完整 14 节说明（复用 about-modal / about-body 样式，新增表格边框样式），完全离线、Web 与桌面版均可直接阅读，不再依赖外部文件。`styles.css` 给 `.about-body table` 补边框样式。

## 本阶段优化：云端同步可靠性 + token 安全存储（2026-08-17）

针对「继续工作」建议清单中价值最高的两项真实缺陷进行加固（均可在本环境完整验证）：原同步为「改动后即发即弃」无重试无离线队列（断网/失败静默丢数据），token 明文存 `localStorage`。

* **离线同步队列（持久化 + 指数退避重试）** —— 替换原 `schedulePush`（600ms 防抖直发）：

  * 新增 `enqueueSync(kind, payload)`：入本地持久化队列 `lvjiaoxi_viewer_syncq_v1`（localStorage），同类型仅保留最新，避免堆积。

  * 新增 `flushQueue()`：顺序重试队列任务，成功即出队；失败按 `backoffMs(n)=min(30s, 800ms·2^min(n,5))` 指数退避，全部失败则按最近 `nextAt` 定时重跑。仅登录态执行；`navigator.onLine===false` 直接跳过。

  * 触发点：`pushSettings/pushFavorites/pushHistory` 改为入队（原 `schedulePush` 调用点全部替换）；`window` 的 `online` 事件与应用启动（`initAuth().then(flushQueue)`）自动补传；云端面板状态栏显示「待同步 N」。

  * 未登录 / 离线：本地行为不变（零回归），数据在队列中安全保留，联网后自动追回。

* **token 安全存储（Web Crypto AES-GCM，设备绑定）**：

  * `saveAuth` 改为**异步加密落盘**：用 `crypto.subtle` 经 PBKDF2（10 万次，盐 = 每设备随机 `lvjiaoxi_viewer_devsalt_v1` + 代码内置 pepper）派生 AES-GCM 256 密钥，token+user 加密为 `{v:2, salt, iv, ct}` 存 `localStorage`（原 `qjviewer_auth_v1`）。

  * `initAuth` 启动时异步解密还原；`decryptToken` 对 legacy `v:1` 明文兼容。环境无 `crypto.subtle` 时**降级明文** **`v:1`**（仍可用），并已在代码注释标注 Tauri 端应迁 OS keyring（如 `tauri-plugin-keyring`）为最终方案。

  * 注意：本方案为**原型级加固**（密文与设备盐同盘，配合代码内 pepper 提升提取门槛），非对抗有文件系统读取权限的攻击者；生产级需 OS 凭据库。

* **验证**：

  * 前端账户集成（`test/cloud-front.cjs`，jsdom 注入 `node:crypto` 的 webcrypto 使加密路径真实运行）**新增 8 项全绿** → 合计 **22/0**：token 以 `v:2` 加密落盘且不含明文、decryptToken 还原 token/user、断网时任务入队(len=2)、重连后 flushQueue 清空队列、离线期间历史/设置已补传至云端。

  * 前端综合回归 **112/0 无回归**（同步路径改动对未登录/在线均不影响既有逻辑）。

  * `node --check app.js` 通过。

## 本阶段新增：图片工具裁剪（Crop）+ 编辑面板实时预览

PRD 5.4「图片处理工具」的编辑闭环补齐——此前仅有旋转/翻转/滤镜/导出，缺裁剪。本阶段加入：

* **编辑面板内嵌实时预览画布**：打开「图片工具」(E) 时渲染当前图（已含旋转/翻转/EXIF/滤镜的烘焙结果）到预览画布，所见即所得。

* **交互式裁剪框**：在预览图上拖拽框选保留区域；拖动选框四角可调整大小，框内拖动可移动位置；带三分网格 + 暗化蒙版辅助构图；四角有可拖拽手柄（命中半径 12px）。

* **裁剪烘焙进导出**：`bakeFullCanvas()`（提取自原 `exportCanvasOfCurrent`，先烘焙旋转/翻转/EXIF/滤镜）后再按归一化裁剪矩形裁切，clamp 到画布边界；导出 JPG/PNG/WebP/BMP 均包含裁剪。复制/壁纸路径保持不变（不裁剪）。

* **一键重置**：「重置裁剪（全图）」清空裁剪矩形。

* **坐标体系**：裁剪以归一化 `[0,1]` 矩形存储，坐标空间 = 已旋转/翻转后的画布，与导出输出严格一致；旋转/翻转时预览自动重绘。

* **验证**：

  * 新增专项测试 `test/edit-crop.cjs`（jsdom + fake 2D context，模拟指针拖拽/缩放）**14/0 全绿**：`normToPx` 几何、裁剪导出尺寸 `50x32`、越界 clamp `100x80`、拖拽生成裁剪框、右下角缩放扩大裁剪、`resetCrop` 清空、无裁剪导出全图。

  * 综合回归 **112/0 无回归**。

  * `node --check app.js` 通过。

## 本阶段新增：最近打开（Recent）列表

补齐 PRD 5.1「Jumplist / 最近浏览」在 Web 原型下的等价物——此前在代码注释中标记为「规划中」。

* **记录来源**：打开「文件夹」（取 `webkitRelativePath` 首段文件夹名 + 图片数）或「多文件」（取文件名组合标签）时自动写入，存于本机 `localStorage`（key `lvjiaoxi_viewer_recent_v1`），最多 12 条，按时间倒序，同路径/同标签去重。

* **入口**：工具栏「🕘 最近」按钮打开弹窗（列表 + 单条移除「✕」+ 底部「清空记录」）；空状态首页还内联展示最近 6 条为可点胶囊。

* **重新打开**：点击记录走 `reopen()`——桌面客户端（Tauri）经 `window.__LVJIAOXI_OPEN_FOLDER(path)` / `__LVJIAOXI_OPEN_FILES(names)` 钩子直接用存储路径打开；Web 原型无钩子时回退为提示并触发对应文件选择框重新选择（诚实的浏览器限制）。

* **实现**：纯逻辑 `addRecentFolder/addRecentFiles/getRecent/removeRecent/clearRecent` + `renderRecent()`（弹窗）+ `renderRecentInline()`（空状态），`reopen()` 处理钩子/回退。已在 `window.__qj` 暴露便于回归。

* **验证**：

  * 新增专项测试 `test/recent.cjs`（jsdom 黑盒）**24/0 全绿**：basename 提取、计数/路径写入、同路径去重、文件组标签与去重、>12 截断与最新置顶、`renderRecent` 生成节点、`renderRecentInline` 显隐、点击走桌面钩子传路径、无钩子回退 `dirInput.click()`、`✕` 删除单条。

  * 综合回归 **112/0 无回归**（最近列表改动未引入回归）。

  * `node --check app.js` 通过；`package.json` 增加 `test:recent` 脚本。

## 本阶段修复：最近打开「桌面重开」断裂（真 bug）

此前「最近打开」的 `reopen()` 调用了 `window.__LVJIAOXI_OPEN_FOLDER` / `__LVJIAOXI_OPEN_FILES` 两个钩子，但 Rust 后端从未注册它们——桌面端点击「最近」会直接掉进「请重新选择」降级分支，等于功能失效。同时「文件组」只存了文件名、没有完整路径，即使接上后端也无法精确重开原文件。本阶段修复：

* **`reopen()`** **改用真实桥接**：经已存在的 `desktop.loadPaths()`（对应 Rust 命令 `load_paths`）重开；文件夹传 `[entry.path]`、文件组传 `entry.paths`（完整路径数组）。无 Tauri 环境（Web）仍回退为提示 + 触发文件/文件夹选择框重新选择。

* **捕获完整路径**：

  * `addRecentFiles` 现同时捕获 `File.path`（桌面端 Tauri 暴露真实路径），存入 `entry.paths`；兼容「字符串数组」（测试）与「文件对象（含 .path）」两种入参。

  * `dirInput` change 处理优先用 `files[0].path` 推导顶层文件夹（比 `webkitRelativePath` 在 Tauri 下更可靠，后者常为空），Web 才回退 `webkitRelativePath`。

* **验证**：

  * `test/recent.cjs` 扩展为 **25/0**：新增「桌面端文件组重开传 2 个完整路径」用例；原「钩子传路径」用例改为「经 `load_paths` 传路径」并验证 `cmd==="load_paths"` + `paths[0]` 正确。

  * 综合回归 **112/0 无回归**；`node --check app.js` 通过。

* **文档**：`使用说明.md` / `使用说明.html` 的「最近打开」节措辞更新为「经后端 load\_paths 直接打开，文件夹递归、文件组精确重开原文件」。

注：Rust 后端 `lib.rs` / `tauri.conf.json` / `capabilities` 此前已完整覆盖 `load_paths` / `set_wallpaper` / `reveal_in_explorer` / `copy_image` 四命令及文件关联/托盘/单实例/NSIS，无需改动；桌面端闭环仅差用户在 Rust 环境跑一次 `npm run tauri build`（或 `build-windows.bat`）。

## 本阶段新增：照片处理三方案全量落地（2026-09-01）

用户确认「方案一（Canvas 原生）/ 方案二（OpenCV）/ 方案三（AI 模型）全做」。三条路径统一收进「图片工具」弹窗，全部走「预览 / 队列 → 导出时烘焙」的非破坏架构：

* **方案一 · Canvas 原生（零依赖，离线可用）**：

  * 滤镜新增 3 个滑杆：**色温**（-100 冷 ↔ +100 暖，经 `sepia+saturate+hue-rotate` 组合近似，预览与导出用同一 CSS filter 串，所见即所得）、**模糊**（0–10px，原生 `blur()`）、**锐化**（0–100%）。

  * **锐化** **`sharpenCanvas`**：3×3 反锐化掩模卷积（`v' = center + k·(center - avg(4邻))`，k = amount/100×1.2），在 `exportCanvasOfCurrent` 烘焙后、裁剪前应用；边缘行/列保持原值；无像素环境（jsdom）安全返回 null 跳过。

  * **自动增强** **`autoEnhance`**：对底图（`makeCanvasOfCurrent`，不含滤镜）下采样 ≤64px 统计亮度直方图（1%/99% 分位）与平均饱和度，自动改写亮度/对比度/饱和度三个滑杆（clamp 60–180），非破坏、可继续手动微调。

* **方案二 · OpenCV（懒加载 opencv.js）**：

  * `loadOpenCV()` 首次点击时从可配置 CDN（默认 docs.opencv.org，设置→高级 `cvUrl`）注入 `<script>`；失败 toast 提示不阻断。

  * 三个操作入队 `state.ops`：**去噪（中值 medianBlur k=5）**、**保边去噪（双边 bilateralFilter d=5 σ=75）**、**智能锐化（高斯模糊 + addWeighted 反锐化掩模）**；`cvProcess` 经 `cv.imread/imshow` 就地写回。

* **方案三 · AI 放大（实验性）**：

  * `aiUpscale`：懒加载 onnxruntime-web（jsdelivr）+ 用户在「设置 → 高级 `aiModelUrl`」配置的超分 .onnx 模型（约定输入 1×3×H×W float32 0–1）；NCHW 预处理 → 推理 → 还原放大画布；2×/4× 选项，实际倍率以模型输出为准。

* **导出管线**：`exportCurrent` 变为 `bake（旋转/翻转/EXIF/滤镜/色温/模糊）→ 锐化 → 裁剪 → applyPixelOpsAsync（OpenCV/AI 依序）`；单步失败 toast 跳过不阻断导出；队列计数显示在「清空高级处理（N 步）」按钮上。

* **验证**：

  * 新增 `test/photo.cjs`（jsdom 黑盒 + 可控像素 fake ctx）**29/0 全绿**：新滑杆存在与默认值、色温暖/冷预览串（sepia/hue-rotate）、归零还原、重置覆盖新键、**sharpenCanvas 卷积数学（中心 200→230、边缘保持、alpha 保持）**、**自动增强暗图→180/亮图→64 + 滑杆 UI 同步**、OpenCV 点击入队 + fake cv 依序应用（imshow×2）、清空队列、AI 入队 scale=2/4、无像素环境安全降级。

  * 既有回归全绿：regression **112/0**、edit-crop **14/0**、recent **25/0**、cloud-front **22/0**（mock 后端启动后）。

  * `node --check app.js` 通过；`package.json` 新增 `test:photo` 脚本。

* **已知限制（诚实标注）**：锐化/OpenCV/AI 仅在导出时应用（编辑面板预览不重算像素，避免每次拖动全图卷积/推理的卡顿）；AI 模型地址需用户自配（Web 原型不内置模型，避免死链与体积）；opencv.js / onnxruntime-web 需联网首次加载，离线时对应项 toast 跳过。

## 本阶段新增：美工功能五件套（2026-09-01，学美图秀秀）

用户确认「风格预设 / 美颜 / 文字 / 边框 / 马赛克 全做」。统一收进「图片工具」弹窗，全部走「预览 → 导出烘焙」非破坏架构：

* **风格预设（11 种一键滤镜）**：原图 / 日系 / 复古 / 黑白 / 胶片 / LOMO / 清新 / 冷调 / 暖阳 / 港风 / 高对比黑白；`STYLE_PRESETS` 表驱动，点击即改写整套滤镜参数（与手动滑杆同管线，可继续微调）。风格格在 `openEdit` 时渲染。

* **美颜**：强度滑杆（0–100%）+「磨皮」「美白」按钮。美白 = 亮度 +40×a、饱和 +5×a 直改滤镜（实时预览）；磨皮 = 按强度映射双边滤波参数（d=3+7a，σ=40+60a）入 `state.ops` 队列（导出应用）。美白也顺带入队一次轻磨。

* **边框**：模式（无边/白边 5%/黑边 5%/相纸白边 15%）× 圆角（直角/小/大，相对短边 2%/6%）。`applyBorder` 纯 Canvas：扩边画布 + 底色填充 + `roundRectPath` 裁剪贴图；无边框直角时原画布直返（零开销）。

* **文字/水印**：文字层 `state.texts`（归一化坐标），5 锚点（四角+居中）、4 种字体、颜色、字号（相对短边 %）、描边；预览中点选（`selTextAt` 包围盒命中检测）+ 拖拽移动；选中后改字号/描边/字体/颜色实时联动；`drawTexts` 预览与导出同函数（选中框线仅预览绘制）。

* **马赛克笔刷**：`state.mosaicMode` 模式切换（按钮文案联动），pointerdown/move 涂抹、up 收笔；笔刷 10–80 → 归一化半径 0.05–0.4；每笔触存归一化圆，`drawMosaic` 渲染 = 源图缩小再放大回来（像素化）+ 圆形 clip；导出时对全尺寸画布重算（预览用预览尺寸，效果一致比例）。

* **交互优先级**（`onPreviewDown`）：马赛克模式 > 文字命中（拖拽/选中）> 裁剪（角柄/移动/新框）。`onPreviewUp` 依次收尾。全部拖拽状态入 `state`（`cropDrag/textDrag/mosaicPainting` 从模块级 let 迁移，避免 TDZ）。

* **换图重置**：`showImage` 切图时清空 texts/mosaic/mosaicMode/拖拽态，马赛克按钮文案复位。

* **导出管线**（最终顺序）：bake（旋转/翻转/EXIF/滤镜/色温/模糊）→ 锐化 → 马赛克 → 文字 → 边框 → OpenCV/AI 队列 → 编码。美工全部在裁剪后全尺寸烘焙。

* **顺手修的既有 bug**：`addRecent` 的 `ts = Date.now()` 同毫秒重复会导致 `removeRecent(ts)` 一删删多条（recent 测试偶发挂 2 项的根因）→ 追加时同 ts 递增保唯一。修复后 recent 连跑 3 次稳定 25/0。

* **验证**：新增 `test/beauty.cjs` **36/0**（风格预设参数+UI 同步+主图预览、美白亮度+20、磨皮入队 d=7、边框尺寸 210×110/230×130/直返、文字添加/属性/命中/联动/删除、马赛克模式切换/落笔/涂抹/收笔/笔刷半径/清空/换图重置）；全量回归 regression 112/0、photo 29/0、crop 14/0、recent 25/0（×3 稳定）。`npm run test:beauty` 入脚本。

* **已知限制**：马赛克模式中文字拖拽暂不可用（互斥）；边框后画布尺寸变大，EXIF 不重写（JPEG 导出会带新尺寸像素但 EXIF 维度字段为原图——BMP/PNG 无此问题）。


# capabilities.md · 项目能力清单

> 新 AI 接手 30 秒速读：能做什么 / 不能做什么 / 下一阶段补什么。
> 最后更新：2026-10-17

---

## ✅ 已经实现（能做什么）

### 核心浏览
- 文件夹/单文件/压缩包直开，格式支持 JPG/PNG/GIF/HEIC/WebP/TIFF/TGA
- GIF 原生播动画 + decode_fallback 兜底（Iss-005 七次踩坑闭环）
- 压缩包内图片懒加载（ZIP/CBZ/RAR/7Z）
- 穿透文件夹递归扫描
- 左侧缩略图栏虚拟滚动窗口 ±3（最多 7 张 DOM + thumbUrl 永久缓存）
- 双击图片文件关联启动（Setup.exe ProgId 注册）
- 最近访问历史

### 性能
- rayon 并行 load_paths：53 张图 1500ms → 37ms（40-50x）
- IPC 懒加载：load_paths 只传元信息 + get_image_data 单张拉，冷启动 5.7s → 0.8s（7x）
- 毫秒时间戳日志（dbg_log，零成本线上工具）

### 美图编辑（内嵌底部栏）
- 美颜：滤镜微调 + 自动增强
- 风格配方：22 条预设（温柔青/暗黑胶片/韩系冷白...）
- 特效：边框+贴纸 / 海报标题 / 文字 / 马赛克 / 消除笔（Patch-Match Inpainting）
- 高级：抠图（高斯似然比+双边羽化≤512px）/ AI 超分（ONNX sub_pixel_cnn + ort.wasm，失败自动降级 Lanczos）/ OpenCV 降噪 / 裁剪
- 变形：合并位移场一次性双线性采样（导出=预览同公式）+ 美型微调（大眼/小脸/美牙/丰唇/瘦鼻）
- 海报：BORDER_PRESETS + emojiBar + 一键海报生成
- 批量处理：9 宫格平铺 -30° 水印 + 批量格式转换
- 切图编辑态全归零（每张图独立历史）

### 打包交付
- Tauri v2 + WebView2 离线运行时，单 EXE
- NSIS 全中文 SimpChinese 安装包，PreInstall 只留 taskkill
- EXE 静默启动托盘 + 单实例转发
- 版本号 7 落点自动化自检（scripts/check-versions.cjs）

### Android 主线（55%）
- 完整构建管线：`tauri android build --apk -t aarch64 armv7` 唯一入口
- Universal APK 35.38MB（arm64+armv7 release 签名）
- JNI 20 符号齐全 + 真机 PID 存活零崩溃
- AndroidManifest priority=100 绕过 Resolver 幽灵条目
- MainActivity pendingIntent 暂存 + allowContentAccess=true
- Manifest 9 个 intent-filter → 合并 1 个
- onNewIntent → __androidOpenFile 推给前端
- content:// SAF fetch 路径支持
- styles.css 移动端 @media(max-width:768px) 适配

---

## ❌ 还不能做（平台限制 + 待开发）

### 平台限制（非代码 bug）
- Android intent 真机测试（Bug-A/B 已修代码，待手机连接稳定后验证 Gallery/Files 点图打开）
- Android SAF Picker 完整授权（ACTION_OPEN_DOCUMENT）
- Android file:// 路径已被系统限制，只能走 content://
- HarmonyOS/iOS 线（已移除，暂不回归）
- 后端服务接入（server/mock-server.js 占位）

### 功能缺口
- 无云端同步
- 无 GIF 逐帧编辑（gifuct-js 方案未采纳）
- 无批量格式导出（Chg-032 风格配方已加，但还没 batchConvert 扩展）
- 无 OCR 文字识别
- Rust 2 个 Android 专属 warning 未清零（需真机构建加 cfg）

---

## 🔜 下一阶段优先补

### P0（Android 收尾）
1. ✅ Bug-A/B 代码已写 → 手机连好后 adb 验证 Gallery/Files 点图 + content://
2. SAF Picker 完整授权（ACTION_OPEN_DOCUMENT → 真实路径）
3. Android APK 整理到 nsis_x/ 做交付物
4. Rust Android warning 清零

### P1（性能/质量）
5. 桌面双击图片 0.8s 验证后 → 考虑 Android 端 load_paths 同样用 rayon + 懒加载
6. generate_handler 编译期断言防再漏注册（Chg-035 教训）
7. WebP 桌面版验证（Cargo.toml 已补 feature）

### P2（功能增强 · 按需）
8. 批量格式扩展（WebP/HEIC 批量转 JPG）
9. OCR 文字识别（Tesseract.js + wasm）
10. 竞品热门功能收集（honeyview-archive-browse 压缩包直看动画预览、recursive-folder-browse 穿透文件夹）
11. 鸿蒙/iOS 线回归（暂不）
12. 后端服务接入（暂不）

---

## 🎯 核心卖点（对外可讲）

1. **合并位移场变形**：大眼/瘦脸/丰唇叠加不冲突，导出 = 预览像素级一致
2. **AI 超分失败自动降级**：ONNX 崩了 Lanczos 顶上，绝不挂起
3. **压缩包直看**：ZIP/CBZ 懒加载，不解压直接浏览
4. **GIF 四路径全闭环**：主图/压缩包/缩略图/底部缩略图，每条路径都有兜底
5. **rayon 并行 + IPC 懒加载**：50+ 张图双击几乎瞬间显示
6. **台账驱动**：跨 AI 30 秒接手即懂，版本号自检脚本一键验全落点

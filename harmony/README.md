# 绿角犀看图 · 鸿蒙原生版

主线功能（已实现）：相册选图 → 大图显示 → 捏合缩放 / 拖拽平移 / 双击放大 → EXIF 方向自动正向 → 翻页浏览 + 底部缩略图条。

## 运行

1. 安装华为 DevEco Studio 5.0+（含 HarmonyOS NEXT SDK）。
2. 打开本目录 `harmony/`（File → Open → 选 harmony 文件夹），等待 hvigor 同步。
3. 连接华为手机/模拟器（需开启开发者模式）。
4. 点 Run（▶）安装到设备。

## 文件结构

- `AppScope/app.json5` —— 应用级配置（bundle: com.lvjiaoxi.viewer）
- `entry/src/main/module.json5` —— 模块配置（手机/平板、READ_IMAGEVIDEO 权限申请）
- `entry/src/main/ets/pages/Index.ets` —— **全部主线逻辑**（约 300 行）
  - `PhotoItem` 数据模型（含 EXIF orientation 与宽高交换逻辑）
  - `pickImages()`：PhotoViewPicker 选图（系统选择器，免手动授权）+ 读取宽高/方向/文件名
  - 手势：TapGesture(2) 双击放大↔适应、PanGesture 拖拽平移、PinchGesture 捏合缩放（0.5–8×，松手回弹）
  - 底部缩略图条（当前图蓝框高亮，点击跳转）
- `entry/src/test/List.test.ets` —— hypium 测试骨架

## 已知说明

- Image 组件对 photoAccessHelper URI 自动应用 EXIF 方向（系统图库解码器处理 orientation），`PhotoItem.swapped/dispW/dispH` 供后续滤镜/裁剪计算使用。
- 选图走系统 PhotoViewPicker，无需 READ_IMAGEVIDEO 运行时弹窗（该权限已在 module.json5 声明备用）。
- 后续跟进（全量版）：滤镜/裁剪/文字/马赛克/批量/云同步 —— 算法照搬 Web 版，UI 用 ArkUI 重写。

## 下一步验证清单（真机/模拟器）

- [ ] DevEco Studio 打开无报错，hvigor 同步通过
- [ ] 模拟器运行：点「打开相册」→ 选多张 → 显示第一张
- [ ] 捏合缩放流畅，松手 <1× 回弹适应
- [ ] 双击在 1× ↔ 2× 间切换
- [ ] 翻页按钮 + 缩略图条点击跳图
- [ ] 含 EXIF orientation 6（相机竖拍）的图显示为正向

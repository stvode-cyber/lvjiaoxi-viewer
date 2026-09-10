// 绿角犀看图·鸿蒙原生版 · 主页面
// 主线：PhotoViewHelper 选图 → Image 显示（EXIF 方向自动正向）→ 捏合缩放/拖拽/双击手势 → 左右滑翻页 → 底部缩略图条
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { image } from '@kit.ImageKit';
import { promptAction } from '@kit.ArkUI';

// —— 图片数据模型 ——
class PhotoItem {
  uri: string = '';            // photoAccessHelper URI
  name: string = '';
  width: number = 0;
  height: number = 0;
  orientation: number = 1;     // EXIF orientation 1-8
  fitScale: number = 1;        // 初始适应缩放
  // 显示态（手势可改）
  scale: number = 1;
  offsetX: number = 0;
  offsetY: number = 0;

  constructor(uri: string, name: string, width: number, height: number, orientation: number) {
    this.uri = uri;
    this.name = name;
    this.width = width;
    this.height = height;
    this.orientation = orientation;
  }

  // EXIF 方向是否交换宽高（orientation 5/6/7/8 旋转 90°）
  get swapped(): boolean {
    return this.orientation >= 5 && this.orientation <= 8;
  }
  get dispW(): number {
    return this.swapped ? this.height : this.width;
  }
  get dispH(): number {
    return this.swapped ? this.width : this.height;
  }
}

@Entry
@Component
struct Index {
  @State photos: PhotoItem[] = [];
  @State current: number = -1;
  @State viewScale: number = 1;
  @State viewX: number = 0;
  @State viewY: number = 0;
  // 手势中间态
  private lastScale: number = 1;
  private lastX: number = 0;
  private lastY: number = 0;
  private stageW: number = 0;
  private stageH: number = 0;
  @State loading: boolean = false;
  @State toastMsg: string = '';

  // —— 选图（系统相册选择器，无需手动授权）——
  async pickImages(): Promise<void> {
    try {
      this.loading = true;
      const result = await photoAccessHelper.PhotoViewPicker.pick({
        MIMEType: photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE,
        maxSelectNumber: 500,
      });
      const uris = result.photoUris;
      if (!uris || !uris.length) {
        this.loading = false;
        return;
      }
      const items: PhotoItem[] = [];
      for (const uri of uris) {
        try {
          const helper = photoAccessHelper.getPhotoAccessHelper(this.getUIContext().getHostContext()!);
          const asset = await helper.getAssets({ uris: [uri] });
          const ph = await (asset.getFirstObject() as Promise<photoAccessHelper.PhotoAsset>);
          const w = (ph.get(photoAccessHelper.PhotoKeys.WIDTH) as number) || 0;
          const h = (ph.get(photoAccessHelper.PhotoKeys.HEIGHT) as number) || 0;
          const ori = Number(ph.get(photoAccessHelper.PhotoKeys.ORIENTATION) || 1) || 1;
          const title = (ph.get(photoAccessHelper.PhotoKeys.TITLE) as string) || '图片';
          items.push(new PhotoItem(uri, title, w, h, ori));
        } catch (e) {
          // 单张失败跳过，不阻断
        }
      }
      this.photos = items;
      this.current = items.length > 0 ? 0 : -1;
      this.resetView();
      this.loading = false;
      this.toast(`已载入 ${items.length} 张图片`);
    } catch (e) {
      this.loading = false;
      this.toast('选图取消或失败');
    }
  }

  // —— 视图 ——
  resetView(): void {
    this.viewScale = 1;
    this.viewX = 0;
    this.viewY = 0;
    this.lastScale = 1;
    this.lastX = 0;
    this.lastY = 0;
  }

  fitScaleOf(item: PhotoItem): number {
    if (!item || !item.dispW || !item.dispH || !this.stageW || !this.stageH) return 1;
    return Math.min(this.stageW / item.dispW, this.stageH / item.dispH, 1);
  }

  toast(msg: string): void {
    this.toastMsg = msg;
    promptAction.showToast({ message: msg, duration: 1500 });
  }

  // —— 翻页 ——
  go(delta: number): void {
    if (this.current < 0) return;
    const next = this.current + delta;
    if (next < 0 || next >= this.photos.length) {
      this.toast(delta > 0 ? '已是最后一张' : '已是第一张');
      return;
    }
    this.current = next;
    this.resetView();
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column() {
        // ===== 主视图区 =====
        Stack({ alignContent: Alignment.Center }) {
          if (this.current >= 0 && this.photos[this.current] !== undefined) {
            Image(this.photos[this.current].uri)
              .objectFit(ImageFit.Contain)
              .autoResize(true)
              .draggable(false)
              .alt($r('app.media.app_icon'))
              .scale({ x: this.viewScale, y: this.viewScale })
              .translate({ x: this.viewX, y: this.viewY })
              .rotate({ angle: 0 })
              .gesture(
                GroupGestureMode.EXCLUSIVE,
                // 双击：适应 ↔ 2×
                TapGesture(count: 2)
                  .onAction(() => {
                    if (this.viewScale > 1.05) {
                      this.resetView();
                    } else {
                      this.viewScale = 2;
                    }
                  }),
              )
              // 单指拖拽（缩放 >1 时平移）
              .gesture(
                PanGesture({ fingers: 1, distance: 1 })
                  .onActionStart(() => {
                    this.lastX = this.viewX;
                    this.lastY = this.viewY;
                  })
                  .onActionUpdate((e: GestureEvent) => {
                    if (this.viewScale <= 1.001) return;
                    this.viewX = this.lastX + e.offsetX;
                    this.viewY = this.lastY + e.offsetY;
                  }),
              )
              // 捏合缩放
              .gesture(
                PinchGesture({ fingers: 2 })
                  .onActionStart(() => {
                    this.lastScale = this.viewScale;
                  })
                  .onActionUpdate((e: GestureEvent) => {
                    const s = this.lastScale * e.scale;
                    this.viewScale = Math.max(0.5, Math.min(s, 8));
                  })
                  .onActionEnd(() => {
                    if (this.viewScale < 1) {
                      this.resetView();  // 松手回弹适应
                    }
                  }),
              )
          } else {
            // ===== 空状态 =====
            Column({ space: 16 }) {
              Text('绿角犀看图').fontSize(24).fontWeight(FontWeight.Bold).fontColor('#1F2937')
              Text('点下方按钮从相册选择图片').fontSize(14).fontColor('#9CA3AF')
              Button('打开相册')
                .backgroundColor('#2563EB')
                .fontColor(Color.White)
                .width(160)
                .height(44)
                .borderRadius(10)
                .onClick(() => this.pickImages())
            }
            .width('100%')
            .height('100%')
            .justifyContent(FlexAlign.Center)
          }
        }
        .width('100%')
        .layoutWeight(1)
        .backgroundColor('#0B0F14')
        .onAreaChange((_o, n) => {
          this.stageW = n.width as number;
          this.stageH = n.height as number;
        })

        // ===== 底部：翻页按钮 + 缩略图条 =====
        if (this.photos.length > 0) {
          Column({ space: 8 }) {
            Text(`${this.current + 1} / ${this.photos.length} · ${this.photos[this.current]?.name ?? ''}`)
              .fontSize(12)
              .fontColor('#9CA3AF')
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
              .width('90%')
              .textAlign(TextAlign.Center)
            Row({ space: 16 }) {
              Button('上一张')
                .buttonStyle(ButtonStyleMode.NORMAL)
                .enabled(this.current > 0)
                .opacity(this.current > 0 ? 1 : 0.4)
                .onClick(() => this.go(-1))
              Button('打开相册').buttonStyle(ButtonStyleMode.NORMAL).onClick(() => this.pickImages())
              Button('下一张')
                .buttonStyle(ButtonStyleMode.NORMAL)
                .enabled(this.current < this.photos.length - 1)
                .opacity(this.current < this.photos.length - 1 ? 1 : 0.4)
                .onClick(() => this.go(1))
            }
            // 缩略图条
            List({ space: 6 }) {
              ForEach(this.photos, (p: PhotoItem, i: number) => {
                ListItem() {
                  Image(p.uri)
                    .objectFit(ImageFit.Cover)
                    .width(48)
                    .height(48)
                    .borderRadius(6)
                    .border({
                      width: i === this.current ? 2 : 1,
                      color: i === this.current ? '#3B82F6' : '#33FFFFFF',
                    })
                    .onClick(() => {
                      this.current = i;
                      this.resetView();
                    })
                }
              }, (p: PhotoItem) => p.uri)
            }
            .listDirection(Axis.Horizontal)
            .height(56)
            .width('100%')
            .padding({ left: 12, right: 12 })
          }
          .width('100%')
          .padding(8)
          .backgroundColor('#111827')
        }
      }
      .width('100%')
      .height('100%')

      // loading 遮罩
      if (this.loading) {
        Column({ space: 12 }) {
          LoadingProgress().width(40).height(40).color('#3B82F6')
          Text('载入中…').fontSize(13).fontColor(Color.White)
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('rgba(0,0,0,0.45)')
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#0B0F14')
  }
}

// 绿角犀看图桌面版 · Tauri 后端（Rust）
//
// 职责（对应 PRD 5.1 系统集成层 + 5.2 后端解码）：
//  - load_paths：接收文件/文件夹路径，递归收集图片，WebView 原生格式直接以 data URL 传递，
//    TIFF/TGA 用 image crate 解码为 JPEG，HEIC/RAW/PSD 为扩展点（见文件末尾说明）。
//  - set_wallpaper / reveal_in_explorer：系统壁纸与资源管理器定位（跨平台 shell 调用）。
//  - copy_image：用 arboard 写入系统剪贴板位图（替代 Web ClipboardItem）。
//  - 单实例 + CLI：双击关联文件 / 右键菜单 / 第二次启动时，把路径经事件转发给前端。
//  - 系统托盘（最小化到托盘 / 退出）。
//
// 注意：修改前端（index.html/app.js/styles.css 等）后构建，若 cargo 增量缓存认为 Rust 未变，
// 嵌入式资源可能不会重新内嵌（exe 仍带旧前端，表现为白屏/缺界面元素）。
// 如需强制执行，touch 本文件或 `cargo clean -p lvjiaoxi-viewer` 后再 `npx tauri build`。
//
// 稳定性参数（tauri.conf.json 窗口 additionalBrowserArgs，2026-09-03 排查结论）：
//  应用此前 1~5 分钟随机退出，根因：本机 GPU 驱动不稳（事件日志大量 LiveKernelEvent 141 TDR）
//  + WebView2 GPU 合成崩溃 + 后台窗口渲染被回收，叠加搜狗输入法 sou_input_tsf.dll 缓冲溢出 0xc0000409。
//  已加 --disable-gpu-compositing --disable-gpu-rasterization --disable-backgrounding-occluded-windows
//  --disable-renderer-backgrounding；实测 9 分钟连续运行零崩溃、零应用错误事件。
//  若日后机况（换机/更新 WebView2）允许，可逐步去掉前两个 GPU 参数以恢复硬件加速。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::borrow::Cow;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use image::codecs::jpeg::JpegEncoder;
use image::ImageEncoder;
use zip::ZipArchive;

// 启动参数缓存：setup 阶段 emit 的 open-file 事件会因 WebView 未加载完成而丢失，
// 前端启动后主动 invoke get_pending_paths 拉取（取后清空）。
static PENDING_PATHS: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn dbg_log(msg: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(std::env::temp_dir().join("lvjx-debug.log")) {
        let _ = writeln!(f, "{}", msg);
    }
}

// 把命令行参数里可能被空格/括号拆开的路径 token 重新拼成真实存在的路径。
// Windows 某些启动路径（部分右键菜单 / 二次实例转发）会以未加引号的 argv 传入，
// 导致形如 "C:\...\福娃设计 (3).png" 被拆成 ["...福娃设计", "(3).png"]，两段都非实存文件，
// 进而整批收集 0 张、图片不显示。这里用贪心合并还原。
fn rejoin_existing(tokens: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut buf: String = String::new();
    for tok in tokens {
        if buf.is_empty() {
            if Path::new(&tok).exists() {
                out.push(tok);
            } else {
                buf = tok;
            }
        } else {
            let joined = format!("{} {}", buf, tok);
            if Path::new(&joined).exists() {
                out.push(joined);
                buf.clear();
            } else if Path::new(&tok).exists() {
                out.push(std::mem::take(&mut buf));
                out.push(tok);
            } else {
                buf = joined;
            }
        }
    }
    if !buf.is_empty() {
        out.push(buf);
    }
    out
}

fn stash_pending(paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Ok(mut g) = PENDING_PATHS.lock() {
        g.extend(paths);
    }
}

#[tauri::command]
fn get_pending_paths() -> Vec<String> {
    if let Ok(mut g) = PENDING_PATHS.lock() {
        let v = g.clone();
        g.clear();
        dbg_log(&format!("[get_pending_paths] return {} items", v.len()));
        return v;
    }
    Vec::new()
}

// ===== 压缩包直看（HoneyView 对标）=====

#[derive(Serialize, Clone)]
pub struct ArchiveEntry {
    pub index: usize,       // zip 内索引（前端懒加载用）
    pub name: String,       // 条目标题（压缩包内路径）
    pub size: u64,          // 未压缩大小
}

/// 列出压缩包内的图片条目（自然排序）
#[tauri::command]
fn list_archive_entries(path: String) -> Result<Vec<ArchiveEntry>, String> {
    let file = std::fs::File::open(&path).map_err(|e| format!("打开压缩包失败: {}", e))?;
    let mut zip = ZipArchive::new(std::io::BufReader::new(file))
        .map_err(|e| format!("解析 ZIP 失败（请确认是 .zip / .cbz 格式）: {}", e))?;

    let mut entries: Vec<ArchiveEntry> = Vec::new();
    for i in 0..zip.len() {
        let zf = zip.by_index(i).map_err(|e| format!("读取 entry {} 失败: {}", i, e))?;
        if zf.is_file() {
            let name = zf.name().to_string();
            // 跳过 __MACOSX / .DS_Store 等无用条目
            if name.starts_with("__MACOSX") || name.ends_with(".DS_Store") {
                continue;
            }
            if is_image_entry(&name) {
                entries.push(ArchiveEntry {
                    index: i,
                    name: name.clone(),
                    size: zf.size(),
                });
            }
        }
    }
    // 数字感知自然排序（img2 < img10）
    entries.sort_by(|a, b| natural_cmp(&a.name, &b.name));
    Ok(entries)
}

/// 读取压缩包内指定索引的图片，返回 data URL（前端懒加载时调用）
#[tauri::command]
fn read_archive_entry(path: String, index: usize) -> Result<String, String> {
    let file = std::fs::File::open(&path).map_err(|e| format!("打开压缩包失败: {}", e))?;
    let mut zip = ZipArchive::new(std::io::BufReader::new(file))
        .map_err(|e| format!("解析 ZIP 失败: {}", e))?;
    let mut zf = zip.by_index(index).map_err(|e| format!("entry {} 不存在: {}", index, e))?;
    if !zf.is_file() {
        return Err("entry 不是文件".to_string());
    }

    // 读取原始字节
    let mut buf = Vec::with_capacity(zf.size() as usize);
    std::io::Read::read_to_end(&mut zf, &mut buf)
        .map_err(|e| format!("读取 entry 数据失败: {}", e))?;

    // 扩展名判断 mime + 是否需要 Rust 解码
    let ext = Path::new(zf.name())
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mime = mime_of(&ext);

    // WebView 原生支持 → 直接 data URL
    if NATIVE_EXTS.contains(&ext.as_str()) {
        let b64 = B64.encode(&buf);
        return Ok(format!("data:{};base64,{}", mime, b64));
    }

    // TIFF / TGA 等 → Rust image crate 解码转 JPEG
    if matches!(ext.as_str(), "tif" | "tiff" | "tga") {
        let cursor = Cursor::new(&buf);
        let img = image::ImageReader::new(cursor)
            .with_guessed_format()
            .map_err(|e| format!("格式探测失败: {}", e))?
            .decode()
            .map_err(|e| format!("解码失败: {}", e))?;
        // 转 JPEG data URL（和 decode_to_rgb 同款逻辑）
        let mut jpeg_buf = Vec::new();
        let mut jcursor = std::io::Cursor::new(&mut jpeg_buf);
        let enc = JpegEncoder::new_with_quality(&mut jcursor, 90);
        img.write_with_encoder(enc)
            .map_err(|e| format!("JPEG 编码失败: {}", e))?;
        let b64 = B64.encode(&jpeg_buf);
        return Ok(format!("data:image/jpeg;base64,{}", b64));
    }

    // 兜底：原样 base64（前端可能仍能渲染）
    let b64 = B64.encode(&buf);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[derive(Serialize, Clone)]
pub struct ImageEntry {
    pub name: String,
    pub size: u64,
    pub last_modified: u64,
    pub mime: String,
    pub url: String,
    pub path: String,
}

// WebView 原生支持的格式：直接以 data URL 透传，无需 Rust 解码
const NATIVE_EXTS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "ico", "svg", "avif", "apng",
];

// 压缩包扩展名（ZIP/CBZ 一期支持；RAR/7Z 后续版再加）
const ARCHIVE_EXTS: &[&str] = &[
    "zip", "cbz",
];

// 压缩包内可识别的图片扩展名
const ARCHIVE_IMAGE_EXTS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "ico", "tif", "tiff", "tga",
];

fn is_archive(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| ARCHIVE_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_image_entry(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| ARCHIVE_IMAGE_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

// 需要 Rust 后端解码的格式（image crate 已覆盖 tiff/tga；其余见文件末尾扩展点）
fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let l = e.to_lowercase();
            NATIVE_EXTS.contains(&l.as_str())
                || matches!(l.as_str(), "tif" | "tiff" | "tga" | "heic" | "heif" | "cr2" | "nef" | "arw" | "dng" | "raw" | "psd")
        })
        .unwrap_or(false)
}

fn collect_images(root: &Path, out: &mut Vec<PathBuf>) {
    if root.is_file() {
        if is_image(root) {
            out.push(root.to_path_buf());
        }
        return;
    }
    if let Ok(rd) = std::fs::read_dir(root) {
        for ent in rd.flatten() {
            let p = ent.path();
            if p.is_dir() {
                collect_images(&p, out);
            } else if is_image(&p) {
                out.push(p);
            }
        }
    }
}

// 收集 root 直属目录下（仅一层，不递归）的图片 —— 用于打开单张图片时列同文件夹的相邻图
fn collect_images_flat(root: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(rd) = std::fs::read_dir(root) {
        for ent in rd.flatten() {
            let p = ent.path();
            if p.is_file() && is_image(&p) {
                out.push(p);
            }
        }
    }
}

// 数字感知自然排序（img2 < img10）
fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let (ca, cb) = (a.as_bytes(), b.as_bytes());
    let (mut ia, mut ib) = (0usize, 0usize);
    while ia < ca.len() && ib < cb.len() {
        if ca[ia].is_ascii_digit() && cb[ib].is_ascii_digit() {
            let (sa, ea) = num_end(a, ia);
            let (sb, eb) = num_end(b, ib);
            let na: u64 = a[sa..ea].parse().unwrap_or(0);
            let nb: u64 = b[sb..eb].parse().unwrap_or(0);
            if na != nb {
                return na.cmp(&nb);
            }
            ia = ea;
            ib = eb;
        } else {
            if ca[ia] != cb[ib] {
                return ca[ia].cmp(&cb[ib]);
            }
            ia += 1;
            ib += 1;
        }
    }
    ca.len().cmp(&cb.len())
}
fn num_end(s: &str, start: usize) -> (usize, usize) {
    let b = s.as_bytes();
    let mut e = start;
    while e < b.len() && b[e].is_ascii_digit() {
        e += 1;
    }
    (start, e)
}

fn mime_of(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        "tif" | "tiff" => "image/tiff",
        "tga" => "image/x-tga",
        _ => "image/jpeg",
    }
}

// TIFF / TGA 用 image crate 解码为 RGB8（其余 WebView 原生格式不走这里）
fn decode_to_rgb(path: &Path) -> Result<image::RgbImage, String> {
    let img = image::open(path).map_err(|e| format!("解码失败: {}", e))?;
    Ok(img.to_rgb8())
}

// 把 RGB8 编码为 JPEG data URL
fn rgb_to_jpeg_data_url(img: image::RgbImage) -> Result<String, String> {
    let dyn_img = image::DynamicImage::ImageRgb8(img);
    let mut buf: Vec<u8> = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut buf);
        let enc = JpegEncoder::new_with_quality(&mut cursor, 90);
        dyn_img
            .write_with_encoder(enc)
            .map_err(|e| format!("编码失败: {}", e))?;
    }
    Ok(format!("data:image/jpeg;base64,{}", B64.encode(&buf)))
}

// 打开单张图片：一并加载同文件夹的图片（仅当前目录，不递归），
// 好让底部缩略图栏能左右切换同一目录下的相邻照片。目录则递归收集。
fn collect_files(path: &Path, out: &mut Vec<PathBuf>, recursive: bool) {
    if path.is_dir() {
        collect_images(path, out); // 文件夹始终递归
    } else if path.exists() {
        match path.parent() {
            Some(parent) => {
                if recursive {
                    collect_images(parent, out); // 穿透：单文件 → 递归父目录所有子目录
                } else {
                    collect_images_flat(parent, out); // 默认：仅父目录一层
                }
            }
            None => out.push(path.to_path_buf()),
        }
    }
}

#[tauri::command]
fn flog(message: String) {
    dbg_log(&format!("[frontend] {}", message));
}

#[tauri::command]
async fn load_paths(paths: Vec<String>, recursive: Option<bool>) -> Result<Vec<ImageEntry>, String> {
    let recursive = recursive.unwrap_or(false);
    dbg_log(&format!("[load_paths] in={:?} recursive={}", paths, recursive));
    let mut files: Vec<PathBuf> = Vec::new();
    for p in &paths {
        collect_files(Path::new(p), &mut files, recursive);
    }
    dbg_log(&format!("[load_paths] collected {} files", files.len()));
    files.sort_by(|a, b| {
        let na = a.file_name().and_then(|s| s.to_str()).unwrap_or("");
        let nb = b.file_name().and_then(|s| s.to_str()).unwrap_or("");
        natural_cmp(na, nb)
    });

    let mut entries = Vec::with_capacity(files.len());
    for f in files {
        let meta = match std::fs::metadata(&f) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let size = meta.len();
        let last_modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let name = f
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("image")
            .to_string();
        let ext = f
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        let mime = mime_of(&ext).to_string();

        // WebView 原生格式：直接以原始字节透传
        let is_native = NATIVE_EXTS.contains(&ext.as_str());
        let url = if is_native {
            match std::fs::read(&f) {
                Ok(bytes) => format!("data:{};base64,{}", mime, B64.encode(&bytes)),
                Err(_) => continue,
            }
        } else if ext == "tif" || ext == "tiff" || ext == "tga" {
            // 需要 Rust 解码的格式：解码失败则跳过该文件，不阻塞整批加载
            match decode_to_rgb(&f).and_then(rgb_to_jpeg_data_url) {
                Ok(u) => u,
                Err(_) => continue,
            }
        } else if ext == "heic" || ext == "heif" {
            // HEIC/HEIF：透传原始字节 data URL，由前端 heic2any 转码（需联网）。
            // 解码失败或离线的分支走前端容错，不在此阻塞整批加载。
            match std::fs::read(&f) {
                Ok(bytes) => format!("data:image/heic;base64,{}", B64.encode(&bytes)),
                Err(_) => continue,
            }
        } else {
            // RAW / PSD：扩展点，当前跳过该文件而不是让整批加载失败，
            // 保证被打开的图片始终能显示（即使同文件夹含有未支持格式的相邻图）。
            continue;
        };

        entries.push(ImageEntry {
            name,
            size,
            last_modified,
            mime,
            url,
            path: f.to_string_lossy().to_string(),
        });
    }
    dbg_log(&format!("[load_paths] return {} entries", entries.len()));
    Ok(entries)
}

// 最近打开缩略图：文件返回自身，文件夹返回自然排序后的第一张图片（仅取一张，避免大目录全量解码）
#[tauri::command]
fn first_thumb(path: String) -> Result<Option<String>, String> {
    let p = Path::new(&path);
    let file: Option<PathBuf> = if p.is_dir() {
        let mut files = Vec::new();
        collect_images(p, &mut files);
        files.sort_by(|a, b| {
            let na = a.file_name().and_then(|s| s.to_str()).unwrap_or("");
            let nb = b.file_name().and_then(|s| s.to_str()).unwrap_or("");
            natural_cmp(na, nb)
        });
        files.into_iter().next()
    } else if p.exists() && is_image(p) {
        Some(p.to_path_buf())
    } else {
        None
    };
    let Some(file) = file else { return Ok(None); };
    let ext = file
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    let mime = mime_of(&ext);
    if NATIVE_EXTS.contains(&ext.as_str()) {
        let bytes = std::fs::read(&file).map_err(|e| e.to_string())?;
        Ok(Some(format!("data:{};base64,{}", mime, B64.encode(&bytes))))
    } else if ext == "tif" || ext == "tiff" || ext == "tga" {
        let rgb = decode_to_rgb(&file)?;
        Ok(Some(rgb_to_jpeg_data_url(rgb)?))
    } else {
        // HEIC / RAW / PSD：暂不支持，前端显示占位
        Ok(None)
    }
}

#[tauri::command]
fn set_wallpaper(path: String) -> Result<(), String> {
    set_wallpaper_impl(&path)
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    reveal_impl(&path)
}

#[tauri::command]
fn copy_image(bytes: Vec<u8>) -> Result<(), String> {
    copy_image_impl(bytes)
}

// ============ 系统操作（跨平台）============

#[cfg(target_os = "windows")]
fn set_wallpaper_impl(path: &str) -> Result<(), String> {
    use std::process::Command;
    let ps = format!(
        "Add-Type @'\nusing System.Runtime.InteropServices;\npublic class WP {{ [DllImport(\"user32.dll\")] public static extern int SystemParametersInfo(int a,int b,string c,int d); }}\n'@; [WP]::SystemParametersInfo(20,0,'{}',3) | Out-Null",
        path.replace('\'', "''")
    );
    Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn set_wallpaper_impl(path: &str) -> Result<(), String> {
    use std::process::Command;
    let script = format!(
        "tell application \"System Events\" to set picture of every desktop to POSIX file \"{}\"",
        path
    );
    Command::new("osascript")
        .args(["-e", &script])
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn set_wallpaper_impl(path: &str) -> Result<(), String> {
    use std::process::Command;
    Command::new("gsettings")
        .args([
            "set",
            "org.gnome.desktop.background",
            "picture-uri",
            &format!("file://{}", path),
        ])
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn reveal_impl(path: &str) -> Result<(), String> {
    use std::process::Command;
    Command::new("explorer")
        .args(["/select,", &format!("\"{}\"", path)])
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn reveal_impl(path: &str) -> Result<(), String> {
    use std::process::Command;
    Command::new("open")
        .args(["-R", path])
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn reveal_impl(path: &str) -> Result<(), String> {
    use std::process::Command;
    let dir = Path::new(path).parent().unwrap_or_else(|| Path::new("/"));
    Command::new("xdg-open")
        .arg(dir)
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn copy_image_impl(bytes: Vec<u8>) -> Result<(), String> {
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let mut board = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    board
        .set_image(arboard::ImageData {
            width: w as usize,
            height: h as usize,
            bytes: Cow::Owned(rgba.into_raw()),
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============ 启动 ============

#[cfg(desktop)]
fn build_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let browse = MenuItem::with_id(app, "browse", "浏览图片", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &browse, &quit])?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("绿角犀看图")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "browse" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // 第二个实例：WebView 已加载完成，直接事件转发
            dbg_log(&format!("[single-instance] raw args={:?}", args));
            if args.len() > 1 {
                // 先重接可能被空格/括号拆开的路径 token，避免整批收集 0 张
                let paths = rejoin_existing(args[1..].to_vec());
                let win_labels: Vec<String> = app.webview_windows().keys().cloned().collect();
                dbg_log(&format!("[single-instance] windows={:?}", win_labels));
                let target = app.get_webview_window("main").or_else(|| {
                    app.webview_windows().values().next().cloned()
                });
                match target {
                    Some(w) => {
                        // 确保窗口被唤起（最小化到托盘也能看到图片），再转发事件
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                        let r = w.emit("open-file", paths.clone());
                        dbg_log(&format!(
                            "[single-instance] emit={:?} paths={:?}",
                            r.as_ref().map(|_| "sent"),
                            paths
                        ));
                        // 兜底：若前端 'open-file' 监听器偶尔未就绪导致 emit 丢失，
                        // 暂存一份，供前端启动期重试拉取补投（loadPaths 幂等，重复加载无害）
                        stash_pending(paths.clone());
                    }
                    None => {
                        // 窗口窗口尚未就绪（或已销毁）：暂存，供前端启动后拉取
                        stash_pending(paths.clone());
                        dbg_log("[single-instance] window=None, stashed pending");
                    }
                }
            }
        }))
        .setup(|app| {
            #[cfg(desktop)]
            build_tray(app)?;

            // 首次启动的命令行参数（双击关联文件 / 文件夹 / 右键菜单）：
            // 此时 WebView 尚未加载完成，emit 会丢失，先存入 pending 缓存，
            // 由前端启动后 invoke get_pending_paths 主动拉取。
            let args: Vec<String> = std::env::args().collect();
            dbg_log(&format!("[setup] raw args = {:?}", args));
            if args.len() > 1 {
                stash_pending(rejoin_existing(args[1..].to_vec()));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_paths,
            first_thumb,
            set_wallpaper,
            reveal_in_explorer,
            copy_image,
            get_pending_paths,
            flog,
            list_archive_entries,
            read_archive_entry,
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ============ 扩展点说明（PRD 5.2 后端解码）============
// 当前 load_paths 对 HEIC / HEIF / RAW(CR2/NEF/ARW/DNG) / PSD 返回错误。
// 启用步骤：
//   1) Cargo.toml 解除 libheif-rs / rawler / psd 注释。
//   2) 在 decode_to_rgb 增加匹配分支，例如：
//      "heic" | "heif" => {
//          let ctx = libheif_rs::HeifContext::read_from_file(path.to_str().unwrap())?;
//          let handle = ctx.primary_image_handle()?;
//          let img = handle.decode(libheif_rs::ColorSpace::Rgb, false)?;
//          // 取交错 RGB(A) 像素 -> image::RgbImage
//      }
//   3) load_paths 的 else 分支改为调用 decode_to_rgb 而非返回错误。
// 解码后统一经 rgb_to_jpeg_data_url 转 data URL 给前端 <img>。
// touch 12:28:18: 强制重编译以重新内嵌前端资源
// touch 12:32:40: 重新内嵌

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_flat_lists_siblings_of_single_image() {
        use std::process::id;
        let dir = std::env::temp_dir().join(format!("lvjx_test_{}", id()));
        std::fs::create_dir_all(&dir).unwrap();
        for name in ["a.png", "b.jpg", "c.gif", "skip.txt"] {
            std::fs::write(dir.join(name), b"xx").unwrap();
        }
        let single = dir.join("b.jpg");
        let mut out: Vec<PathBuf> = Vec::new();
        collect_files(&single, &mut out);
        out.sort();
        let names: Vec<String> = out
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        // 打开 b.jpg 时应列出同目录下的 a.png / b.jpg / c.gif，跳过 .txt
        assert_eq!(
            names,
            vec![
                "a.png".to_string(),
                "b.jpg".to_string(),
                "c.gif".to_string()
            ]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_paths_skips_unsupported_sibling() {
        use std::process::id;
        let dir = std::env::temp_dir().join(format!("lvjx_t2_{}", id()));
        std::fs::create_dir_all(&dir).unwrap();
        let good = dir.join("good.png");
        std::fs::write(&good, [137, 80, 78, 71, 13, 10, 26, 10]).unwrap(); // PNG 魔数
        std::fs::write(dir.join("bad.psd"), b"xx").unwrap(); // PSD 扩展点：跳过
        std::fs::write(dir.join("real.heic"), b"heiHei").unwrap(); // HEIC：透传原始 data URL
        std::fs::write(dir.join("note.txt"), b"yy").unwrap(); // 非图片
        // 打开单张 good.png：跳过 bad.psd / note.txt，HEIC 透传为 data URL，且不报错
        let entries = tauri::async_runtime::block_on(crate::load_paths(vec![good.to_string_lossy().into_owned()], None))
            .expect("load_paths 不应因 unsupported 相邻图而报错");
        let names: Vec<String> = entries.iter().map(|e| e.name.clone()).collect();
        assert!(names.contains(&"good.png".to_string()));
        assert!(!names.contains(&"bad.psd".to_string()));
        assert!(names.contains(&"real.heic".to_string()));
        assert!(!names.contains(&"note.txt".to_string()));
        let heic = entries.iter().find(|e| e.name == "real.heic").unwrap();
        assert!(heic.url.starts_with("data:image/heic;base64,"), "HEIC 条目为 data URL 透传");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejoin_reassembles_space_split_path() {
        use std::process::id;
        let dir = std::env::temp_dir().join(format!("lvjx_t3_{}", id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("fall employee (3).png");
        std::fs::write(&file, b"xx").unwrap();

        // 模拟"未加引号 argv 被空格/括号拆开"传入两个 token
        let tokens = vec![dir.join("fall").to_string_lossy().into_owned(), "employee (3).png".to_string()];
        // 重组：应还原成真实存在的完整路径
        let got = rejoin_existing(tokens);
        assert!(
            got.iter().any(|p| p == &file.to_string_lossy().into_owned()),
            "重接后应包含原始完整路径，got={:?}",
            got
        );

        // 已是一个完整存在路径的 token 应原样保留
        let single = vec![file.to_string_lossy().into_owned()];
        assert_eq!(rejoin_existing(single), vec![file.to_string_lossy().into_owned()]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

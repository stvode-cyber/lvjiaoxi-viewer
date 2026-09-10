// 绿角犀看图桌面版 · 入口
// 编译/运行需 Rust 工具链 + Tauri CLI：在含本文件目录执行 `cargo tauri dev` / `cargo tauri build`
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lvjiaoxi_viewer_lib::run();
}

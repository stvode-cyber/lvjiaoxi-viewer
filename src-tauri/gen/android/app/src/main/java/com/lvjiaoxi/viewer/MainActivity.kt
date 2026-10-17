package com.lvjiaoxi.viewer

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts

/**
 * 自定义 MainActivity：
 * 1. enableEdgeToEdge() 沉浸式顶栏
 * 2. 处理外部 VIEW/SEND/SEND_MULTIPLE intent（用户从系统文件管理器点图让我们打开）
 *    —— 存一份 webView 引用（WryActivity.mWebView 是 private）
 *    —— intent.data (Uri) → evaluateJavascript 推给前端 window.__androidOpenFile(paths)
 * 3. SAF Picker（App 内"打开"按钮调起系统文件管理器）
 *    —— WebView.addJavascriptInterface 暴露 window.__AndroidBridge.pickSafFile(multiple)
 *    —— registerForActivityResult 现代 API（取代过时的 onActivityResult）
 *    —— takePersistableUriPermission 持久化 content:// 权限
 */
class MainActivity : TauriActivity() {

  private var webViewRef: WebView? = null
  // ⚠️ Bug-A 修复：WebView 还没 ready 时暂存 intent，等 onWebViewCreate 补调
  private var pendingIntent: Intent? = null
  // SAF Picker launcher（ActivityResultContracts 现代写法）
  private lateinit var safPickerLauncher: ActivityResultLauncher<Intent>

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webViewRef = webView
    // 强制开启 WebView 远程调试（开发期用，方便 Chrome DevTools 连手机看运行时 CSS）
    WebView.setWebContentsDebuggingEnabled(true)
    // ⚠️ Bug-B 修复：允许 WebView 访问 content:// 资源（Android 默认 false，会拦 fetch）
    webView.settings.allowContentAccess = true
    // SAF Bridge 注册：前端通过 window.__AndroidBridge.pickSafFile(true/false) 调起系统文件管理器
    webView.addJavascriptInterface(SafBridge(), "__AndroidBridge")
    // SAF launcher 初始化：一次注册，多次复用
    safPickerLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
      if (result.resultCode == RESULT_OK) {
        result.data?.let { data ->
          val uris = mutableListOf<Uri>()
          data.data?.let { uris.add(it) }
          data.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.addAll(it) }
          // 持久化读权限（FLAG_GRANT_READ + PERSISTABLE），App 重启后权限仍有效
          val flags = data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
          uris.forEach { webView.context.contentResolver.takePersistableUriPermission(it, flags) }
          if (uris.isNotEmpty()) {
            val paths = uris.map { it.toString() }
            val json = paths.joinToString(",") { "\"${it.toString().replace("\"", "\\\"")}\"" }
            runOnUiThread {
              webView.evaluateJavascript(
                "(function(){ if(window.__androidOpenFile) window.__androidOpenFile([$json]); })()",
                null
              )
            }
          }
        }
      }
    }
    // ⚠️ Bug-A 补调：WebView ready 后处理之前暂存的 intent
    pendingIntent?.let { handleIntent(it); pendingIntent = null }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    handleIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleIntent(intent)
  }

  private fun handleIntent(intent: Intent?) {
    if (intent == null) return
    val action = intent.action ?: return
    val uris = mutableListOf<Uri>()

    when (action) {
      Intent.ACTION_VIEW -> intent.data?.let { uris.add(it) }
      Intent.ACTION_SEND -> {
        if (intent.type?.startsWith("image/") == true)
          intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.add(it) }
      }
      Intent.ACTION_SEND_MULTIPLE -> {
        if (intent.type?.startsWith("image/") == true)
          intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.addAll(it) }
      }
    }

    if (uris.isEmpty()) return

    // 🔴 动作2：content:// 权限 flag 加固（WebView fetch 需要 READ 权限才能读 content:// URI）
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

    // ⚠️ Bug-A 修复：webViewRef 还没赋值 → 暂存 intent 等 onWebViewCreate 补调
    if (webViewRef == null) {
      pendingIntent = intent
      return
    }

    val paths = uris.map { it.toString() }
    val json = paths.joinToString(",") { "\"${it.replace("\"", "\\\"")}\"" }
    val js = """
      (function(){
        var paths = [$json];
        if(typeof window.__androidOpenFile === 'function'){
          window.__androidOpenFile(paths);
        } else {
          window.__pendingAndroidOpenFile = paths;
        }
      })()
    """.trimIndent()

    runOnUiThread {
      webViewRef?.evaluateJavascript(js, null)
    }
  }

  // ═══════════════════════════════════════════
  // SAF Bridge（JS 端 window.__AndroidBridge）
  // ═══════════════════════════════════════════

  /**
   * WebView.addJavascriptInterface 暴露给前端的 Bridge。
   * 前端点"打开"按钮时调：window.__AndroidBridge.pickSafFile(true)
   * 选完文件后通过 evaluateJavascript 推给已有的 __androidOpenFile 管线。
   */
  inner class SafBridge {
    @JavascriptInterface
    fun pickSafFile(multiple: Boolean) {
      runOnUiThread {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "image/*"
          putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        safPickerLauncher.launch(intent)
      }
    }
  }
}

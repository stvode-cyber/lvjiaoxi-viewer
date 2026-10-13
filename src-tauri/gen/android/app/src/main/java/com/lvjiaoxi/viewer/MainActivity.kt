package com.lvjiaoxi.viewer

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

/**
 * 自定义 MainActivity：
 * 1. enableEdgeToEdge() 沉浸式顶栏
 * 2. 处理外部 VIEW/SEND/SEND_MULTIPLE intent（用户从系统文件管理器点图让我们打开）
 *    —— 存一份 webView 引用（WryActivity.mWebView 是 private）
 *    —— intent.data (Uri) → evaluateJavascript 推给前端 window.__androidOpenFile(paths)
 */
class MainActivity : TauriActivity() {

  private var webViewRef: WebView? = null

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webViewRef = webView
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
}

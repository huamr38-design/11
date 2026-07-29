"use client";

import "./globals.css";
import { useEffect } from "react";

function clearLocalSiteData() {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // Ignore storage errors and still try to reload.
  }
  window.location.href = `/?recovered=${Date.now()}`;
}

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <main className="xc-error-page">
          <section className="xc-error-panel">
            <div className="xc-error-icon">!</div>
            <h1>网站加载异常</h1>
            <p>这通常是当前浏览器残留旧缓存或扩展注入导致的。服务器仍在运行。</p>
            <div className="xc-error-actions">
              <button type="button" onClick={reset}>重新加载</button>
              <button type="button" onClick={clearLocalSiteData}>清除本机缓存并重载</button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}

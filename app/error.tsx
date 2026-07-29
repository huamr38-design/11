"use client";

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

export default function Error({
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
    <main className="xc-error-page">
      <section className="xc-error-panel">
        <div className="xc-error-icon">!</div>
        <h1>页面加载异常</h1>
        <p>这通常是本机浏览器缓存了旧数据导致的，不是服务器关闭。</p>
        <div className="xc-error-actions">
          <button type="button" onClick={reset}>重新加载</button>
          <button type="button" onClick={clearLocalSiteData}>清除本机缓存并重载</button>
        </div>
      </section>
    </main>
  );
}

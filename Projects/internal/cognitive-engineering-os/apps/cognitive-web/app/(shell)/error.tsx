"use client";

// A page that lists tools could not read the catalog (GET /catalog down or a registry gap): say so, offer a retry.
export default function ShellError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card">
      <h2>這一頁暫時打不開</h2>
      <p className="sub">工具目錄讀不到（{error.message.slice(0, 160)}）。填寫頁與「我的專案」不受影響。</p>
      <div className="btns"><button type="button" className="btn primary" onClick={reset}>再試一次</button></div>
    </div>
  );
}

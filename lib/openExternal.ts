// PWA-safe 打开外部链接：必须在用户手势的同步调用栈内调用。
// 在 display: standalone 的 PWA 下，window.open 可能返回 null（无标签页系统），
// 此时回退到 location.href，让系统识别为 universal link 触发外部应用打开。
//
// ⚠️ 不能在 features 串里写 'noopener,noreferrer' —— 浏览器规范：一旦指定 noopener,
// window.open 即使成功打开也返回 null，会被下面的 popup-blocker fallback 误判，
// 导致当前页面也跳到目标 URL（"两个页面都变成 B 站"）。改为打开后手动断 opener。
export function openExternal(url: string): void {
  const win = window.open(url, '_blank');
  if (win) {
    try { win.opener = null; } catch { /* cross-origin 后访问会抛错，忽略即可 */ }
  } else {
    window.location.href = url;
  }
}

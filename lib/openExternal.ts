// PWA-safe 打开外部链接：必须在用户手势的同步调用栈内调用。
// 在 display: standalone 的 PWA 下，window.open 可能返回 null（无标签页系统），
// 此时回退到 location.href，让系统识别为 universal link 触发外部应用打开。
export function openExternal(url: string): void {
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    window.location.href = url;
  }
}

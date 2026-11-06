export const timeoutError = () => Object.assign(new Error('Đã quá thời gian xử lý. Vui lòng thử lại; các dữ liệu khác vẫn có thể sử dụng.'), { code: 'DEADLINE_EXCEEDED' });

// Reject even when a dependency ignores cancellation. Observe late rejections as well.
export async function bounded(work, { signal, timeoutMs = 10000 } = {}) {
  if (signal?.aborted) throw timeoutError();
  const controller = new AbortController();
  let timer;
  let onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => { controller.abort(); reject(timeoutError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(onAbort, timeoutMs);
    if (signal?.aborted) onAbort();
  });
  try {
    return await Promise.race([cancelled, Promise.resolve().then(() => work(controller.signal))]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

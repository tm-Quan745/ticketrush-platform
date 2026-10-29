const unavailableStatuses = new Set([502, 503, 504]);

export function isBackendUnavailable(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number' && unavailableStatuses.has(status)) return true;
  }
  return error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError');
}

export const backendUnavailableMessage =
  'Máy chủ đang khởi động hoặc tạm thời không kết nối được. Bản demo miễn phí có thể mất vài phút để sẵn sàng sau thời gian không hoạt động. Vui lòng chờ rồi thử lại.';

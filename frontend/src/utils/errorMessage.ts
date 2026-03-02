/**
 * 将 API 返回的 error.response.data.detail 转为可展示的字符串，避免把对象当 React 子节点渲染导致报错。
 * FastAPI 422 时 detail 多为数组: [{ type, loc, msg, input }]。
 */
export function formatApiErrorDetail(detail: unknown, fallback = '操作失败'): string {
  if (detail == null) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item: any) => {
      if (item && typeof item === 'object' && typeof item.msg === 'string') {
        const loc = Array.isArray(item.loc) ? item.loc.filter((x: any) => x !== 'body').join('.') : '';
        return loc ? `${loc}: ${item.msg}` : item.msg;
      }
      return String(item);
    });
    return parts.length > 0 ? parts.join('；') : fallback;
  }
  if (typeof detail === 'object' && detail !== null && 'msg' in (detail as object)) {
    return String((detail as { msg: unknown }).msg);
  }
  return fallback;
}

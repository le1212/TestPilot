import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

/**
 * API 返回的日期时间：转成本地时间显示，与真实时间一致。
 * - 带 Z 或 +00:00 等时区后缀：按该时区解析后转本地
 * - 无时区后缀（后端应统一返回带 Z 的 UTC；若未带则视为 UTC 再转本地）
 */
export function formatDateTime(t: string | undefined | null, format = 'YYYY-MM-DD HH:mm:ss'): string {
  if (t == null || t === '') return '-';
  const s = String(t).trim();
  const hasTz = /Z$|[\+\-]\d{2}:?\d{2}$/.test(s);
  const d = hasTz ? dayjs(s).local() : dayjs.utc(s).local();
  return d.isValid() ? d.format(format) : '-';
}

/** 仅返回日期部分 YYYY-MM-DD（本地），用于执行记录按日展示 */
export function formatDateOnly(t: string | undefined | null): string {
  return formatDateTime(t, 'YYYY-MM-DD');
}

/** 中文日期：2025年2月28日 */
export function formatDateOnlyZh(t: string | undefined | null): string {
  return formatDateTime(t, 'YYYY年M月D日');
}

/** 中文日期时间：2025年2月28日 14:30:00 */
export function formatDateTimeZh(t: string | undefined | null, format = 'YYYY年M月D日 HH:mm:ss'): string {
  return formatDateTime(t, format);
}

/** 将 YYYY-MM-DD 转为中文日期展示 */
export function formatIsoDateZh(isoDate: string | undefined | null): string {
  if (isoDate == null || isoDate === '') return '-';
  const d = dayjs(isoDate);
  return d.isValid() ? d.format('YYYY年M月D日') : '-';
}

/**
 * 时间工具。
 *
 * 「今日已审」需要按业务时区判断「今天」，而不是服务器时区
 * （Vercel 的服务器是 UTC，直接 new Date() 取日期会在北京时间早上 8 点前算错一天）。
 * 这里用 Intl 做时区换算，不引入 date-fns / dayjs 之类的依赖。
 */

export const APP_TIME_ZONE = process.env.APP_TIME_ZONE?.trim() || "Asia/Shanghai";

/** 把某个绝对时刻在指定时区下渲染成 YYYY-MM-DD */
export function localDayString(date: Date, timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 该时刻在指定时区下的「本地墙上时间」当作 UTC 毫秒数，用于反推时区偏移 */
function localAsUtc(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const hour = Number(map.hour) % 24; // en-US + hour12:false 可能给出 "24"
  return Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
}

/** 求「timeZone 时区下 YYYY-MM-DD 这一天 00:00:00」对应的绝对时刻 */
export function instantOfLocalDay(day: string, timeZone = APP_TIME_ZONE): Date {
  const target = Date.parse(`${day}T00:00:00.000Z`);
  let guess = target;
  for (let i = 0; i < 4; i += 1) {
    const offset = localAsUtc(guess, timeZone) - guess;
    const next = target - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function plusDays(day: string, days: number): string {
  const d = new Date(Date.parse(`${day}T00:00:00.000Z`));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface DayRange {
  /** 业务时区下今天的 YYYY-MM-DD */
  day: string;
  /** 今天 00:00:00（含） */
  start: Date;
  /** 明天 00:00:00（不含） */
  end: Date;
}

/** 业务时区下的「今天」区间，用于筛 reviewed_at */
export function todayRange(now = new Date(), timeZone = APP_TIME_ZONE): DayRange {
  const day = localDayString(now, timeZone);
  return {
    day,
    start: instantOfLocalDay(day, timeZone),
    end: instantOfLocalDay(plusDays(day, 1), timeZone),
  };
}

/** 展示用的时间格式：MM-DD HH:mm（同一天的列表里不需要年份） */
export function formatShort(iso: string | null | undefined, timeZone = APP_TIME_ZONE): string {
  if (!iso) return "--";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** 展示用的完整时间：YYYY-MM-DD HH:mm */
export function formatFull(iso: string | null | undefined, timeZone = APP_TIME_ZONE): string {
  if (!iso) return "--";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** 提交时间的相对描述，用于待审队列 */
export function fromNow(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "--";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

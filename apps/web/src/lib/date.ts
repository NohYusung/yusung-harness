const seoulDatePartsFormatter = new Intl.DateTimeFormat(
  "en-US-u-ca-gregory-nu-latn",
  {
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Seoul",
  },
);

function getPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const value = parts.find((part) => part.type === type)?.value;

  if (!value) {
    throw new RangeError(`Missing date part: ${type}`);
  }

  return value;
}

export function formatDashboardDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: ${value}`);
  }

  const parts = seoulDatePartsFormatter.formatToParts(date);
  const month = Number(getPart(parts, "month"));
  const day = Number(getPart(parts, "day"));
  const hour24 = Number(getPart(parts, "hour")) % 24;
  const minute = getPart(parts, "minute").padStart(2, "0");
  const dayPeriod = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 || 12;

  return `${month}월 ${day}일 ${dayPeriod} ${String(hour12).padStart(2, "0")}:${minute}`;
}

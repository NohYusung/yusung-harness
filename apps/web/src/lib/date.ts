const seoulDatePartsFormatter = new Intl.DateTimeFormat(
  "en-US-u-ca-gregory-nu-latn",
  {
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Seoul",
    year: "numeric",
  },
);

/** Intl formatToParts 결과에서 요청한 날짜 단위를 안전하게 꺼낸다. */
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

/** ISO 날짜 문자열을 Asia/Seoul 기준의 한국어 dashboard 날짜로 변환한다. */
export function formatDashboardDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: ${value}`);
  }

  const parts = seoulDatePartsFormatter.formatToParts(date);
  const year = Number(getPart(parts, "year"));
  const month = Number(getPart(parts, "month"));
  const day = Number(getPart(parts, "day"));
  const hour24 = Number(getPart(parts, "hour")) % 24;
  const minute = getPart(parts, "minute").padStart(2, "0");
  const dayPeriod = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 || 12;

  return `${year}년 ${month}월 ${day}일 ${dayPeriod} ${String(hour12).padStart(2, "0")}:${minute}`;
}

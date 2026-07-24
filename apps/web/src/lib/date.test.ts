import { afterEach, describe, expect, it } from "vitest";
import { formatDashboardDate } from "@/lib/date";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTimeZone;
});

describe("formatDashboardDate", () => {
  it("UTC 시각을 Asia/Seoul 기준의 결정적인 한국어 형식으로 변환한다", () => {
    expect(formatDashboardDate("2026-07-19T20:22:00.000Z")).toBe(
      "2026년 7월 20일 오전 05:22",
    );
    expect(formatDashboardDate("2026-07-20T03:00:00.000Z")).toBe(
      "2026년 7월 20일 오후 12:00",
    );
    expect(formatDashboardDate("2026-07-20T04:05:00.000Z")).toBe(
      "2026년 7월 20일 오후 01:05",
    );
  });

  it("UTC에서 Seoul로 변환할 때 연도가 넘어가면 Seoul의 연도를 표시한다", () => {
    expect(formatDashboardDate("2026-12-31T15:30:00.000Z")).toBe(
      "2027년 1월 1일 오전 12:30",
    );
  });

  it("실행 환경의 기본 time zone과 무관하게 같은 문자열을 반환한다", () => {
    process.env.TZ = "America/New_York";

    expect(formatDashboardDate("2026-07-19T15:07:00.000Z")).toBe(
      "2026년 7월 20일 오전 12:07",
    );
  });
});

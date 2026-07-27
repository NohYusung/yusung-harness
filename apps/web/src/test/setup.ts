import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/** Next.js가 build 시 해석하는 Server Action import를 jsdom에서도 로드할 수 있게 한다. */
vi.mock("server-only", () => ({}));

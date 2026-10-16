import { it, expect } from "vitest";
import { RecognitionPolicy, SessionGuard } from "../src/media/lifecycle";
it("stops a recognition restart storm and never retries denied permission", () => {
  const p = new RecognitionPolicy();
  expect([p.nextDelay(), p.nextDelay(), p.nextDelay(), p.nextDelay()]).toEqual([
    500,
    1000,
    2000,
    null,
  ]);
  p.deny();
  expect(p.nextDelay()).toBe(null);
});
it("rejects work after leave or another room begins", () => {
  const s = new SessionGuard();
  const old = s.begin();
  s.end();
  expect(s.current(old)).toBe(false);
  const fresh = s.begin();
  expect(s.current(fresh)).toBe(true);
  expect(s.current(old)).toBe(false);
});

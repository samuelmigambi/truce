import { describe, expect, it } from "vitest";
import { daysLeft, dueLabel, urgency } from "./deadlines";

const now = new Date("2026-10-28T09:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000);

describe("deadlines", () => {
  it("counts whole days left", () => {
    expect(daysLeft(inHours(72), now)).toBe(3);
    expect(daysLeft(inHours(73), now)).toBe(4);
  });

  it("ranks urgency", () => {
    expect(urgency(inHours(-1), now)).toBe("overdue");
    expect(urgency(inHours(20), now)).toBe("today");
    expect(urgency(inHours(60), now)).toBe("soon");
    expect(urgency(inHours(240), now)).toBe("later");
  });

  it("says it plainly", () => {
    expect(dueLabel(inHours(20), now)).toBe("Due in 20 hours");
    expect(dueLabel(inHours(0.5), now)).toBe("Due within the hour");
    expect(dueLabel(inHours(24), now)).toBe("Due in 24 hours");
    expect(dueLabel(inHours(25), now)).toBe("Due in 2 days");
    expect(dueLabel(inHours(72), now)).toBe("Due in 3 days");
    expect(dueLabel(inHours(-30), now)).toBe("Overdue by 1 day");
    expect(dueLabel(inHours(-60), now)).toBe("Overdue by 2 days");
  });
});

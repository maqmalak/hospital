import { describe, expect, it } from "vitest";
import { hoursText, stayState, type Bed } from "@/modules/ward/shared";

const bed = (over: Partial<Bed>): Bed => ({ name: "W-1", bed_no: "1", ward: "W", bed_type: "Standard", status: "Occupied", has_oxygen: 0, has_monitor: 0, ...over });

describe("ward stay state", () => {
  const now = new Date("2026-11-06T12:00:00").getTime();
  it("flags overdue past the expected discharge", () => expect(stayState(bed({ expected_discharge: "2026-11-06 10:00:00" }), now)).toBe("overdue"));
  it("flags expiring within 12 hours", () => expect(stayState(bed({ expected_discharge: "2026-11-06 20:00:00" }), now)).toBe("soon"));
  it("ignores free beds", () => expect(stayState(bed({ status: "Available", expected_discharge: "2026-11-01 10:00:00" }), now)).toBeNull());
  it("formats hours and days", () => { expect(hoursText(5 * 3600_000)).toBe("5h"); expect(hoursText(50 * 3600_000)).toBe("2d 2h"); });
});

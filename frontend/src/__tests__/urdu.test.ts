import { describe, expect, it } from "vitest";
import { toUrdu, translitWord } from "@/lib/urdu";

describe("urdu name auto-fill", () => {
  it("uses the dictionary for common names", () => {
    expect(toUrdu("Muhammad Ali Khan")).toBe("محمد علی خان");
    expect(toUrdu("Ayesha Siddiqui")).toBe("عائشہ صدیقی");
    expect(toUrdu("Dr. Usman Tariq")).toBe("ڈاکٹر عثمان طارق");
    expect(toUrdu("Abdul Rehman")).toBe("عبد رحمان");
    expect(toUrdu("Zia ur Rehman")).toContain("الرحمان");
  });
  it("falls back to phonetic rules", () => {
    expect(translitWord("Shahrukh")).toBe("شاہرخ");
    expect(translitWord("Nadir")).toBe("نادر");
    expect(translitWord("Kamaluddin")).toBe("کمالالدین");
  });
});

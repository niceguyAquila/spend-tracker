import { describe, expect, it } from "vitest";
import { splitLinkifyParts } from "@/lib/linkify-text";

describe("splitLinkifyParts", () => {
  it("returns empty array for empty string", () => {
    expect(splitLinkifyParts("")).toEqual([]);
  });

  it("returns plain text when there are no URLs", () => {
    expect(splitLinkifyParts("no links here")).toEqual([{ type: "text", value: "no links here" }]);
  });

  it("splits https URLs from surrounding text", () => {
    expect(splitLinkifyParts("see https://example.com/path for details")).toEqual([
      { type: "text", value: "see " },
      { type: "url", value: "https://example.com/path" },
      { type: "text", value: " for details" }
    ]);
  });

  it("splits http URLs", () => {
    expect(splitLinkifyParts("http://example.com")).toEqual([
      { type: "url", value: "http://example.com" }
    ]);
  });

  it("handles multiple URLs", () => {
    expect(splitLinkifyParts("a https://a.test b http://b.test c")).toEqual([
      { type: "text", value: "a " },
      { type: "url", value: "https://a.test" },
      { type: "text", value: " b " },
      { type: "url", value: "http://b.test" },
      { type: "text", value: " c" }
    ]);
  });

  it("keeps trailing punctuation outside the URL", () => {
    expect(splitLinkifyParts("visit https://example.com.")).toEqual([
      { type: "text", value: "visit " },
      { type: "url", value: "https://example.com" },
      { type: "text", value: "." }
    ]);
  });
});

import { describe, it, expect } from "vitest";
import type { ChatResponseEvent } from "../types/contract";

describe("ChatResponseEvent", () => {
  it("token event może zawierać contentType", () => {
    const event: ChatResponseEvent = {
      type: "token",
      text: "**hello**",
      contentType: "text/markdown",
    };
    expect(event.type).toBe("token");
    expect(event.contentType).toBe("text/markdown");
  });

  it("token event działa bez contentType (backward compat)", () => {
    const event: ChatResponseEvent = {
      type: "token",
      text: "hello",
    };
    expect(event.type).toBe("token");
    expect(event.contentType).toBeUndefined();
  });
});
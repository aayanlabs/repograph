import { describe, expect, it } from "vitest";

import { CORE_PACKAGE_NAME } from "./index.js";

describe("core package", () => {
  it("exposes a stable package boundary", () => {
    expect(CORE_PACKAGE_NAME).toBe("@repograph/core");
  });
});

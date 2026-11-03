import { describe, expect, it } from "vitest";
import { protocolErrorMessage } from "@/features/session/connectionMessages";

describe("protocolErrorMessage for a refusal", () => {
  it("names the permission the gateway says was missing", () => {
    expect(protocolErrorMessage("PERMISSION_DENIED", "x", { permission: "i_channel_join_power" })).toEqual({
      key: "permissionDeniedNamed",
      params: { permission: "i_channel_join_power" },
    });
  });

  it("falls back to the plain text without a name, or with something that is not a permission name", () => {
    expect(protocolErrorMessage("PERMISSION_DENIED", "x")).toEqual({ key: "err_PERMISSION_DENIED" });
    expect(protocolErrorMessage("PERMISSION_DENIED", "x", { permission: "<b>no</b>" })).toEqual({ key: "err_PERMISSION_DENIED" });
  });

  it("leaves other codes alone", () => {
    expect(protocolErrorMessage("CHANNEL_FULL", "x", { permission: "i_channel_join_power" })).toEqual({ key: "err_CHANNEL_FULL" });
  });
});

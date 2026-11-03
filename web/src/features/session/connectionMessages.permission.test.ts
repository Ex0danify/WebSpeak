import { describe, expect, it } from "vitest";
import { protocolErrorMessage } from "@/features/session/connectionMessages";

describe("protocolErrorMessage for a refusal", () => {
  it("keeps the plain sentence and carries the permission the gateway named as a param", () => {
    expect(protocolErrorMessage("PERMISSION_DENIED", "x", { permission: "i_channel_join_power" })).toEqual({
      key: "err_PERMISSION_DENIED",
      params: { permission: "i_channel_join_power" },
    });
  });

  it("carries nothing without a name, or with something that is not a permission name", () => {
    expect(protocolErrorMessage("PERMISSION_DENIED", "x")).toEqual({ key: "err_PERMISSION_DENIED" });
    expect(protocolErrorMessage("PERMISSION_DENIED", "x", { permission: "<b>no</b>" })).toEqual({ key: "err_PERMISSION_DENIED" });
  });

  it("leaves other codes alone", () => {
    expect(protocolErrorMessage("CHANNEL_FULL", "x", { permission: "i_channel_join_power" })).toEqual({ key: "err_CHANNEL_FULL" });
  });
});

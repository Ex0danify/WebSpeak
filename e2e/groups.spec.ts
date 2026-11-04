import { expect, test } from "./fixtures";
import { join, memberRow } from "./helpers";
import type { Gateway } from "../test/support/gateway";

// Server and channel groups on the real gateway and the fake TeamSpeak server: the icons in a member row and what you are told
// when one of your own groups changes. Built-in icon ids (300, 600, 200) need no file, so no transfer is faked.

const SERVER_GROUPS = [
  { id: 6, name: "Server Admin", isDefault: false, type: 1, sortId: 0, iconId: 300 },
  { id: 7, name: "Normal", isDefault: false, type: 1, sortId: 1, iconId: 600 },
  { id: 8, name: "Guest", isDefault: true, type: 1, sortId: 2, iconId: 0 },
];
const CHANNEL_GROUPS = [
  { id: 6, name: "Operator", isDefault: false, type: 1, sortId: 0, iconId: 200 },
  { id: 8, name: "Guest", isDefault: true, type: 1, sortId: 1, iconId: 0 },
];

function provide(gateway: Gateway) {
  gateway.ts.groups.server = SERVER_GROUPS;
  gateway.ts.groups.channel = CHANNEL_GROUPS;
}

const ownId = (gateway: Gateway, nickname: string) =>
  gateway.ts.created.find((client) => client.options.nickname === nickname)!.getClientId();

test.describe("server and channel groups", () => {
  test("a member row shows the server groups left and the channel group right behind a divider", async ({ page, gateway, script }) => {
    provide(gateway);
    const channel = script.channel("groups-row");
    const admin = script.member("groups-row-admin", channel);
    gateway.ts.updateMember(admin.id, { serverGroups: ["6", "7", "8"], channelGroupId: 6 });
    script.member("groups-row-plain", channel);
    await join(page, "groups-row-self");

    const row = memberRow(page, "groups-row-admin");
    const servers = row.getByRole("group", { name: "Server groups" });
    const channelGroup = row.getByRole("group", { name: "Channel group" });
    await expect(servers.getByRole("img")).toHaveCount(2);
    await expect(servers.getByRole("img", { name: "Server Admin" })).toBeVisible();
    await expect(servers.getByRole("img", { name: "Normal" })).toBeVisible();
    await expect(channelGroup.getByRole("img", { name: "Operator" })).toBeVisible();
    // Left to right: server groups, then the channel group.
    const [serversBox, channelBox] = [await servers.boundingBox(), await channelGroup.boundingBox()];
    expect(serversBox!.x + serversBox!.width).toBeLessThan(channelBox!.x);
    // The default group has no icon, and a member without groups shows nothing.
    await expect(memberRow(page, "groups-row-plain").getByRole("group", { name: "Server groups" })).toHaveCount(0);
    await expect(memberRow(page, "groups-row-plain").getByRole("group", { name: "Channel group" })).toHaveCount(0);
  });

  test("tells you when one of your server groups is given or taken, and not about the default group coming back", async ({
    page,
    gateway,
  }) => {
    provide(gateway);
    await join(page, "groups-own-server");
    const id = ownId(gateway, "groups-own-server");

    gateway.ts.updateMember(id, { serverGroups: ["8", "7"] });
    await expect(page.getByText("Server group assigned: Normal")).toBeVisible();

    gateway.ts.updateMember(id, { serverGroups: ["8"] });
    await expect(page.getByText("Server group revoked: Normal")).toBeVisible();
  });

  test("tells you about your channel group, falling back to the default being a revoke", async ({ page, gateway }) => {
    provide(gateway);
    await join(page, "groups-own-channel");
    const id = ownId(gateway, "groups-own-channel");
    // The first channel group of a session is no change, so give the default one before the real change.
    gateway.ts.updateMember(id, { channelGroupId: 8 });
    await expect(memberRow(page, "groups-own-channel")).toBeVisible();

    gateway.ts.updateMember(id, { channelGroupId: 6 });
    await expect(page.getByText("Channel group assigned: Operator")).toBeVisible();

    gateway.ts.updateMember(id, { channelGroupId: 8 });
    await expect(page.getByText("Channel group revoked: Operator")).toBeVisible();
  });

  test("stays silent about the groups of other members", async ({ page, gateway, script }) => {
    provide(gateway);
    const channel = script.channel("groups-others");
    const other = script.member("groups-others-bob", channel);
    await join(page, "groups-others-self");
    gateway.ts.updateMember(other.id, { serverGroups: ["7"], channelGroupId: 6 });
    await expect(memberRow(page, "groups-others-bob").getByRole("img", { name: "Normal" })).toBeVisible();
    await expect(page.getByText(/group (assigned|revoked)/)).toHaveCount(0);
  });
});

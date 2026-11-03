import { describe, expect, it } from "vitest";
import { cmd, startSession, WELCOME_CHANNELS } from "../../../../test/support/tsSessionScript.js";
import { TextPermission } from "./permissions.js";

// Shaped like the real list: group markers first, then one row per permission, the id is the position.
const list = (...names: string[]) =>
  cmd("notifypermissionlist", { group_id_end: 0 }, { group_id_end: 6 }, ...names.map((permname) => ({ permname, permdesc: "" })));
const values = (...pairs: [number, number][]) =>
  cmd("notifyclientneededpermissions", ...pairs.map(([permid, permvalue]) => ({ permid, permvalue })));

const NAMES = ["b_other", TextPermission.channel, TextPermission.server];
const CHANNEL = 2;
const SERVER = 3;

function welcomed() {
  const script = startSession(5);
  for (const text of WELCOME_CHANNELS) script.feed(text);
  script.events.length = 0;
  return script;
}

describe("text permissions", () => {
  it("allows writing while the server has not told us anything", () => {
    const { session } = welcomed();
    expect(session.self).toMatchObject({ canSendChannelText: true, canSendServerText: true });
  });

  it("allows writing while the names are missing, whatever the values say", () => {
    const { session, feed } = welcomed();
    feed(values([CHANNEL, 1]));
    expect(session.self).toMatchObject({ canSendChannelText: true, canSendServerText: true });
  });

  it("allows writing while the values are missing", () => {
    const { session, feed } = welcomed();
    feed(list(...NAMES));
    expect(session.self).toMatchObject({ canSendChannelText: true, canSendServerText: true });
  });

  it("treats a permission the server never mentioned as not granted", () => {
    const { session, feed } = welcomed();
    feed(list(...NAMES));
    feed(values([CHANNEL, 1]));
    expect(session.self).toMatchObject({ canSendChannelText: true, canSendServerText: false });
  });

  it("works with the values arriving before the names", () => {
    const { session, feed } = welcomed();
    feed(values([CHANNEL, 1]));
    feed(list(...NAMES));
    expect(session.self).toMatchObject({ canSendChannelText: true, canSendServerText: false });
  });

  it("grants a permission from a later update and keeps the others", () => {
    const { session, feed } = welcomed();
    feed(list(...NAMES));
    feed(values([CHANNEL, 1]));
    feed(values([SERVER, 1]));
    expect(session.self).toMatchObject({ canSendChannelText: true, canSendServerText: true });
  });

  it("revokes a permission the server sends again with 0", () => {
    const { session, feed } = welcomed();
    feed(list(...NAMES));
    feed(values([CHANNEL, 1], [SERVER, 1]));
    feed(values([SERVER, 0]));
    expect(session.self).toMatchObject({ canSendChannelText: true, canSendServerText: false });
  });

  it("reports a change, and nothing for rows it cannot read", () => {
    const { feed } = welcomed();
    expect(feed(list(...NAMES))).toEqual([{ type: "permissionsUpdated" }]);
    expect(feed(values([CHANNEL, 1]))).toEqual([{ type: "permissionsUpdated" }]);
    expect(feed(cmd("notifyclientneededpermissions", { permid: "x", permvalue: "y" }))).toEqual([]);
    expect(feed(cmd("notifypermissionlist", { group_id_end: 0 }))).toEqual([]);
  });

  it("takes the names from an answer that came as rows", () => {
    const { session, feed } = welcomed();
    expect(session.applyPermissionList(NAMES.map((permname) => ({ permname })))).toEqual([{ type: "permissionsUpdated" }]);
    expect(session.applyPermissionList([])).toEqual([]);
    feed(values([CHANNEL, 1]));
    expect(session.self).toMatchObject({ canSendChannelText: true, canSendServerText: false });
  });

  it("lists the reported permissions by name in id order, revoked ones with 0", () => {
    const { session, feed } = welcomed();
    expect(session.permissions).toEqual([]);
    feed(list(...NAMES));
    feed(values([SERVER, 1], [CHANNEL, 7]));
    expect(session.permissions).toEqual([
      { name: TextPermission.channel, value: 7 },
      { name: TextPermission.server, value: 1 },
    ]);
    feed(values([SERVER, 0]));
    expect(session.permissions.at(-1)).toEqual({ name: TextPermission.server, value: 0 });
  });

  it("leaves out values whose name is not known", () => {
    const { session, feed } = welcomed();
    feed(values([CHANNEL, 1], [99, 1]));
    expect(session.permissions).toEqual([]);
    feed(list(...NAMES));
    expect(session.permissions).toEqual([{ name: TextPermission.channel, value: 1 }]);
  });
});

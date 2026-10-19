import { describe, expect, it } from "vitest";
import { hashPassword } from "../handshake/clientInit.js";
import { buildCommand } from "../wire/commandText.js";
import {
  channelList,
  channelSubscribeAll,
  clientDisconnect,
  clientInfo,
  clientList,
  clientMove,
  clientPoke,
  clientUpdate,
  sendTextMessage,
  TextMessageTarget,
  version,
} from "./clientCommands.js";
import type { CommandRequest } from "./commandTracker.js";

const text = (request: CommandRequest) => buildCommand(request.name, request.params, request);

describe("client command builders", () => {
  it("builds the commands the gateway sends today", () => {
    expect(text(clientMove({ clientId: 3, channelId: 12n }))).toBe("clientmove clid=3 cid=12");
    expect(text(clientMove({ clientId: 3, channelId: 12n, password: "pw" }))).toBe(`clientmove clid=3 cid=12 cpw=${hashPassword("pw")}`);
    expect(text(clientPoke(5, "hi | there"))).toBe("clientpoke clid=5 msg=hi\\s\\p\\sthere");
    expect(text(sendTextMessage(TextMessageTarget.channel, 0n, "a\tb"))).toBe("sendtextmessage targetmode=2 target=0 msg=a\\tb");
    expect(text(sendTextMessage(TextMessageTarget.client, 9, "x"))).toBe("sendtextmessage targetmode=1 target=9 msg=x");
    expect(text(channelSubscribeAll())).toBe("channelsubscribeall");
    expect(text(clientList())).toBe("clientlist -uid -away -voice -groups");
    expect(text(clientList(["uid"]))).toBe("clientlist -uid");
    expect(text(clientInfo(65535))).toBe("clientinfo clid=65535");
    expect(text(channelList())).toBe("channellist");
    expect(text(version())).toBe("version");
    expect(text(clientDisconnect())).toBe("clientdisconnect reasonid=8 reasonmsg=leaving");
    expect(text(clientDisconnect("bye now"))).toBe("clientdisconnect reasonid=8 reasonmsg=bye\\snow");
  });

  it("writes only the client properties it is given, in a fixed order", () => {
    expect(text(clientUpdate({ inputMuted: true }))).toBe("clientupdate client_input_muted=1");
    expect(text(clientUpdate({ awayMessage: "brb", away: true, outputMuted: false, nickname: "Ex 0" }))).toBe(
      "clientupdate client_nickname=Ex\\s0 client_output_muted=0 client_away=1 client_away_message=brb",
    );
    expect(text(clientUpdate({ away: false, awayMessage: "" }))).toBe("clientupdate client_away=0 client_away_message=");
    expect(() => clientUpdate({})).toThrow(/at least one/);
  });

  it("refuses ids outside the protocol range", () => {
    for (const id of [0, -1, 65536, 1.5, Number.NaN]) {
      expect(() => clientInfo(id)).toThrow(TypeError);
      expect(() => clientPoke(id, "x")).toThrow(TypeError);
    }
    expect(() => clientMove({ clientId: 3, channelId: -1n })).toThrow(/channel id/);
    expect(() => clientMove({ clientId: 3, channelId: 1n << 64n })).toThrow(/channel id/);
  });
});

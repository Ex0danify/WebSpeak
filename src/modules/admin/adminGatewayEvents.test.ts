import { describe, expect, it } from "vitest";
import { useDatabaseFixture } from "../../../test/support/database.js";
import { GatewayEvents } from "./adminGatewayEvents.js";

const fx = useDatabaseFixture();

function setup() {
  const database = fx.open();
  const clock = { now: 1_000_000 };
  const events = new GatewayEvents(database, () => clock.now);
  const logged = () => database.listAudit({ limit: 50, offset: 0, categories: ["system"] }).events.map((event) => event.event);
  return { database, clock, events, logged };
}

describe("gateway events", () => {
  it("writes start and stop as system events", () => {
    const { events, database } = setup();
    events.started("1.2.3");
    events.stopped("SIGTERM");
    expect(database.listAudit({ limit: 2, offset: 0 }).events).toMatchObject([
      { event: "GATEWAY_STOPPED", category: "system", severity: "info", details: { signal: "SIGTERM" } },
      { event: "GATEWAY_STARTED", details: { version: "1.2.3" } },
    ]);
  });

  it("writes the same error once a minute, and another error right away", () => {
    const { events, clock, logged } = setup();
    events.error("request", "boom");
    events.error("request", "boom");
    events.error("process", "other");
    expect(logged()).toEqual(["GATEWAY_ERROR", "GATEWAY_ERROR"]);
    clock.now += 61_000;
    events.error("request", "boom");
    expect(logged()).toHaveLength(3);
  });

  it("cuts a long error message", () => {
    const { events, database } = setup();
    events.error("process", "x".repeat(1000));
    expect(database.listAudit({ limit: 1, offset: 0 }).events[0]?.details.message as string).toHaveLength(300);
  });

  it("writes a full gateway at most once a minute", () => {
    const { events, clock, database } = setup();
    for (let i = 0; i < 5; i++) events.capacityReached(100);
    expect(database.listAudit({ limit: 10, offset: 0 }).events).toMatchObject([
      { event: "CAPACITY_REACHED", severity: "warning", details: { maxSessions: 100 } },
    ]);
    clock.now += 61_000;
    events.capacityReached(100);
    expect(database.listAudit({ limit: 10, offset: 0 }).total).toBe(2);
  });

  it("does not throw when the database is already closed", () => {
    const { events, database } = setup();
    database.close();
    expect(() => events.stopped("SIGINT")).not.toThrow();
  });
});

import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { AdminSessionStore } from "./adminSession.js";

function cookieJar() {
  const cookies: string[] = [];
  const response = { cookie: (_name: string, value: string) => cookies.push(value) } as unknown as Response;
  const request = (index: number) => ({ headers: { cookie: `webspeak_admin=${cookies[index]}` } }) as Request;
  return { response, request };
}

describe("AdminSessionStore", () => {
  it("serves a session until it expires", () => {
    const jar = cookieJar();
    const store = new AdminSessionStore();
    const { expiresAt } = store.create(jar.response, false, 0);
    expect(store.get(jar.request(0), expiresAt - 1)).not.toBeNull();
    expect(store.get(jar.request(0), expiresAt)).toBeNull();
  });

  it("drops expired sessions when a new one is created", () => {
    const jar = cookieJar();
    const store = new AdminSessionStore();
    const { expiresAt } = store.create(jar.response, false, 0);
    store.create(jar.response, false, expiresAt + 1);
    expect(store.get(jar.request(0), 0)).toBeNull();
    expect(store.get(jar.request(1), expiresAt + 1)).not.toBeNull();
  });

  it("ends every session when the epoch changes", () => {
    const jar = cookieJar();
    let epoch = "a";
    const store = new AdminSessionStore(() => epoch);
    store.create(jar.response, false, 0);
    expect(store.get(jar.request(0), 1)).not.toBeNull();
    epoch = "b";
    expect(store.get(jar.request(0), 1)).toBeNull();
    store.create(jar.response, false, 2);
    expect(store.get(jar.request(1), 3)).not.toBeNull();
  });
});

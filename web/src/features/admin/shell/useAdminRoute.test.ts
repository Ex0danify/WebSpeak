import { createPinia } from "pinia";
import { createApp, reactive } from "vue";
import { routeLocationKey, routerKey } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminNavRoutes, adminRoutes } from "@/features/admin/shell/adminRoutes";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import { useAdminRoute } from "@/features/admin/shell/useAdminRoute";

const route = reactive({ path: "/admin" });
const replace = vi.fn(async (to: string) => {
  route.path = to;
});

// The composable and the session store it reads look the router up the way a component would.
function mount() {
  const app = createApp({});
  const pinia = createPinia();
  app.use(pinia);
  app.provide(routerKey, { replace } as never);
  app.provide(routeLocationKey, route as never);
  return {
    session: app.runWithContext(() => useAdminSessionStore(pinia)),
    use: () => app.runWithContext(() => useAdminRoute()),
  };
}

let session: ReturnType<typeof mount>["session"];
let use: ReturnType<typeof mount>["use"];
beforeEach(() => {
  ({ session, use } = mount());
  replace.mockClear();
  route.path = "/admin";
  session.screen = "admin";
});

describe("adminRoutes", () => {
  it("has one entry per path, home first", () => {
    expect(adminRoutes[0]!.path).toBe("/admin");
    expect(new Set(adminRoutes.map((entry) => entry.path)).size).toBe(adminRoutes.length);
  });

  it("names the four pages in the order of the nav, then the sub-views", () => {
    expect(adminNavRoutes.map((entry) => entry.titleKey)).toEqual(["dashboard", "gateway", "users", "diagnostics"]);
    expect(adminRoutes.filter((entry) => entry.parent).map((entry) => [entry.path, entry.parent])).toEqual([
      ["/admin/users/invites", "/admin/users"],
      ["/admin/users/sessions", "/admin/users"],
    ]);
  });

  it("gives every sub-view a page that is in the nav", () => {
    for (const entry of adminRoutes.filter((candidate) => candidate.parent)) {
      expect(adminNavRoutes.map((page) => page.path)).toContain(entry.parent);
    }
  });
});

describe("useAdminRoute", () => {
  it("picks the page of the current path", () => {
    route.path = "/admin/diagnostics";
    expect(use().current.value.titleKey).toBe("diagnostics");
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows a sub-view at its own path without correcting the address", () => {
    route.path = "/admin/users/invites";
    expect(use().current.value.parent).toBe("/admin/users");
    expect(replace).not.toHaveBeenCalled();
  });

  it("treats the paths of the retired pages like any unknown path", () => {
    route.path = "/admin/operations";
    expect(use().current.value.path).toBe("/admin");
    expect(replace).toHaveBeenCalledWith("/admin");
  });

  it("shows home for an unknown path and moves the address to it", () => {
    route.path = "/admin/nope";
    const { current } = use();
    expect(current.value.path).toBe("/admin");
    expect(replace).toHaveBeenCalledWith("/admin");
    expect(route.path).toBe("/admin");
  });

  it("leaves the address alone while the sign-in screens are showing", () => {
    session.screen = "login";
    route.path = "/admin/login";
    use();
    expect(replace).not.toHaveBeenCalled();
  });
});

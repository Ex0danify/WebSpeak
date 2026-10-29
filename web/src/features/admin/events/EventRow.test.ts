import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { AdminEvent } from "@/features/admin/core/adminTypes";
import EventRow from "@/features/admin/events/EventRow.vue";
import { useI18n } from "@/shared/i18n/useI18n";

const { t } = useI18n();

const event = (overrides: Partial<AdminEvent>): AdminEvent => ({
  id: 1,
  event: "SERVER_ADDED",
  category: "config",
  severity: "info",
  details: { name: "Main", target: "ts.example.org:9987" },
  createdAt: "2026-10-29T10:00:00.000Z",
  ...overrides,
});

describe("EventRow", () => {
  it("shows what happened, where, and when, without a chip for an ordinary event", () => {
    const wrapper = mount(EventRow, { props: { event: event({}) } });
    expect(wrapper.find("strong").text()).toBe(t("serverAddedEvent"));
    expect(wrapper.text()).toContain("Main · ts.example.org:9987");
    expect(wrapper.find("time").attributes("datetime")).toBe("2026-10-29T10:00:00.000Z");
    expect(wrapper.find("span.bg-accent-soft").exists()).toBe(true);
    expect(wrapper.text()).not.toContain(t("eventSeverityError"));
    expect(wrapper.text()).not.toContain(t("eventSeverityWarning"));
  });

  it("writes a warning and an error out in a chip, not only in a tint", () => {
    const warning = mount(EventRow, {
      props: { event: event({ event: "ADMIN_LOGIN_FAILED", category: "auth", severity: "warning", details: {} }) },
    });
    expect(warning.text()).toContain(t("eventSeverityWarning"));
    expect(warning.find("span.bg-warning-soft").exists()).toBe(true);
    const error = mount(EventRow, {
      props: { event: event({ event: "GATEWAY_ERROR", category: "system", severity: "error", details: { message: "boom" } }) },
    });
    expect(error.text()).toContain(t("eventSeverityError"));
    expect(error.text()).toContain("boom");
    expect(error.find("span.bg-danger-soft").exists()).toBe(true);
  });

  it("lists each changed field", () => {
    const wrapper = mount(EventRow, {
      props: {
        event: event({
          event: "SETTINGS_CHANGED",
          details: {
            changes: [
              { field: "siteName", from: "Old", to: "New" },
              { field: "unknownField", from: 1, to: 2 },
            ],
          },
        }),
      },
    });
    const lines = wrapper.findAll("ul li");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text()).toContain("Old");
    expect(lines[0]!.text()).toContain("New");
  });
});

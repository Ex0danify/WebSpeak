import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PermissionList from "@/features/room/profile/PermissionList.vue";
import type { PermissionEntry } from "@/features/session";

const entries: PermissionEntry[] = [
  { name: "b_client_server_textmessage_send", value: 0 },
  { name: "b_client_channel_textmessage_send", value: 1 },
  { name: "i_client_talk_power", value: 75 },
];

const names = (wrapper: ReturnType<typeof mount>) => wrapper.findAll("li code").map((code) => code.text());

describe("PermissionList", () => {
  it("says so while the server has not reported anything", () => {
    const wrapper = mount(PermissionList, { props: { permissions: [] } });
    expect(wrapper.text()).toContain("has not reported any permissions");
    expect(wrapper.find("ul").exists()).toBe(false);
  });

  it("lists the permissions by name, sorted", () => {
    const wrapper = mount(PermissionList, { props: { permissions: entries } });
    expect(names(wrapper)).toEqual(["b_client_channel_textmessage_send", "b_client_server_textmessage_send", "i_client_talk_power"]);
  });

  it("shows flags as granted or not and numbers as they are", () => {
    const rows = mount(PermissionList, { props: { permissions: entries } }).findAll("li");
    expect(rows[0].text()).toContain("Granted");
    expect(rows[1].text()).toContain("Not granted");
    expect(rows[2].text()).toContain("75");
    expect(rows[2].text()).not.toContain("Granted");
  });

  it("filters by the search text, ignoring case", async () => {
    const wrapper = mount(PermissionList, { props: { permissions: entries } });
    await wrapper.find("input").setValue("SERVER");
    expect(names(wrapper)).toEqual(["b_client_server_textmessage_send"]);
    await wrapper.find("input").setValue("nothing like it");
    expect(wrapper.text()).toContain("No permission matches");
  });

  it("follows the list when the server changes a permission", async () => {
    const wrapper = mount(PermissionList, { props: { permissions: entries } });
    await wrapper.setProps({ permissions: [{ name: "b_client_server_textmessage_send", value: 1 }] });
    expect(wrapper.findAll("li")).toHaveLength(1);
    expect(wrapper.find("li").text()).toContain("Granted");
  });
});

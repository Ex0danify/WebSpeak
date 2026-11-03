import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import DisplaySettingsPopover from "@/features/room/shell/DisplaySettingsPopover.vue";
import { useI18n } from "@/shared/i18n/useI18n";

afterEach(() => {
  document.body.innerHTML = "";
});

async function open(themeMode: "system" | "light" | "dark" = "system") {
  const wrapper = mount(DisplaySettingsPopover, { props: { themeMode }, attachTo: document.body });
  await wrapper.get("button").trigger("click");
  return wrapper;
}

const radio = (name: string) => document.body.querySelector<HTMLElement>(`[role="radio"][aria-label="${name}"]`);

describe("DisplaySettingsPopover", () => {
  it("is a settings button that opens a panel with a theme choice and a language dropdown", async () => {
    const wrapper = await open();
    expect(wrapper.get("button").attributes("aria-label")).toBe("Settings");
    expect(document.body.querySelectorAll('[role="radio"]')).toHaveLength(3);
    expect(document.body.querySelector('[role="combobox"]')?.getAttribute("aria-label")).toBe("Language");
    wrapper.unmount();
  });

  it("checks the current theme", async () => {
    const wrapper = await open("dark");
    expect(radio("Dark")?.getAttribute("aria-checked")).toBe("true");
    expect(radio("System")?.getAttribute("aria-checked")).toBe("false");
    wrapper.unmount();
  });

  it("emits the chosen theme", async () => {
    const wrapper = await open("system");
    radio("Light")?.click();
    expect(wrapper.emitted("select-theme")).toEqual([["light"]]);
    wrapper.unmount();
  });

  it("switches the language from the dropdown and says so", async () => {
    const { language } = useI18n();
    const wrapper = await open();
    const trigger = document.body.querySelector<HTMLElement>('[role="combobox"]')!;
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
    await nextTick();
    const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find((el) =>
      el.textContent?.includes("Deutsch"),
    );
    option?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "mouse" }));
    await nextTick();
    expect(language.value).toBe("de");
    expect(wrapper.emitted("language-change")).toHaveLength(1);
    language.value = "en";
    wrapper.unmount();
  });
});

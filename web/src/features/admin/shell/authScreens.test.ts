import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import AdminChangePasswordScreen from "@/features/admin/shell/AdminChangePasswordScreen.vue";
import AdminLoginScreen from "@/features/admin/shell/AdminLoginScreen.vue";
import { useI18n } from "@/shared/i18n/useI18n";

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => ({ path: "/admin" }),
  useRouter: () => ({ replace: vi.fn() }),
}));

const { t } = useI18n();

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  registerAdminStores();
  const session = useAdminSessionStore();
  const login = vi.fn();
  const changePassword = vi.fn();
  // The screens take the actions when they are set up, so they are replaced before they mount.
  Object.assign(session, { login, changePassword });
  return { session, feedback: useAdminFeedbackStore(), login, changePassword, pinia };
}

const labelled = (wrapper: ReturnType<typeof mount>, input: ReturnType<ReturnType<typeof mount>["find"]>) =>
  wrapper.find(`label[for="${input.attributes("id")}"]`).exists();

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("AdminLoginScreen", () => {
  const mountScreen = (pinia: ReturnType<typeof createPinia>) =>
    mount(AdminLoginScreen, { global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } } });

  it("names both fields and hands what is typed to the session", async () => {
    const { session, pinia } = setup();
    const wrapper = mountScreen(pinia);
    expect(wrapper.find("h1").text()).toBe(t("welcomeAdmin"));
    const [user, password] = wrapper.findAll("input");
    expect(labelled(wrapper, user!)).toBe(true);
    expect(labelled(wrapper, password!)).toBe(true);
    expect(password!.attributes("type")).toBe("password");
    await user!.setValue("anna");
    await password!.setValue("correct horse");
    expect(session.loginUsername).toBe("anna");
    expect(session.loginPassword).toBe("correct horse");
  });

  it("signs in on submit and shows the error of a refused attempt", async () => {
    const { feedback, login, pinia } = setup();
    const wrapper = mountScreen(pinia);
    expect(wrapper.text()).not.toContain("Wrong password");
    await wrapper.find("form").trigger("submit");
    expect(login).toHaveBeenCalledOnce();
    feedback.errorMessage = "Wrong password";
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Wrong password");
  });
});

describe("AdminChangePasswordScreen", () => {
  const mountScreen = (pinia: ReturnType<typeof createPinia>) => mount(AdminChangePasswordScreen, { global: { plugins: [pinia] } });

  it("names both fields and hands what is typed to the session", async () => {
    const { session, pinia } = setup();
    const wrapper = mountScreen(pinia);
    expect(wrapper.find("h1").text()).toBe(t("changePasswordTitle"));
    const [fresh, confirm] = wrapper.findAll("input");
    expect(labelled(wrapper, fresh!)).toBe(true);
    expect(labelled(wrapper, confirm!)).toBe(true);
    await fresh!.setValue("a long and unusual phrase 42!");
    await confirm!.setValue("a long and unusual phrase 42!");
    expect(session.newPassword).toBe("a long and unusual phrase 42!");
    expect(session.confirmNewPassword).toBe("a long and unusual phrase 42!");
  });

  it("shows how strong the password is and saves it on submit", async () => {
    const { session, changePassword, pinia } = setup();
    const wrapper = mountScreen(pinia);
    const bar = wrapper.find("i");
    await wrapper.findAll("input")[0]!.setValue("a");
    const weak = parseFloat(/width:\s*([\d.]+)%/.exec(bar.attributes("style") ?? "")?.[1] ?? "NaN");
    await wrapper.findAll("input")[0]!.setValue("a long and unusual phrase 42!");
    const strong = parseFloat(/width:\s*([\d.]+)%/.exec(bar.attributes("style") ?? "")?.[1] ?? "NaN");
    expect(strong).toBeGreaterThan(weak);
    expect(session.passwordStrength).toBe(strong);
    await wrapper.find("form").trigger("submit");
    expect(changePassword).toHaveBeenCalledOnce();
  });

  it("shows the error of a refused change", async () => {
    const { feedback, pinia } = setup();
    const wrapper = mountScreen(pinia);
    feedback.errorMessage = "Too short";
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Too short");
  });
});

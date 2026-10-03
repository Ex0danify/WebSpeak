import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia } from "pinia";
import { h } from "vue";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";

/** Mounts the client the way main.ts does: ClientLayout owns the session and the routes swap the join page
 *  and the room. `page` is the join page, which is what shows until a session is connected. */
export async function mountClient(): Promise<{ wrapper: VueWrapper; page: unknown }> {
  // Imported here so a test can stub browser globals before the view modules load.
  const { clientRoutes } = await import("@/views/clientRoutes");
  const JoinView = (await import("@/views/JoinView.vue")).default;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: clientRoutes,
  });
  await router.push("/");
  await router.isReady();
  const wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [createPinia(), router] } });
  await flushPromises();
  return { wrapper, page: wrapper.findComponent(JoinView).vm };
}

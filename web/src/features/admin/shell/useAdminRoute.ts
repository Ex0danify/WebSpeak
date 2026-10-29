import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import { adminRoutes } from "@/features/admin/shell/adminRoutes";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";

/** The console page for the current path. A path that is no page (a typo, a trailing slash) shows the home page, and the address
 *  is corrected to it so the URL always names what is on screen. */
export function useAdminRoute() {
  const route = useRoute();
  const router = useRouter();
  const { screen } = storeToRefs(useAdminSessionStore());

  const known = computed(() => adminRoutes.find((entry) => entry.path === route.path));
  const current = computed(() => known.value ?? adminRoutes[0]!);

  // Only once signed in: the login and change-password paths are not pages, the session store moves the address off them itself.
  watch(
    [screen, () => route.path],
    () => {
      if (screen.value === "admin" && !known.value) void router.replace(adminRoutes[0]!.path);
    },
    { immediate: true },
  );

  return { current };
}

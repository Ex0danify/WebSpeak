import type { RouteRecordRaw } from "vue-router";
import { useSessionStore } from "@/features/session";
import ClientLayout from "@/views/ClientLayout.vue";
import JoinView from "@/views/JoinView.vue";

/** The client. `ClientLayout` owns the session for both pages, `/` is the join page and `/room` the connected room, and the
 *  layout moves between them as the session connects and ends. Layout and join page are in the entry chunk (every visit starts
 *  there), only the room loads on demand. */
export const clientRoutes: RouteRecordRaw[] = [
  {
    path: "/",
    component: ClientLayout,
    children: [
      { path: "", name: "join", component: JoinView },
      {
        path: "room",
        name: "room",
        component: () => import("@/views/RoomView.vue"),
        // A reload or a pasted link has no live session behind it, so there is nothing to show.
        beforeEnter: () => {
          const { state } = useSessionStore();
          return state.connected || state.reconnecting || state.reconnectFailed ? true : { name: "join" };
        },
      },
    ],
  },
  { path: "/join", redirect: (to) => ({ path: "/", query: to.query }) },
];

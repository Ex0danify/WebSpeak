import { nextTick } from "vue";
import { storeToRefs } from "pinia";
import { useAdminServerOrderStore } from "@/features/admin/gateway/adminServerOrder";
import { useAdminServersStore } from "@/features/admin/gateway/adminServers";

/** The drag, keyboard and focus handling of the server list. What a move does to the order is in adminServerOrder. */
export function useServerReorder() {
  const order = useAdminServerOrderStore();
  const { grabbed } = storeToRefs(order);
  const { servers } = storeToRefs(useAdminServersStore());

  // The handle of each row, to give the focus back after the row moved in the DOM.
  const handles = new Map<string, { $el?: HTMLElement } | HTMLElement>();
  function setHandle(id: string, el: unknown) {
    if (el) handles.set(id, el as HTMLElement);
    else handles.delete(id);
  }
  async function refocus(id: string) {
    await nextTick();
    const handle = handles.get(id);
    ((handle as { $el?: HTMLElement })?.$el ?? (handle as HTMLElement | undefined))?.focus();
  }

  async function onHandleKey(event: KeyboardEvent, id: string) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (grabbed.value === id) await order.dropServer();
      else order.grabServer(id);
    } else if (grabbed.value === id && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      order.shiftGrabbed(event.key === "ArrowUp" ? -1 : 1);
      await refocus(id);
    } else if (grabbed.value === id && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      order.cancelGrab();
    }
  }

  // Leaving for another control puts the server down. A blur without a target is the row moving in the DOM, not the person leaving.
  function onHandleBlur(event: FocusEvent) {
    if (event.relatedTarget) void order.dropServer();
  }

  // A tap moves one step and saves at once, there is no held state on touch.
  async function moveByButton(id: string, delta: number) {
    order.grabServer(id);
    order.shiftGrabbed(delta);
    await order.dropServer();
    await refocus(id);
  }

  function onDragStart(event: DragEvent, id: string) {
    order.grabServer(id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
    }
  }
  function onDragEnter(id: string) {
    if (grabbed.value) order.moveGrabbedTo(servers.value.findIndex((server) => server.id === id));
  }
  // A drag the browser cancelled (Esc, or released outside a drop target) reports no drop effect.
  function onDragEnd(event: DragEvent) {
    if (event.dataTransfer?.dropEffect === "none") order.cancelGrab();
    else void order.dropServer();
  }

  return { grabbed, setHandle, onHandleKey, onHandleBlur, moveByButton, onDragStart, onDragEnter, onDragEnd };
}

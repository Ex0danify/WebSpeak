import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAdminStores } from "@/features/admin/shell/adminStores";
import { useAdminServerOrderStore } from "@/features/admin/gateway/adminServerOrder";
import { useAdminServersStore } from "@/features/admin/gateway/adminServers";
import { useServerReorder } from "@/features/admin/gateway/useServerReorder";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/admin" }), useRouter: () => ({ replace: vi.fn() }) }));

const key = (name: string) => ({ key: name, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as KeyboardEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
};

function setup(grabbed: string | null = null) {
  const order = useAdminServerOrderStore();
  const actions = {
    grabServer: vi.fn(),
    dropServer: vi.fn(async () => {}),
    shiftGrabbed: vi.fn(),
    cancelGrab: vi.fn(),
    moveGrabbedTo: vi.fn(),
  };
  Object.assign(order, actions, { grabbed });
  Object.assign(useAdminServersStore(), { servers: [{ id: "a" }, { id: "b" }, { id: "c" }] });
  const focus = vi.fn();
  const reorder = useServerReorder();
  reorder.setHandle("a", { focus });
  return { actions, reorder, focus };
}

beforeEach(() => {
  setActivePinia(createPinia());
  registerAdminStores();
});

describe("useServerReorder keyboard", () => {
  it("picks a row up with Space or Enter and puts it down with the same key", async () => {
    const idle = setup();
    const space = key(" ");
    await idle.reorder.onHandleKey(space, "a");
    expect(idle.actions.grabServer).toHaveBeenCalledWith("a");
    expect(space.preventDefault).toHaveBeenCalled();

    setActivePinia(createPinia());
    registerAdminStores();
    const held = setup("a");
    await held.reorder.onHandleKey(key("Enter"), "a");
    expect(held.actions.dropServer).toHaveBeenCalled();
    expect(held.actions.grabServer).not.toHaveBeenCalled();
  });

  it("moves the held row with the arrows and gives the focus back to its handle", async () => {
    const { actions, reorder, focus } = setup("a");
    await reorder.onHandleKey(key("ArrowUp"), "a");
    await reorder.onHandleKey(key("ArrowDown"), "a");
    expect(actions.shiftGrabbed.mock.calls).toEqual([[-1], [1]]);
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it("focuses a handle that is a component by its element", async () => {
    const { reorder } = setup("a");
    const focus = vi.fn();
    reorder.setHandle("a", { $el: { focus } });
    await reorder.onHandleKey(key("ArrowDown"), "a");
    expect(focus).toHaveBeenCalledOnce();
  });

  it("forgets a handle that is gone", async () => {
    const { reorder, focus } = setup("a");
    reorder.setHandle("a", null);
    await reorder.onHandleKey(key("ArrowDown"), "a");
    expect(focus).not.toHaveBeenCalled();
  });

  it("cancels a held row on Escape without closing what is around it", async () => {
    const { actions, reorder } = setup("a");
    const escape = key("Escape");
    await reorder.onHandleKey(escape, "a");
    expect(actions.cancelGrab).toHaveBeenCalled();
    expect(escape.stopPropagation).toHaveBeenCalled();
  });

  it("ignores the arrows and Escape of a row that is not held, and any other key", async () => {
    const { actions, reorder } = setup("b");
    for (const name of ["ArrowUp", "Escape", "a"]) await reorder.onHandleKey(key(name), "a");
    expect(actions.shiftGrabbed).not.toHaveBeenCalled();
    expect(actions.cancelGrab).not.toHaveBeenCalled();
  });
});

describe("useServerReorder pointer", () => {
  it("puts the row down when the focus goes to another control, not when the row only moves", () => {
    const { actions, reorder } = setup("a");
    reorder.onHandleBlur({ relatedTarget: null } as FocusEvent);
    expect(actions.dropServer).not.toHaveBeenCalled();
    reorder.onHandleBlur({ relatedTarget: {} } as FocusEvent);
    expect(actions.dropServer).toHaveBeenCalledOnce();
  });

  it("moves one step and saves at once for a tap", async () => {
    const { actions, reorder, focus } = setup();
    await reorder.moveByButton("a", 1);
    expect(actions.grabServer).toHaveBeenCalledWith("a");
    expect(actions.shiftGrabbed).toHaveBeenCalledWith(1);
    expect(actions.dropServer).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
  });

  it("starts a drag as a move of the row", () => {
    const { actions, reorder } = setup();
    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    reorder.onDragStart({ dataTransfer } as unknown as DragEvent, "a");
    expect(actions.grabServer).toHaveBeenCalledWith("a");
    expect(dataTransfer.effectAllowed).toBe("move");
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "a");
    reorder.onDragStart({ dataTransfer: null } as unknown as DragEvent, "b");
    expect(actions.grabServer).toHaveBeenCalledWith("b");
  });

  it("moves the held row to the one it is dragged over", () => {
    const held = setup("a");
    held.reorder.onDragEnter("c");
    expect(held.actions.moveGrabbedTo).toHaveBeenCalledWith(2);

    setActivePinia(createPinia());
    registerAdminStores();
    const idle = setup();
    idle.reorder.onDragEnter("c");
    expect(idle.actions.moveGrabbedTo).not.toHaveBeenCalled();
  });

  it("drops the row on a drop and cancels a drag the browser gave up", () => {
    const { actions, reorder } = setup("a");
    reorder.onDragEnd({ dataTransfer: { dropEffect: "move" } } as unknown as DragEvent);
    expect(actions.dropServer).toHaveBeenCalledOnce();
    reorder.onDragEnd({ dataTransfer: { dropEffect: "none" } } as unknown as DragEvent);
    expect(actions.cancelGrab).toHaveBeenCalledOnce();
  });
});

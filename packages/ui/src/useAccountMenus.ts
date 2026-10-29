import { useEffect } from "react";

/** Dismiss without intercepting the action the person clicked outside. */
export function useAccountMenus(page: string) {
  useEffect(() => {
    const close = (target?: EventTarget | null) =>
      document
        .querySelectorAll<HTMLDetailsElement>("details.account-menu[open]")
        .forEach((menu) => {
          if (!(target instanceof Node) || !menu.contains(target))
            menu.open = false;
        });
    const pointer = (event: PointerEvent) => close(event.target);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const open = document.querySelector<HTMLDetailsElement>(
          "details.account-menu[open]",
        );
        close();
        open?.querySelector<HTMLElement>("summary")?.focus();
      }
    };
    const action = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".account-menu button")
      )
        close();
    };
    const focus = (event: FocusEvent) => close(event.target);
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    document.addEventListener("click", action);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
      document.removeEventListener("click", action);
      document.removeEventListener("focusin", focus);
    };
  }, []);
  useEffect(() => {
    document
      .querySelectorAll<HTMLDetailsElement>("details.account-menu[open]")
      .forEach((menu) => (menu.open = false));
  }, [page]);
}

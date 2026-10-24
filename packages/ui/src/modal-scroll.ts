import { useEffect } from "react";

export function useModalScrollLock() {
  useEffect(() => {
    let restore: (() => void) | undefined;
    const update = () => {
      const open = !!document.querySelector("dialog[open]");
      if (open && !restore) {
        const y = window.scrollY,
          body = document.body,
          html = document.documentElement;
        const before = [
          body.style.position,
          body.style.top,
          body.style.width,
          body.style.overflow,
          html.style.overflow,
        ];
        body.style.position = "fixed";
        body.style.top = `-${y}px`;
        body.style.width = "100%";
        body.style.overflow = "hidden";
        html.style.overflow = "hidden";
        restore = () => {
          [
            body.style.position,
            body.style.top,
            body.style.width,
            body.style.overflow,
            html.style.overflow,
          ] = before;
          window.scrollTo({ top: y, behavior: "instant" });
        };
      } else if (!open && restore) {
        restore();
        restore = undefined;
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
      childList: true,
    });
    update();
    return () => {
      observer.disconnect();
      restore?.();
    };
  }, []);
}

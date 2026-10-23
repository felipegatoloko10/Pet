import {
  currentMonitor,
  cursorPosition,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";

const sizeKey = "pingo:pet-window-size";
function bounded(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
export async function resizePet(
  factor: number,
  saved?: { width: number; height: number },
) {
  const window = getCurrentWindow();
  const [size, position, scale, monitor] = await Promise.all([
    window.innerSize(),
    window.outerPosition(),
    window.scaleFactor(),
    currentMonitor(),
  ]);
  const area = monitor?.workArea;
  const maxWidth = Math.min(650, area ? area.size.width / scale : 650);
  const maxHeight = Math.min(860, area ? area.size.height / scale : 860);
  const width = bounded(
    saved?.width ?? (size.width / scale) * factor,
    Math.min(280, maxWidth),
    maxWidth,
  );
  const height = bounded(
    saved?.height ?? (size.height / scale) * factor,
    Math.min(360, maxHeight),
    maxHeight,
  );
  await window.setSize(new LogicalSize(width, height));
  const resized = await window.innerSize();
  const x = position.x + size.width - resized.width,
    y = position.y + size.height - resized.height;
  await window.setPosition(
    new PhysicalPosition(
      Math.round(
        area
          ? bounded(
              x,
              area.position.x,
              area.position.x + area.size.width - resized.width,
            )
          : x,
      ),
      Math.round(
        area
          ? bounded(
              y,
              area.position.y,
              area.position.y + area.size.height - resized.height,
            )
          : y,
      ),
    ),
  );
}
export async function setupPetWindow() {
  let cancelled = false,
    polling = false,
    ignored = false;
  const window = getCurrentWindow();
  try {
    const raw = localStorage.getItem(sizeKey);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Number.isFinite(saved.width) && Number.isFinite(saved.height))
        await resizePet(1, saved);
    }
  } catch {
    /* A missing or invalid saved size uses the native default. */
  }
  const persist = await window.onResized(async ({ payload }) => {
    try {
      const scale = await window.scaleFactor();
      if (!cancelled)
        localStorage.setItem(
          sizeKey,
          JSON.stringify({
            width: payload.width / scale,
            height: payload.height / scale,
          }),
        );
    } catch {
      /* The window can close while a resize event is in flight. */
    }
  });
  async function hitTest() {
    if (polling || cancelled || document.hidden) return;
    polling = true;
    try {
      const [pointer, origin, scale] = await Promise.all([
        cursorPosition(),
        window.outerPosition(),
        window.scaleFactor(),
      ]);
      const target = document.elementFromPoint(
        (pointer.x - origin.x) / scale,
        (pointer.y - origin.y) / scale,
      );
      const next = !target?.closest("[data-pet-interactive]");
      if (next !== ignored && !cancelled) {
        await window.setIgnoreCursorEvents(next);
        ignored = next;
      }
    } catch {
      /* Keep the avatar usable when the OS cannot expose cursor position. */
    } finally {
      polling = false;
    }
  }
  const timer = setInterval(() => void hitTest(), 120);
  return () => {
    cancelled = true;
    clearInterval(timer);
    persist();
    void window.setIgnoreCursorEvents(false).catch(() => {});
  };
}

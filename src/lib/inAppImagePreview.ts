"use client";

/**
 * Full-screen image overlay — PDF preview jaisa footer (Close); WebView me bahar browser na khule.
 */
export function showInAppImagePreview(
  imageSrc: string,
  onDispose: () => void,
  options?: { title?: string }
): void {
  if (typeof document === "undefined") return;

  const title = options?.title ?? "Image preview";

  const root = document.createElement("div");
  root.setAttribute("data-in-app-image-preview", "1");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", title);
  root.tabIndex = -1;
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483646",
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui,-apple-system,sans-serif",
  } as CSSStyleDeclaration);

  const safeClose = () => {
    try {
      onDispose();
    } catch {
      /* ignore */
    }
    root.remove();
  };

  const bar = document.createElement("div");
  bar.setAttribute("role", "toolbar");
  bar.style.cssText =
    "display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-start;padding:12px 14px;padding-bottom:max(12px,env(safe-area-inset-bottom,0px));background:#1a1a1a;color:#fff;flex-shrink:0;box-shadow:0 -2px 10px rgba(0,0,0,0.35);border-top:1px solid #333";

  const titleEl = document.createElement("span");
  titleEl.textContent = title;
  titleEl.style.cssText =
    "flex:1;min-width:120px;font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:auto";

  const mkBtn = (label: string, primary?: boolean) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = [
      "padding:10px 16px",
      "border-radius:8px",
      "border:none",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
      primary ? "background:#ea580c;color:#fff" : "background:#333;color:#eee",
    ].join(";");
    return b;
  };

  const scrollHost = document.createElement("div");
  scrollHost.style.cssText =
    "flex:1;min-height:0;overflow:auto;background:#2a2a2a;padding:12px 8px;display:flex;align-items:center;justify-content:center;-webkit-overflow-scrolling:touch";

  const img = document.createElement("img");
  img.alt = "";
  img.src = imageSrc;
  img.style.cssText = "max-width:100%;width:auto;height:auto;max-height:min(85vh,100%);object-fit:contain;box-shadow:0 2px 12px rgba(0,0,0,0.4)";

  const err = document.createElement("p");
  err.style.cssText = "color:#e5e5e5;text-align:center;padding:24px;display:none";
  err.textContent = "Image load failed — try opening in browser from attachment link.";

  img.onerror = () => {
    err.style.display = "block";
    img.style.display = "none";
  };

  scrollHost.append(img, err);

  const closeBtn = mkBtn("Close");
  closeBtn.onclick = () => safeClose();

  const openBtn = mkBtn("Browser");
  openBtn.onclick = () => {
    window.open(imageSrc, "_blank", "noopener,noreferrer");
  };

  bar.append(titleEl, openBtn, closeBtn);
  root.append(scrollHost, bar);

  root.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      safeClose();
    }
  });

  document.body.appendChild(root);
  requestAnimationFrame(() => {
    try {
      root.focus();
    } catch {
      /* ignore */
    }
  });
}

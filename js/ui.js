import { id } from "./dom.js";
import { escapeHtml } from "./utils.js";

export function toast(msg, type = "info") {
    let wrap = id("toasts");
    if (!wrap) {
        wrap = document.createElement("div");
        wrap.id = "toasts";
        wrap.className = "toast toast-top toast-end z-999";
        document.body.appendChild(wrap);
    }

    const el = document.createElement("div");
    el.className =
        type === "success"
            ? "alert alert-success shadow-lg"
            : type === "error"
                ? "alert alert-error shadow-lg"
                : "alert alert-info shadow-lg";

    el.innerHTML = `<span>${escapeHtml(msg)}</span>`;
    wrap.appendChild(el);

    setTimeout(() => {
        el.remove();
        if (!wrap.children.length) wrap.remove();
    }, 2200);
}

export function bindDropdownRowToggle(menuId) {
    const menu = id(menuId);
    if (!menu || menu.dataset.rowToggleBound) return;
    menu.dataset.rowToggleBound = "1";

    menu.addEventListener("mousedown", (e) => {
        const row = e.target.closest("label");
        if (!row || !menu.contains(row)) return;
        const cb = row.querySelector('input[type="checkbox"]');
        if (!cb) return;
        if (e.target !== cb) {
            e.preventDefault();
            cb.focus({ preventScroll: true });
        }
    });

    menu.addEventListener("click", (e) => {
        const row = e.target.closest("label");
        if (!row || !menu.contains(row)) return;
        const cb = row.querySelector('input[type="checkbox"]');
        if (!cb) return;
        if (e.target === cb) return;

        e.preventDefault();
        e.stopPropagation();

        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
        cb.focus({ preventScroll: true });
    });
}

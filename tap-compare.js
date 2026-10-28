/* tap-compare: one tap-to-switch picture compare, the same file on every page that shows one (local apps and chat
   pages alike), loaded by version: https://cdn.jsdelivr.net/gh/TypeFunDiabetes/tap-compare@<VERSION>/tap-compare.js
   Self-contained: no imports, no server, no page state; the page hands it pictures and listens to its events.

   <tap-compare a="first.png" b="second.png" a-label="Krea" b-label="Qwen"></tap-compare>
   A tap (or click) flips and the picture stays; a press held past HOLD_MS shows the other one until let go (a peek);
   C, Enter or Space flips while it has focus (keys="page": C anywhere on the page outside a text field). Two dots
   under it light the picture shown. "detail" adds a drag-a-box close look: the box's crop of both pictures side by
   side under it (the centre to start). With a picture missing it takes them by drop, paste or a file pick.
   Events (bubbling): tc-change {shown, how}, tc-peek {peeking, visible}, tc-detail {x, y, w, h} (fractions),
   tc-pictures {a, b}. Attribute detail-box="x y w h" (fractions) holds the box: a drag writes it, a page sets it to
   restore one. Methods: flip(), show("a"|"b"), setPictures(a, b), setDetail({x, y, w, h} | null).
   Look: CSS custom properties --tc-accent,
   --tc-dot, --tc-dot-off, --tc-radius, --tc-blend, --tc-max-height, --tc-gap, --tc-muted, --tc-font. */
(() => {
  "use strict";
  const VERSION = "1.1.0";
  if (window.customElements.get("tap-compare")) return;
  const HOLD_MS = 250;      // shorter is a tap (flip), longer a peek; Train's Hold and ChatGPT's review agree on it
  const DRAG_PX = 6;        // movement that turns a press into a detail box
  const CSS = `
:host{display:block;position:relative;font:var(--tc-font,inherit);color:inherit;-webkit-user-select:none;user-select:none}
:host([hidden]){display:none}
.frame{position:relative;margin:0 auto;border-radius:var(--tc-radius,8px);overflow:hidden;cursor:pointer;outline:none;
  touch-action:manipulation;-webkit-touch-callout:none;line-height:0}
:host([detail]) .frame{touch-action:none;cursor:crosshair}
.frame.kbd:focus{box-shadow:0 0 0 2px var(--tc-accent,#3a6df0)}
.frame.peek{box-shadow:inset 0 0 0 2px var(--tc-accent,#3a6df0)}
.pic{display:block;width:100%;height:auto;max-height:var(--tc-max-height,80vh);object-fit:contain;
  transition:opacity var(--tc-blend,90ms) linear;-webkit-user-drag:none;pointer-events:none}
.pic.b{position:absolute;inset:0;height:100%;max-height:none}
.pic.off{opacity:0}
.sel{position:absolute;border:2px solid var(--tc-accent,#3a6df0);pointer-events:none;box-sizing:border-box}
.msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;
  line-height:1.4;font-size:13px;color:var(--tc-muted,#8a8f98);background:rgba(0,0,0,.55)}
.dots{display:flex;justify-content:center;gap:6px;margin-top:6px}
.dots span{width:7px;height:7px;border-radius:50%;background:var(--tc-dot-off,rgba(128,128,128,.35));
  transition:background var(--tc-blend,90ms) linear}
.dots span.on{background:var(--tc-dot,currentColor)}
.crops{display:grid;grid-template-columns:1fr 1fr;gap:var(--tc-gap,8px);margin-top:var(--tc-gap,8px)}
.crops canvas{width:100%;height:auto;border-radius:var(--tc-radius,8px);display:block}
.drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:120px;padding:16px;
  border:1.5px dashed var(--tc-dot-off,rgba(128,128,128,.5));border-radius:var(--tc-radius,8px);text-align:center;
  font-size:13px;line-height:1.4;color:var(--tc-muted,#8a8f98);cursor:pointer;margin-top:var(--tc-gap,8px)}
.drop:first-child{margin-top:0;aspect-ratio:3/4;min-height:0}
.drop.over{border-color:var(--tc-accent,#3a6df0)}
.drop .plus{font-size:22px;line-height:1}
.drop input{display:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
[hidden]{display:none!important}`;

  const inText = (e) => {
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""));
  };

  class TapCompare extends HTMLElement {
    static get observedAttributes() { return ["a", "b", "a-label", "b-label", "detail", "shown", "detail-box"]; }

    constructor() {
      super();
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `<style>${CSS}</style>
<div class="frame" part="frame" tabindex="0" role="button"><img class="pic a" alt="" draggable="false"><img class="pic b off" alt="" draggable="false"><div class="sel" hidden></div><div class="msg" hidden></div></div>
<div class="dots" part="dots" aria-hidden="true"><span class="on"></span><span></span></div>
<div class="crops" part="crops" hidden><canvas class="ca"></canvas><canvas class="cb"></canvas></div>
<label class="drop" part="drop" hidden><span class="plus" aria-hidden="true">+</span><span class="dtext"></span><input type="file" accept="image/*" multiple></label>
<div class="sr" aria-live="polite"></div>`;
      const $ = (s) => root.querySelector(s);
      this._el = { frame: $(".frame"), a: $(".pic.a"), b: $(".pic.b"), sel: $(".sel"), msg: $(".msg"),
        dots: root.querySelectorAll(".dots span"), crops: $(".crops"), ca: $(".ca"), cb: $(".cb"), drop: $(".drop"),
        dtext: $(".dtext"), file: $("input"), live: $(".sr") };
      this._shown = "a";       // the picture at rest
      this._visible = "a";     // the picture on screen (the other one during a peek)
      this._failed = { a: false, b: false };
      this._g = null;          // the press in progress
      this._rect = null;       // the detail box, fractions of the picture
      this._bind();
    }

    get version() { return VERSION; }
    get shown() { return this._shown; }
    get visible() { return this._visible; }

    connectedCallback() {
      this._docKey = (e) => {
        if (this.getAttribute("keys") !== "page" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || inText(e)) return;
        if ((e.key === "c" || e.key === "C") && this._ready()) { e.preventDefault(); this.flip("key"); }
      };
      this._docPaste = (e) => {
        if (this._ready() || inText(e) || !e.clipboardData) return;
        const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
        if (files.length) { e.preventDefault(); this._take(files); }
      };
      document.addEventListener("keydown", this._docKey);
      document.addEventListener("paste", this._docPaste);
      this._render();
    }

    disconnectedCallback() {
      document.removeEventListener("keydown", this._docKey);
      document.removeEventListener("paste", this._docPaste);
    }

    attributeChangedCallback(name, old, val) {
      if (old === val) return;
      if (name === "a" || name === "b") {
        this._failed[name] = false;
        const img = this._el[name];
        if (val) img.src = val; else img.removeAttribute("src");
        if (name === "a") { this._rect = this._parseBox(this.getAttribute("detail-box")); this._fit(); }
      } else if (name === "detail-box") {
        this._rect = this._parseBox(val);
      } else if (name === "shown" && (val === "a" || val === "b") && val !== this._shown) {
        this._shown = this._visible = val;
      }
      this._render();
    }

    /* ---- what the page calls ---- */
    flip(how = "api") { this.show(this._shown === "a" ? "b" : "a", how); }

    show(which, how = "api") {
      if (which !== "a" && which !== "b") return;
      const changed = which !== this._shown;
      this._shown = this._visible = which;
      if (this.getAttribute("shown") !== which) this.setAttribute("shown", which);
      this._render();
      if (changed) this._emit("tc-change", { shown: which, how });
    }

    // restore a saved box (fractions of the picture), or null for the centre box; emits nothing
    setDetail(r) {
      if (r && [r.x, r.y, r.w, r.h].every((v) => typeof v === "number" && isFinite(v))) {
        this.setAttribute("detail-box", [r.x, r.y, r.w, r.h].map((v) => +v.toFixed(4)).join(" "));
      } else this.removeAttribute("detail-box");
    }

    get detailBox() { return this._rect ? { ...this._rect } : null; }

    setPictures(a, b) {
      if (a != null) this.setAttribute("a", a); else this.removeAttribute("a");
      if (b != null) this.setAttribute("b", b); else this.removeAttribute("b");
    }

    /* ---- inside ---- */
    _parseBox(val) {
      const n = String(val || "").split(/[\s,]+/).filter(Boolean).map(Number);
      if (n.length !== 4 || !n.every(isFinite)) return null;
      const cl = (v) => Math.max(0, Math.min(1, v));
      const x = cl(n[0]), y = cl(n[1]), w = Math.min(cl(n[2]), 1 - x), h = Math.min(cl(n[3]), 1 - y);
      return w > 0 && h > 0 ? { x, y, w, h } : null;
    }

    _ready() { return !!(this.getAttribute("a") && this.getAttribute("b")); }
    _label(w) { return this.getAttribute(w + "-label") || w.toUpperCase(); }
    _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })); }

    _render() {
      const el = this._el, a = this.getAttribute("a"), b = this.getAttribute("b"), ready = !!(a && b);
      el.frame.hidden = !a && !b;
      el.dots[0].parentNode.hidden = !ready;
      el.b.hidden = !b;
      el.a.classList.toggle("off", ready && this._visible === "b");
      el.b.classList.toggle("off", this._visible !== "b");
      el.dots[0].classList.toggle("on", this._visible === "a");
      el.dots[1].classList.toggle("on", this._visible === "b");
      el.frame.setAttribute("aria-label", ready
        ? `${this._label(this._visible)} shown. Tap to switch, hold to peek` + (this.hasAttribute("detail") ? ", drag to compare a detail" : "")
        : "Picture");
      el.live.textContent = ready ? `${this._label(this._visible)} shown` : "";
      const bad = this._failed.a ? "a" : this._failed.b ? "b" : null;
      el.msg.hidden = !bad;
      if (bad) el.msg.textContent = `${this._label(bad)} did not load. Tap to retry`;
      el.drop.hidden = ready;
      el.dtext.textContent = !a && !b ? "Drop, paste or pick two pictures" : "Add the second picture";
      if (!a && !b) el.drop.parentNode.insertBefore(el.drop, el.frame); else el.dots[0].parentNode.after(el.drop);
      const detail = ready && this.hasAttribute("detail");
      el.crops.hidden = !detail;
      if (detail) this._drawCrops();
      else el.sel.hidden = true;
    }

    _bind() {
      const el = this._el;
      for (const w of ["a", "b"]) {
        el[w].addEventListener("error", () => { if (this.getAttribute(w)) { this._failed[w] = true; this._render(); } });
        el[w].addEventListener("load", () => { this._failed[w] = false; this._fit(); this._render(); });
      }
      const f = el.frame;
      // the focus ring is for the keyboard only: a tap focuses the frame (for C) without drawing it
      f.addEventListener("focus", () => { if (!this._g) f.classList.add("kbd"); });
      f.addEventListener("blur", () => f.classList.remove("kbd"));
      f.addEventListener("contextmenu", (e) => e.preventDefault());
      f.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || this._g || !this._ready()) return;
        e.preventDefault();
        const g = this._g = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false, peek: false };
        f.classList.remove("kbd");
        f.focus({ preventScroll: true });
        try { f.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic press */ }
        g.timer = setTimeout(() => {
          if (this._g !== g || g.drag) return;
          g.peek = true;
          this._visible = this._shown === "a" ? "b" : "a";
          f.classList.add("peek");
          this._render();
          this._emit("tc-peek", { peeking: true, visible: this._visible });
        }, HOLD_MS);
      });
      f.addEventListener("pointermove", (e) => {
        const g = this._g;
        if (!g || e.pointerId !== g.id || !this.hasAttribute("detail")) return;
        if (!g.drag && Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_PX && !g.peek) {
          g.drag = true;
          clearTimeout(g.timer);
        }
        if (g.drag) this._showSel(this._box(g.x, g.y, e.clientX, e.clientY));
      });
      const end = (e) => {
        const g = this._g;
        if (!g || e.pointerId !== g.id) return;
        this._g = null;
        clearTimeout(g.timer);
        if (g.peek) {
          this._visible = this._shown;
          f.classList.remove("peek");
          this._render();
          this._emit("tc-peek", { peeking: false, visible: this._visible });
        } else if (g.drag && e.type === "pointerup") {
          const r = this._box(g.x, g.y, e.clientX, e.clientY);
          if (r && r.w > 0.025 && r.h > 0.025) { this.setDetail(r); this._emit("tc-detail", { ...this._rect }); }
          this._render();
        } else if (e.type === "pointerup") {
          if (this._failed.a || this._failed.b) this._retry(); else this.flip("tap");
        }
      };
      f.addEventListener("pointerup", end);
      f.addEventListener("pointercancel", end);
      f.addEventListener("lostpointercapture", end);
      f.addEventListener("keydown", (e) => {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !this._ready()) return;
        if (e.key === "Enter" || e.key === " " || ((e.key === "c" || e.key === "C") && this.getAttribute("keys") !== "page")) {
          e.preventDefault();
          e.stopPropagation();
          this.flip("key");
        }
      });
      const d = el.drop;
      el.file.addEventListener("change", () => { this._take([...el.file.files]); el.file.value = ""; });
      this.addEventListener("dragover", (e) => { if (!this._ready()) { e.preventDefault(); d.classList.add("over"); } });
      this.addEventListener("dragleave", () => d.classList.remove("over"));
      this.addEventListener("drop", (e) => {
        if (this._ready()) return;
        e.preventDefault();
        d.classList.remove("over");
        this._take([...(e.dataTransfer ? e.dataTransfer.files : [])]);
      });
    }

    _take(files) {
      const pics = files.filter((f) => f.type.startsWith("image/"));
      for (const file of pics) {
        const url = URL.createObjectURL(file);
        if (!this.getAttribute("a")) this.setAttribute("a", url);
        else if (!this.getAttribute("b")) this.setAttribute("b", url);
        else break;
      }
      if (pics.length) this._emit("tc-pictures", { a: this.getAttribute("a"), b: this.getAttribute("b") });
    }

    _retry() {
      for (const w of ["a", "b"]) {
        if (!this._failed[w]) continue;
        const src = this.getAttribute(w);
        this._failed[w] = false;
        this._el[w].removeAttribute("src");
        this._el[w].src = src;
      }
      this._render();
    }

    // the frame as wide as the first picture is drawn: a picture capped by --tc-max-height leaves no bars beside it
    _fit() {
      const img = this._el.a;
      if (!img.naturalWidth || !img.naturalHeight) { this._el.frame.style.width = ""; return; }
      this._el.frame.style.width = `min(100%, calc(var(--tc-max-height, 80vh) * ${img.naturalWidth / img.naturalHeight}))`;
    }

    // the picture's drawn area inside the frame (object-fit: contain leaves bars when the frame is capped)
    _area(img) {
      const r = this._el.frame.getBoundingClientRect(), nw = img.naturalWidth, nh = img.naturalHeight;
      if (!nw || !nh || !r.width || !r.height) return null;
      const s = Math.min(r.width / nw, r.height / nh), w = nw * s, h = nh * s;
      return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, w, h, fl: r.left, ft: r.top };
    }

    _box(x0, y0, x1, y1) {
      const a = this._area(this._el.a);
      if (!a) return null;
      const cl = (v) => Math.max(0, Math.min(1, v));
      const fx0 = cl((Math.min(x0, x1) - a.left) / a.w), fx1 = cl((Math.max(x0, x1) - a.left) / a.w);
      const fy0 = cl((Math.min(y0, y1) - a.top) / a.h), fy1 = cl((Math.max(y0, y1) - a.top) / a.h);
      return { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 };
    }

    _showSel(r) {
      const a = this._area(this._el.a), s = this._el.sel;
      if (!a || !r) { s.hidden = true; return; }
      s.hidden = false;
      s.style.left = `${a.left - a.fl + r.x * a.w}px`;
      s.style.top = `${a.top - a.ft + r.y * a.h}px`;
      s.style.width = `${r.w * a.w}px`;
      s.style.height = `${r.h * a.h}px`;
    }

    _drawCrops() {
      const r = this._rect || { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
      this._showSel(r);
      for (const w of ["a", "b"]) {
        const img = this._el[w], c = this._el["c" + w];
        if (!img.complete || !img.naturalWidth) continue;
        const sx = r.x * img.naturalWidth, sy = r.y * img.naturalHeight;
        const sw = Math.max(1, r.w * img.naturalWidth), sh = Math.max(1, r.h * img.naturalHeight);
        const scale = Math.min(1, 900 / Math.max(sw, sh));
        c.width = Math.round(sw * scale);
        c.height = Math.round(sh * scale);
        c.setAttribute("aria-label", `${this._label(w)}, the box's detail`);
        try { c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); } catch (_) { /* not decoded yet */ }
      }
    }
  }

  TapCompare.VERSION = VERSION;
  TapCompare.HOLD_MS = HOLD_MS;
  window.customElements.define("tap-compare", TapCompare);
})();

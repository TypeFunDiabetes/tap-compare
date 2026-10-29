/* tap-compare: one tap-to-switch picture compare, the same file on every page that shows one (local apps and chat
   pages alike), loaded by version: https://cdn.jsdelivr.net/gh/TypeFunDiabetes/tap-compare@<VERSION>/tap-compare.js
   Self-contained: no imports, no server, no page state; the page hands it pictures and listens to its events.

   <tap-compare a="first.png" b="second.png" a-label="Krea" b-label="Qwen"></tap-compare>
   A tap (or click) flips and the picture stays; a press held past HOLD_MS shows the other one until let go (a peek);
   C, Enter or Space flips while it has focus (keys="page": C anywhere on the page outside a text field). Two dots
   under it light the picture shown. "detail" adds a Select detail mode: switching is locked while drawing the
   box, with both crops below (the centre to start). "controls" adds a visible Show A/B button without crops.
   With a picture missing it takes them by drop, paste or a file pick.
   peek="instant" (1.3.0): the other picture shows at the press itself; let go within the hold time and it stays
   (a flip), later and the first comes back. hold-ms="400" sets the hold time. hold-key="Shift": that key does what
   the pointer does (a quick press flips, a held one peeks until released), anywhere with keys="page", else with
   focus; a page that routes its own keys calls press() and release() instead.
   Events (bubbling): tc-change {shown, how}, tc-peek {peeking, visible}, tc-detail {x, y, w, h} (fractions),
   tc-pictures {a, b}, tc-mode {mode: "compare"|"detail"}, tc-load {which} (a picture decoded; 1.3.0).
   Attribute detail-box="x y w h" holds the crop.
   Methods: flip(), show("a"|"b"), setPictures(a, b), setDetail({x, y, w, h} | null), press(), release();
   frameBox is the frame's rectangle on screen (for an overlay of the page's own).
   Look: CSS custom properties --tc-accent, --tc-dot, --tc-dot-off, --tc-radius, --tc-blend, --tc-ease,
   --tc-max-height, --tc-gap, --tc-muted, --tc-font; parts frame, dots, dot (dot-a, dot-b), controls, crops, drop. */
(() => {
  "use strict";
  const VERSION = "1.3.0";
  if (window.customElements.get("tap-compare")) return;
  const HOLD_MS = 250;      // shorter is a tap (flip), longer a peek, unless hold-ms says otherwise
  const DRAG_PX = 6;        // movement that turns a press into a detail box
  const CSS = `
:host{display:block;position:relative;font:var(--tc-font,inherit);color:inherit;-webkit-user-select:none;user-select:none}
:host([hidden]){display:none}
.frame{position:relative;margin:0 auto;border-radius:var(--tc-radius,8px);overflow:hidden;cursor:pointer;outline:none;
  touch-action:manipulation;-webkit-touch-callout:none;line-height:0}
:host([detail][mode="detail"]) .frame{touch-action:none;cursor:crosshair}
.controls{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}
.actions{display:flex;gap:8px}.controls button{font:inherit;color:inherit;background:transparent;border:1px solid var(--tc-muted,#8a8f98);border-radius:var(--tc-radius,8px);padding:8px 12px;cursor:pointer}
.controls .switch{background:var(--tc-accent,#bce0d6);color:#14231f;font-weight:600}.controls button:disabled{opacity:.45;cursor:default}
.hint{font-size:13px;line-height:1.4;color:var(--tc-muted,#8a8f98);margin:0 0 10px}
.frame.kbd:focus{box-shadow:0 0 0 2px var(--tc-accent,#3a6df0)}
.frame.peek{box-shadow:inset 0 0 0 2px var(--tc-accent,#3a6df0)}
.pic{display:block;width:100%;height:auto;max-height:var(--tc-max-height,80vh);object-fit:contain;
  transition:opacity var(--tc-blend,90ms) var(--tc-ease,linear);-webkit-user-drag:none;pointer-events:none}
.pic.b{position:absolute;inset:0;height:100%;max-height:none}
.pic.off{opacity:0}
.sel{position:absolute;border:2px solid var(--tc-accent,#3a6df0);pointer-events:none;box-sizing:border-box}
.msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;
  line-height:1.4;font-size:13px;color:var(--tc-muted,#8a8f98);background:rgba(0,0,0,.55)}
.dots{display:flex;justify-content:center;gap:6px;margin-top:6px}
.dots span{width:7px;height:7px;border-radius:50%;background:var(--tc-dot-off,rgba(128,128,128,.35));
  transition:background var(--tc-blend,90ms) var(--tc-ease,linear)}
.dots span.on{background:var(--tc-dot,currentColor)}
.crops{display:grid;grid-template-columns:1fr 1fr;gap:var(--tc-gap,8px);margin-top:var(--tc-gap,8px)}
.crops canvas{width:100%;height:auto;border-radius:var(--tc-radius,8px);display:block}
.crops figure{margin:0;min-width:0}.crops figcaption{font-size:13px;line-height:1.4;color:var(--tc-muted,#8a8f98);margin-top:6px;overflow-wrap:anywhere}
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
    static get observedAttributes() { return ["a", "b", "a-label", "b-label", "detail", "shown", "detail-box", "mode", "controls"]; }

    constructor() {
      super();
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `<style>${CSS}</style>
<div class="controls" part="controls" hidden><span class="current"></span><div class="actions"><button type="button" class="select" aria-pressed="false">Select detail</button><button type="button" class="switch">Show B</button></div></div><p class="hint" hidden></p>
<div class="frame" part="frame" tabindex="0" role="button"><img class="pic a" alt="" draggable="false"><img class="pic b off" alt="" draggable="false"><div class="sel" hidden></div><div class="msg" hidden></div></div>
<div class="dots" part="dots" aria-hidden="true"><span class="on" part="dot dot-a"></span><span part="dot dot-b"></span></div>
<div class="crops" part="crops" hidden><figure><canvas class="ca"></canvas><figcaption class="label-a"></figcaption></figure><figure><canvas class="cb"></canvas><figcaption class="label-b"></figcaption></figure></div>
<label class="drop" part="drop" hidden><span class="plus" aria-hidden="true">+</span><span class="dtext"></span><input type="file" accept="image/*" multiple></label>
<div class="sr" aria-live="polite"></div>`;
      const $ = (s) => root.querySelector(s);
      this._el = { frame: $(".frame"), a: $(".pic.a"), b: $(".pic.b"), sel: $(".sel"), msg: $(".msg"),
        dots: root.querySelectorAll(".dots span"), crops: $(".crops"), ca: $(".ca"), cb: $(".cb"), drop: $(".drop"),
        dtext: $(".dtext"), file: $("input"), live: $(".sr"), controls: $(".controls"), select: $(".select"), switch: $(".switch"), current: $(".current"), hint: $(".hint"), labelA: $(".label-a"), labelB: $(".label-b") };
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
        if (this._isHoldKey(e)) { if (this._ready() && !this._detailMode()) { e.preventDefault(); this.press("key"); } return; }
        if ((e.key === "c" || e.key === "C") && this._ready()) { e.preventDefault(); this.flip("key"); }
      };
      this._docKeyUp = (e) => { if (this._g && this._g.key && this._isHoldKey(e)) this.release("key"); };
      this._docPaste = (e) => {
        if (this._ready() || inText(e) || !e.clipboardData) return;
        const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
        if (files.length) { e.preventDefault(); this._take(files); }
      };
      document.addEventListener("keydown", this._docKey);
      document.addEventListener("keyup", this._docKeyUp);
      document.addEventListener("paste", this._docPaste);
      this._windowBlur = () => this._cancelGesture();
      window.addEventListener("blur", this._windowBlur);
      this._render();
    }

    disconnectedCallback() {
      this._cancelGesture();
      document.removeEventListener("keydown", this._docKey);
      document.removeEventListener("keyup", this._docKeyUp);
      document.removeEventListener("paste", this._docPaste);
      window.removeEventListener("blur", this._windowBlur);
    }

    attributeChangedCallback(name, old, val) {
      if (old === val) return;
      if (name === "mode") this._cancelGesture(true);
      if (name === "detail" && val === null) this._cancelGesture();
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
    flip(how = "api") { if (!this._detailMode()) this.show(this._shown === "a" ? "b" : "a", how); }

    show(which, how = "api") {
      if (this._detailMode()) return;
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

    // the frame's rectangle on screen, for an overlay the page draws on the picture
    get frameBox() { return this._el.frame.getBoundingClientRect(); }

    // a press and its release from a key the page routes itself (hold-key does the same for one key): a release
    // within the hold time flips, a later one ends the peek
    press(how = "api") {
      if (this._g || !this._ready() || this._detailMode()) return;
      this._start({ key: true, how, drag: false, peek: false });
    }

    release(how) {
      const g = this._g;
      if (!g || !g.key) return;
      this._g = null;
      this._finish(g, true, how || g.how);
    }

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
    _instant() { return this.getAttribute("peek") === "instant"; }
    _holdMs() { const n = Number(this.getAttribute("hold-ms")); return n > 0 && isFinite(n) ? n : HOLD_MS; }
    _isHoldKey(e) { const k = this.getAttribute("hold-key"); return !!k && String(e.key).toLowerCase() === k.toLowerCase(); }

    // a press begins (the pointer, the hold key or press()); with peek="instant" the other picture shows at once
    _start(g) {
      this._g = g;
      if (this._detailMode()) return;
      if (this._instant() && !this._failed.a && !this._failed.b) this._swap(true);
      g.timer = setTimeout(() => {
        if (this._g !== g || g.drag) return;
        g.peek = true;
        this._el.frame.classList.add("peek");
        if (this._visible === this._shown) this._swap(true);
      }, this._holdMs());
    }

    // the other picture on screen (on) or the one at rest again, told to the page
    _swap(on) {
      this._visible = on ? (this._shown === "a" ? "b" : "a") : this._shown;
      this._render();
      this._emit("tc-peek", { peeking: on, visible: this._visible });
    }

    // a press let go: `up` is a real release (else a cancel); within the hold time it flips, after it the peek ends
    _finish(g, up, how) {
      clearTimeout(g.timer);
      const swapped = this._visible !== this._shown;
      this._el.frame.classList.remove("peek");
      if (up && swapped && !g.peek) {          // peek="instant", let go in time: the picture shown stays
        this._shown = this._visible;
        this.setAttribute("shown", this._shown);
        this._render();
        this._emit("tc-peek", { peeking: false, visible: this._visible });
        this._emit("tc-change", { shown: this._shown, how });
      } else if (swapped || g.peek) this._swap(false);
      else if (up && !this._detailMode()) {
        if (this._failed.a || this._failed.b) this._retry(); else this.flip(how);
      } else this._render();
    }
    _detailMode() { return this.hasAttribute("detail") && this.getAttribute("mode") === "detail"; }
    _cancelGesture(pin = false) {
      if (this._g) clearTimeout(this._g.timer);
      this._g = null;
      const peeked = this._visible !== this._shown;
      if (pin && peeked) {
        this._shown = this._visible;
        this.setAttribute("shown", this._shown);
        this._emit("tc-change", { shown: this._shown, how: "mode" });
      }
      this._visible = this._shown;
      this._el.frame.classList.remove("peek");
      if (peeked) this._emit("tc-peek", { peeking: false, visible: this._visible });
      this._render();
    }
    _label(w) { return this.getAttribute(w + "-label") || w.toUpperCase(); }
    _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })); }

    _render() {
      const el = this._el, a = this.getAttribute("a"), b = this.getAttribute("b"), ready = !!(a && b);
      const selecting = this._detailMode();
      el.controls.hidden = !ready || !(this.hasAttribute("controls") || this.hasAttribute("detail"));
      el.current.textContent = `Showing ${this._visible.toUpperCase()}`;
      el.current.title = this._label(this._visible);
      el.labelA.textContent = `A · ${this._label("a")}`;
      el.labelB.textContent = `B · ${this._label("b")}`;
      el.switch.textContent = `Show ${this._visible === "a" ? "B" : "A"}`;
      el.switch.disabled = selecting;
      el.select.hidden = !this.hasAttribute("detail");
      el.select.textContent = selecting ? "Compare images" : "Select detail";
      el.select.setAttribute("aria-pressed", String(selecting));
      el.hint.hidden = !ready || !this.hasAttribute("detail");
      el.hint.textContent = selecting ? "Image locked. Drag a box to compare that detail in both images." : "Click to switch; hold to peek. Select detail to draw a box without switching.";
      el.frame.hidden = !a && !b;
      el.dots[0].parentNode.hidden = !ready;
      el.b.hidden = !b;
      el.a.classList.toggle("off", ready && this._visible === "b");
      el.b.classList.toggle("off", this._visible !== "b");
      el.dots[0].classList.toggle("on", this._visible === "a");
      el.dots[1].classList.toggle("on", this._visible === "b");
      el.frame.setAttribute("aria-label", ready
        ? (selecting ? `${this._label(this._visible)} locked. Drag to select a detail.` : `${this._label(this._visible)} shown. Tap to switch, hold to peek`)
        : "Picture");
      el.frame.setAttribute("role", selecting ? "group" : "button");
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
      el.switch.addEventListener("click", () => this.flip("button"));
      el.select.addEventListener("click", () => {
        this.setAttribute("mode", this._detailMode() ? "compare" : "detail");
        this._emit("tc-mode", { mode: this._detailMode() ? "detail" : "compare" });
      });
      for (const w of ["a", "b"]) {
        el[w].addEventListener("error", () => { if (this.getAttribute(w)) { this._failed[w] = true; this._render(); } });
        el[w].addEventListener("load", () => { this._failed[w] = false; this._fit(); this._render(); this._emit("tc-load", { which: w }); });
      }
      const f = el.frame;
      // the focus ring is for the keyboard only: a tap focuses the frame (for C) without drawing it
      f.addEventListener("focus", () => { if (!this._g) f.classList.add("kbd"); });
      f.addEventListener("blur", () => { f.classList.remove("kbd"); if (this._g) this._cancelGesture(); });
      f.addEventListener("contextmenu", (e) => e.preventDefault());
      f.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || this._g || !this._ready()) return;
        e.preventDefault();
        const g = this._g = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false, peek: false };
        f.classList.remove("kbd");
        f.focus({ preventScroll: true });
        try { f.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic press */ }
        this._start(g);
      });
      f.addEventListener("pointermove", (e) => {
        const g = this._g;
        if (!g || e.pointerId !== g.id || !this._detailMode()) return;
        if (!g.drag && Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_PX && !g.peek) {
          g.drag = true;
          clearTimeout(g.timer);
        }
        if (g.drag) this._showSel(this._box(g.x, g.y, e.clientX, e.clientY));
      });
      const end = (e) => {
        const g = this._g;
        if (!g || g.key || e.pointerId !== g.id) return;
        this._g = null;
        if (g.drag && !g.peek && this._detailMode() && e.type === "pointerup") {
          clearTimeout(g.timer);
          const r = this._box(g.x, g.y, e.clientX, e.clientY);
          if (r && r.w > 0.025 && r.h > 0.025) { this.setDetail(r); this._emit("tc-detail", { ...this._rect }); }
          this._render();
          return;
        }
        this._finish(g, e.type === "pointerup", "tap");
      };
      f.addEventListener("pointerup", end);
      f.addEventListener("pointercancel", end);
      f.addEventListener("lostpointercapture", end);
      f.addEventListener("keydown", (e) => {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !this._ready()) return;
        if (this.getAttribute("keys") !== "page" && this._isHoldKey(e)) {
          if (!this._detailMode()) { e.preventDefault(); this.press("key"); }
          return;
        }
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

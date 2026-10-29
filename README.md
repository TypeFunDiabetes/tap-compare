# tap-compare

One tap-to-switch picture compare, as a single dependency-free web component.

- A tap (or click) flips between the two pictures and the picture stays.
- Press and hold to peek at the other one; let go to come back.
- `C`, `Enter` or `Space` flips while it has focus (`keys="page"`: `C` anywhere outside a text field).
- Two dots under the picture light the one shown.
- `detail`: visible Show A / Show B and Select detail buttons, and both crops of a box side by side, each labelled.
  Select detail sets `mode="detail"`: the picture is locked while a box is drawn or inspected (taps, holds, `C`,
  `Enter`, `Space`, `flip()` and `show()` switch nothing) and a drag draws the box; Compare images sets
  `mode="compare"` again. A page may still set `shown` itself. Removing `detail` goes back to plain comparing.
- `controls`: the visible Show A / Show B button alone, without Select detail or crops.
- A viewer with neither `detail` nor `controls` keeps the plain picture, dots, tap and hold.
- Closing the viewer or the window losing focus ends a pending hold or a peek.
- With a picture missing it takes them by drop, paste or a file pick.

```html
<script src="https://cdn.jsdelivr.net/gh/TypeFunDiabetes/tap-compare@1.2.0/tap-compare.js"></script>
<tap-compare a="first.png" b="second.png" a-label="Before" b-label="After"></tap-compare>
```

Empty, for pictures pasted or dropped in:

```html
<tap-compare></tap-compare>
```

Events (bubbling): `tc-change` `{shown, how}`, `tc-peek` `{peeking, visible}`, `tc-detail` `{x, y, w, h}`
(fractions of the picture), `tc-pictures` `{a, b}`, `tc-mode` `{mode: "compare" | "detail"}` (from the Select
detail / Compare images button). Methods: `flip()`, `show("a" | "b")`, `setPictures(a, b)`,
`setDetail({x, y, w, h} | null)`; `detailBox` reads the box. Attribute `detail-box="x y w h"` (fractions) holds it: a drag
writes it, and a page sets it to restore a saved box.
Attribute `shown="a" | "b"` sets the picture at rest; `mode="compare" | "detail"` the mode of a `detail` viewer.

Look, through CSS custom properties on the element or a parent: `--tc-accent`, `--tc-dot`, `--tc-dot-off`,
`--tc-radius`, `--tc-blend` (the fade's duration), `--tc-max-height`, `--tc-gap`, `--tc-muted`, `--tc-font`.

Always load a pinned version (`@1.2.0`), never a branch: a tag here is never moved.

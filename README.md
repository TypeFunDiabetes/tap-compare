# tap-compare

One tap-to-switch picture compare, as a single dependency-free web component.

- A tap (or click) flips between the two pictures and the picture stays.
- Press and hold to peek at the other one; let go to come back.
- `C`, `Enter` or `Space` flips while it has focus (`keys="page"`: `C` anywhere outside a text field).
- Two dots under the picture light the one shown.
- `detail`: drag a box on the picture to see that region of both pictures side by side.
- With a picture missing it takes them by drop, paste or a file pick.

```html
<script src="https://cdn.jsdelivr.net/gh/TypeFunDiabetes/tap-compare@1.1.0/tap-compare.js"></script>
<tap-compare a="first.png" b="second.png" a-label="Before" b-label="After"></tap-compare>
```

Empty, for pictures pasted or dropped in:

```html
<tap-compare></tap-compare>
```

Events (bubbling): `tc-change` `{shown, how}`, `tc-peek` `{peeking, visible}`, `tc-detail` `{x, y, w, h}`
(fractions of the picture), `tc-pictures` `{a, b}`. Methods: `flip()`, `show("a" | "b")`, `setPictures(a, b)`,
`setDetail({x, y, w, h} | null)`; `detailBox` reads the box. Attribute `detail-box="x y w h"` (fractions) holds it: a drag
writes it, and a page sets it to restore a saved box.
Attribute `shown="a" | "b"` sets the picture at rest.

Look, through CSS custom properties on the element or a parent: `--tc-accent`, `--tc-dot`, `--tc-dot-off`,
`--tc-radius`, `--tc-blend`, `--tc-max-height`, `--tc-gap`, `--tc-muted`, `--tc-font`.

Always load a pinned version (`@1.1.0`), never a branch: a tag here is never moved.

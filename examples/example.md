# Welcome to mded

mded shows your markdown **rendered** while you write, and the markers only
appear where the cursor is. This paragraph is hard-wrapped in the file, with
_soft line breaks_, but it reads as one paragraph.

## Links and images

Here is a [link to Tauri](https://tauri.app) (Cmd+click opens it) and an image
stored next to this file:

![sample image](./sample.svg)

## Lists

* Bullets with an asterisk
* Another item
    * Nested with 4 spaces

1. First
2. Second
3. Third

- [ ] A pending task
- [x] A finished task

> A blockquote with **emphasis** inside.

---

## Code

```ts
function greet(name: string) {
  return `Hello, ${name}`;
}
```

## Table

| Editor     | Model   | Fidelity  |
|:-----------|:-------:|----------:|
| Tree-based | Tree    | Rewrites  |
| mded       | Text    | Exact     |

Setext heading
--------------

Inline `code`, ~~strikethrough~~, __bold with underscores__ and *italic*.
Escapes: 1\. is not a list, \*not italic\*.

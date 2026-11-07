## Context

mded runs its editor in WKWebView on macOS. WebKit's UI process decides whether to apply text substitutions, in `TextCheckerMac.mm`. For each substitution it reads a key from the **app's** `NSUserDefaults`. Only when the key is absent does it fall back to the system-wide `NSSpellChecker` setting (System Settings → Keyboard → Text):

```
if (![defaults objectForKey:WebAutomaticDashSubstitutionEnabled])
    return [NSSpellChecker isAutomaticDashSubstitutionEnabled];
```

| Key | Effect | Wanted |
|---|---|---|
| `WebAutomaticQuoteSubstitutionEnabled` | `"` → `“` | off |
| `WebAutomaticDashSubstitutionEnabled` | `--` → `—` | off |
| `WebAutomaticSpellingCorrectionEnabled` | replaces misspelled words | off |
| `WebAutomaticTextReplacementEnabled` | user-defined shortcuts | unchanged |

Spell-check underlining is controlled by a fifth key, `WebContinuousSpellCheckingEnabled`. Unlike the others, it has **no** system fallback: when the key is absent, it is off. The `spellcheck` content attribute in `setup.ts` only allows checking; it doesn't turn it on. Manual testing confirmed there is no underline today.

The substituted text reaches the DOM and CodeMirror reads it as ordinary input. By the time the frontend sees it, it is indistinguishable from what the user typed.

A spike ran `defaults write io.github.jamg44.mded <key> -bool false` for the quote and dash keys. After that, the installed app wrote plain `--` and `"`.

## Goals / Non-Goals

**Goals:**
- Quote, dash and spelling-correction substitutions are off in mded on macOS, regardless of the system setting.
- User text replacements keep working.
- Nothing is written to the user's preferences, and an explicit user value still wins.

**Non-Goals:**
- An *Edit → Substitutions* menu to toggle these. That can come later; the precedence rule above leaves room for it.
- Spelling correction "done right" (e.g. allowed in prose, never inside code). It goes to the roadmap.
- Windows and Linux: WebView2 and WebKitGTK don't apply these substitutions.
- Spell-check underlining. It never worked: turning it on means registering `WebContinuousSpellCheckingEnabled`. That goes to the roadmap.

## Decisions

### Register defaults in Rust at startup, before the webview exists

Call `NSUserDefaults.standardUserDefaults.registerDefaults(...)` with the three keys set to `NO`, as the first thing in `run()` and before `tauri::Builder` creates the window. The call is macOS-only (`#[cfg(target_os = "macos")]`).

- **Why `registerDefaults` and not `setBool:forKey:`:** registered defaults live in the volatile registration domain. They are never written to disk, and they sit below the app's persistent domain. `objectForKey:` finds them, so WebKit stops falling back to the system setting. A value the user writes explicitly still wins. With `setBool`, mded would overwrite the user's preferences on every launch.
- **Why before the window:** WebKit may read and cache the text checker state when the first web view is set up. Registering first removes any ordering doubt.
- **Alternative rejected: filtering in the frontend** (`beforeinput`, or undoing `“` → `"` after the fact). It is fragile, because substitutions arrive as DOM changes that CodeMirror reads. It would also "fix" characters the user typed deliberately with Option-[, and it breaks undo.
- **Alternative rejected: shipping the keys in Info.plist.** Info.plist is not a defaults domain WebKit reads for these keys. It would also do nothing in `pnpm app`, which runs unbundled.

### Use `objc2-foundation` directly, macOS only

`objc2`, `objc2-foundation` 0.3 and `objc2-app-kit` are already in the lock file through Tauri and wry. Declare `objc2-foundation` (with the `NSUserDefaults`, `NSDictionary`, `NSString` and `NSValue` features) under `[target.'cfg(target_os = "macos")'.dependencies]`, on the same 0.3 line so no second copy is compiled.

- **Alternative rejected: `std::process::Command("defaults write …")`.** It is persistent, slow, and spawns a process at startup.

### Set the `autocorrect` content attribute to `off`

[setup.ts](../../../src/editor/setup.ts) currently sets `autocorrect: 'on'`. The defaults are what actually control macOS WebKit. The attribute is changed to `off` anyway, so the code states the intent and covers any engine that honors it. `spellcheck: 'true'` stays, so a future change only needs to register the continuous spell-checking key. `autocapitalize` only affects touch keyboards and is left alone.

### Startup code stays panic-free

Release builds use `panic = "abort"`. The registration involves no `unwrap`: building the dictionary from literals can't fail, and if anything returns nothing the step is simply skipped.

## Risks / Trade-offs

- [WebKit renames or drops the keys in a future macOS] → The keys have been stable for over a decade, and the manual check in tasks.md catches a regression. If they stop working, substitutions come back; nothing worse happens.
- [The spike's persisted keys hide a broken implementation] → The manual test starts by deleting them (`defaults delete io.github.jamg44.mded <key>`).
- [`pnpm app` runs unbundled, so the defaults domain differs from the installed app's] → `registerDefaults` acts on whatever domain is current, so it works in both. The manual test is done on the installed app, which is what the user runs daily.
- [The user actually wants smart quotes in prose] → They can re-enable them per app with `defaults write`, and the precedence rule guarantees it works. A menu toggle is a possible follow-up.
- [Nothing automated tests this] → Accepted. Playwright's Chromium has no macOS substitutions. The spec scenarios are the manual test script.

## Open Questions

None blocking. Whether to expose an *Edit → Substitutions* menu is left to the roadmap.

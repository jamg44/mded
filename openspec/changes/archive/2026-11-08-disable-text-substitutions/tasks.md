## 1. Native: register the substitution defaults (macOS)

- [x] 1.1 Add `objc2-foundation` (0.3, the version already in `Cargo.lock`) under `[target.'cfg(target_os = "macos")'.dependencies]` in `src-tauri/Cargo.toml`. Enable only the features needed for `NSUserDefaults`, `NSDictionary`, `NSString` and `NSNumber`.
- [x] 1.2 In `src-tauri/src/lib.rs`, add a macOS-only function that calls `NSUserDefaults::standardUserDefaults().registerDefaults(...)` with these keys set to `false`:
  - `WebAutomaticQuoteSubstitutionEnabled`
  - `WebAutomaticDashSubstitutionEnabled`
  - `WebAutomaticSpellingCorrectionEnabled`

  Use no `unwrap`, and add a comment explaining why `registerDefaults` is used and not `setBool`.
- [x] 1.3 Call it at the start of `run()`, before `tauri::Builder::default()`.
- [x] 1.4 `cd src-tauri && cargo clippy` passes with no warnings.

## 2. Frontend

- [x] 2.1 In `src/editor/setup.ts`, change the content attribute `autocorrect: 'on'` to `'off'`. Keep `spellcheck: 'true'`.
- [x] 2.2 `pnpm check` passes, and `pnpm e2e` still passes (no behavior change expected in Chromium).

## 3. Docs

- [x] 3.1 AGENTS.md, *Known pitfalls*: add a short entry. macOS WebKit applies the system's smart quotes, dashes and spelling correction unless the app registers its `WebAutomatic…Enabled` defaults. That registration lives in `lib.rs`, and it can't be tested from the browser.
- [x] 3.2 ROADMAP.md: remove the autocorrect item from *Now*. Add to *Later*: "Spelling autocorrect done right (e.g. never inside code)".

## 4. Manual verification (native: the user runs this)

- [x] 4.1 Delete the keys persisted during the spike, so they can't hide a broken implementation:
  - `defaults delete io.github.jamg44.mded WebAutomaticDashSubstitutionEnabled`
  - `defaults delete io.github.jamg44.mded WebAutomaticQuoteSubstitutionEnabled`

  Make sure System Settings → Keyboard → Text → "Use smart quotes and dashes" is **on**.
- [x] 4.2 Install the release build with `pnpm app:install`. It writes to /Applications, so ask for confirmation first.
- [x] 4.3 In the installed app, type `--` + Enter, `---` on its own line, `"quoted"`, `don't` and `teh` + space. Then save and check the bytes with `grep -n '[—–“”‘’]' <file>`: nothing should match, and `teh` must be unchanged.
- [x] 4.4 ~~Check that `teh` is still underlined~~: out of scope, since the underline never worked (see design.md and the roadmap). Text replacement: this change leaves its key untouched, and it was not verified by hand.
- [x] 4.5 Quit the app and check that `defaults read io.github.jamg44.mded` shows none of the three keys.

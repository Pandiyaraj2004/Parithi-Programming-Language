# Parithi Language Support (VS Code)

Syntax highlighting, language configuration, and a custom file icon (the
Parithi logo) for `.pr` files in Visual Studio Code.

This extension is purely declarative — no bundled code runs when it
activates, only:

- `language-configuration.json` — comments (`#`), bracket/quote
  auto-closing, and `if`/`repeat`/`while`/`task` → `end` indentation.
- `syntaxes/parithi.tmLanguage.json` — a TextMate grammar covering every
  keyword, operator, literal, comment, and built-in function documented in
  [`docs/MASTER_DOCUMENT.md`](../../docs/MASTER_DOCUMENT.md).
- `icons/parithi-icon-theme.json` — a File Icon Theme ("Parithi Icons")
  that shows the Parithi logo (`images/parithi-file-icon.png`) for every
  `.pr` file, and simple generic file/folder icons for everything else.

## Install

You do **not** need to publish this to the Marketplace to use it locally.
Pick one of the two options below.

### Option A — Symlink into your extensions folder (fastest, good for local dev)

```powershell
# PowerShell, from the repository root
New-Item -ItemType SymbolicLink `
  -Path "$env:USERPROFILE\.vscode\extensions\vscode-parithi-0.1.0" `
  -Target "$PWD\editors\vscode-parithi"
```

Restart VS Code (or run `Developer: Reload Window` from the Command
Palette).

### Option B — Package a `.vsix` and install it (closer to a real install)

```bash
cd editors/vscode-parithi
npx --yes @vscode/vsce package
code --install-extension vscode-parithi-0.1.0.vsix
```

(`npx @vscode/vsce` downloads the packaging CLI on demand — nothing is
added to this project's own `package.json`/dependencies.)

### Option C — Run it in an Extension Development Host (no install at all, for testing changes)

```bash
code editors/vscode-parithi
```

Then press **F5** inside that VS Code window. A second "Extension
Development Host" window opens with the extension already active — open
any `.pr` file there to try it out.

## Enable the file icon theme

Icon themes are opt-in in VS Code — installing the extension makes
"Parithi Icons" available, but you still choose it once:

1. `Ctrl+Shift+P` → **Preferences: File Icon Theme**
2. Select **Parithi Icons**

(Or: Settings → search `workbench.iconTheme` → set it to `parithi-icons`.)

## Test it

1. Open (or create) `hello.pr` with:
   ```
   say "Hello, Parithi!"
   ```
2. **Syntax highlighting** — `say` and `"Hello, Parithi!"` should be
   colored (keyword vs. string), matching your color theme's palette.
3. **Language mode** — the status bar (bottom-right) should read
   `Parithi`, not `Plain Text`.
4. **File icon** — with "Parithi Icons" selected (see above), the
   Explorer, editor tabs, breadcrumbs, and Quick Open should all show the
   Parithi logo next to `hello.pr`.

## Notes on the logo

`images/parithi-file-icon.png` (128x128) and `images/icon.png` (512x512,
the extension's own Marketplace icon) are both generated — not hand-cropped
— from the project's master logo, `tools/windows-file-icon/logo.png`
(487x454, not square). The same `generate-ico.mjs` script that builds the
Windows `.ico` also produced these: center-cropped to a square, then
box-filter-resized, so both are clean, non-stretched, non-blurry squares
derived from one single source image, consistent with the Windows icon.

If you ever replace the master logo, regenerate both from the repo root:

```bash
node tools/windows-file-icon/generate-ico.mjs \
  --also-png "512:editors/vscode-parithi/images/icon.png" \
  --also-png "128:editors/vscode-parithi/images/parithi-file-icon.png"
```

(This also regenerates `tools/windows-file-icon/parithi.ico` in the same
run, so the Windows and VS Code icons never drift out of sync with each
other.)

## Publisher ID

`package.json`'s `"publisher": "parithi-lang"` is a placeholder — replace
it with your own [Marketplace publisher
ID](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publishing-extensions)
before publishing. It has no effect on Options A–C above.

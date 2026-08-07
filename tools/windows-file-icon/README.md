# Windows File Icon for `.pr` Files

Makes Windows Explorer show the Parithi logo for every `.pr` file, and
makes double-clicking one open it in VS Code. This is separate from (and
complementary to) the VS Code extension in
[`editors/vscode-parithi/`](../../editors/vscode-parithi/) — that one only
affects the icon *inside* VS Code; this one affects Explorer, the
taskbar, desktop shortcuts, and anywhere else Windows itself draws a file
icon.

## How it works

1. **`generate-ico.mjs`** builds a real, **multi-size** `.ico`
   (`parithi.ico`) from `logo.png` — a plain Node script, zero
   dependencies (a from-scratch PNG decoder/resizer/encoder built on
   Node's built-in `zlib`, not an external image library). `logo.png`
   (487×454) is center-cropped to a square, then box-filter-resized down
   to four standard icon sizes — **16×16, 32×32, 48×48, 256×256** — so
   Windows always has a genuinely sharp resolution to draw, instead of
   stretching one single size for every context (a small list-view row
   vs. a large Desktop icon vs. a jumbo thumbnail all need a different
   pixel size to look crisp).
2. **`Register-ParithiFileType.ps1`** associates `.pr` with that icon and
   with VS Code, under `HKEY_CURRENT_USER\Software\Classes` — your own
   user profile only, **no administrator rights needed**, and nothing
   machine-wide is touched.
3. **`Unregister-ParithiFileType.ps1`** removes exactly what the register
   script added, if you ever want to undo this.

These two `.ps1` scripts modify the Windows Registry. **Run them
yourself** in a PowerShell window you control — don't expect an AI
assistant (or anyone else) to run registry-modifying scripts on your
machine on your behalf.

## Install

Open PowerShell in this folder (`tools/windows-file-icon/`) and run:

```powershell
# 1. Generate the .ico (only needed once, or again if you replace logo.png)
node generate-ico.mjs

# 2. Register the file association + icon (run this yourself)
.\Register-ParithiFileType.ps1
```

If PowerShell blocks the script with an execution-policy error, either:

```powershell
# Run just this one script, this one time, bypassing the policy:
powershell -ExecutionPolicy Bypass -File .\Register-ParithiFileType.ps1
```

or right-click `Register-ParithiFileType.ps1` in Explorer → **Run with
PowerShell**.

The script auto-detects VS Code at its usual install locations. If it
can't find it (a portable/non-standard install), pass the path
explicitly:

```powershell
.\Register-ParithiFileType.ps1 -EditorPath "D:\Apps\VSCode\Code.exe"
```

It will offer to restart Windows Explorer at the end so the new icon
appears immediately, instead of waiting for your next sign-in.

## Test it

All of the following read the *same* per-extension registration — there's
nothing extra to configure per-surface; if Explorer shows the icon, every
one of these will too:

1. Create a file named `hello.pr` anywhere (e.g. on the Desktop) — it
   should immediately show the Parithi logo, not the generic blank-page
   icon (no restart needed beyond the one-time Explorer restart the
   install step already did).
2. **Desktop** — same icon, same as any other folder view.
3. **Double-click `hello.pr`** — it should open in VS Code.
4. **Open/Save dialogs** (e.g. VS Code's "Open File...", or any other
   app's file picker) — navigate to a folder with a `.pr` file in it; the
   icon shown there comes from the exact same registry entry.
5. **Taskbar Jump List / "Recent Files"** — open a `.pr` file once (via
   step 3), then right-click VS Code's taskbar icon; the `.pr` file
   should appear in its Jump List with the Parithi icon next to it.
6. **VS Code Explorer** — install the companion extension in
   [`editors/vscode-parithi/`](../../editors/vscode-parithi/) and select
   **Parithi Icons** as the File Icon Theme; VS Code's own file tree,
   tabs, and breadcrumbs then show the same logo too (VS Code draws its
   own UI with its own icon theme mechanism — it does not read Windows'
   per-extension icon association, which is why both pieces exist).

## Uninstall

```powershell
.\Unregister-ParithiFileType.ps1
```

Removes `HKCU:\Software\Classes\.pr` and
`HKCU:\Software\Classes\Parithi.SourceFile` (only if `.pr` still points at
`Parithi.SourceFile` — if something else has since claimed `.pr`, it's
left alone rather than silently overwritten).

## Notes

- **Why `HKEY_CURRENT_USER`, not `HKEY_CLASSES_ROOT`?** `HKCU` needs no
  admin elevation and only affects your own account — the professional,
  least-surprising default for a per-developer tool like this. A
  machine-wide (`HKLM`/`HKCR`) association would need an actual installer
  running elevated, and would affect every user on the machine; that's
  out of scope here; ask if you specifically need it.
- **`logo.png` is 487×454 (not square)** — `generate-ico.mjs` handles this
  automatically (center-crop to a square, then resize), so there's
  nothing to pre-process by hand. If you'd rather control the crop
  yourself (e.g. the logo's important detail isn't centered), pass your
  own pre-cropped square PNG via `--source path\to\square-logo.png`.
- **Want different sizes, or an extra one (e.g. 512×512 for very
  high-DPI displays)?** `node generate-ico.mjs --sizes 16,32,48,256,512`.
- **Also want a plain square PNG out of the same crop** (for something
  other than an `.ico` — this is exactly how the VS Code extension's icons
  are generated)? `node generate-ico.mjs --also-png 256:path\to\out.png`
  (repeatable).
- **Icon not updating?** Windows' icon cache is notoriously sticky.
  `Register-ParithiFileType.ps1` restarts Explorer for you, which is
  usually enough; if it still shows the old icon, sign out and back in.

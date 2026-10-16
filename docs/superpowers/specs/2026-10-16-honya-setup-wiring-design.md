# Honya setup wiring design

Part 1 of 3 of wiring the Honya UI to the core. Part 2 wires the translate flow (Start → Styles → Preflight → Run, with live progress and resume). Part 3 wires assisted review and export. This part makes the Start and Profiles screens work.

## Goal

A user opens Honya and can pick an ASS script and an optional video with the system file dialog, choose or create a series profile, enter a provider key, and edit their base and series profiles. Everything they set survives a restart.

Today the screens render but nothing is wired. `index.html` paints the start screen once, no code calls `window.honya`, profiles live only in memory, and there is no IPC for file dialogs or profiles.

## Scope

In scope: native file dialogs for script, video, and example scripts; a profile store on disk; IPC for profiles, model ids, and dialogs; a React renderer with working Start and Profiles screens.

Out of scope: running a translation, live progress, resume, review, and export (parts 2 and 3). Styles, Preflight, Run, and Review are ported to components with their current content but stay unwired. Updating the default model ids in `models.ts` is a separate task.

## Stack change

The renderer moves to React with TSX. esbuild compiles TSX with `jsx: "automatic"`. New pinned dependencies, each at least a week old: `react`, `react-dom`, `@types/react`, `@types/react-dom`, `eslint-plugin-react-hooks`, and for tests `@testing-library/react` and `jsdom`.

`view.ts`, `view.js` output, and `render.ts` (its `importExampleScript` moves to the main process) are removed. The paper, ink, and orange look moves from inline style strings to classes in `styles.css`. The spec's colors, border, and offset shadow stay the same.

## Structure

### Main process

`main.ts` keeps the window, the existing handlers, and registration. New handlers live in focused files under `src/main/ipc/`, each exporting plain functions that take their dependencies (dialog, store, secrets) as arguments so tests can pass fakes.

- `ipc/files.ts`
  - `pickScript()` opens a dialog filtered to `.ass`, reads the file, checks it parses with `readAss`, and returns `{ path, name, text }`. A cancelled dialog returns `null`. A file that does not parse returns an error.
  - `pickVideo()` opens a dialog filtered to `mkv`, `mp4`, `webm`, `avi`, and `mov`, and returns `{ path, name }` or `null`.
  - `pickExample()` opens a dialog filtered to `.ass`, reads it, and returns `{ name, text, styles }` or `null`, where `styles` is the `classifyScript` guess for each style. Classification runs here because the renderer bundle must not contain `ass-compiler`.
- `ipc/profiles.ts`
  - `listSeries(variant)`, `createSeries(variant, name)`, `renameSeries(variant, id, name)`, `deleteSeries(variant, id)`
  - `loadBase(variant)`, `saveBase(base)`, `saveSeriesRules(variant, id, rules)`
  - `importExample(variant, name, text, dialogueStyles)` reads the script, keeps the visible words of the given styles, and adds them to the base
- `ipc/models.ts`
  - `getModels(provider)` returns the saved override or `defaultModels(provider)`.
  - `setModels(provider, pair)` saves an override. `resetModels(provider)` removes it.
- Keys keep `has-key` and `set-key`. A new `remove-key` deletes a stored key; `SecretStore` gains `removeKey(provider)`.

Channel names follow the existing `honya:<verb>` pattern.

### Profile store on disk

`src/core/library/fileStore.ts` exports `createFileStore(dir)`. It implements the existing `ProfileStore` interface and adds `renameSeries` and `deleteSeries`. It has no Electron import; `main.ts` passes `join(app.getPath("userData"), "profiles")`.

Layout under that folder:

```
base-pt-pt.json
base-pt-br.json
series/pt-pt/<id>.json
series/pt-br/<id>.json
```

A series id is a random UUID made on create. Renaming changes `name` only.

Model overrides are stored in `models.json` in the app data folder, beside `keys.bin`, never inside it and never inside a profile.

### Data change

`BaseProfile.examples` changes from `string[]` to `{ name: string; text: string }[]` so Profiles can list examples by name. `importExample(base, name, text)` takes the name. `compileCard` reads `.text`. The memory store and the library tests follow.

### Preload

`window.honya` gains the new calls. Each reply is checked for shape before it reaches the renderer, as the existing readers do.

### Renderer

- `main.tsx` mounts `App`.
- `App.tsx` holds the active screen and the session choices: script, variant, series id, provider, preset, video, and frame setting. Moving between Start and Profiles keeps them.
- `api.ts` is the only module that touches `window.honya`. Components receive it through a React context so tests can pass a fake.
- Components: `StartScreen`, `ProfilesScreen`, `SeriesPicker`, `KeyField`, `RuleList`, `RuleEditor`, `StyleChecklist`, and an `ErrorLine` shown at the top of the card.
- `StylesScreen`, `PreflightScreen`, `RunScreen`, and `ReviewScreen` render their current content from props and are not reachable yet.

## Behavior

### Start

1. **Script.** "Choose script…" opens the dialog. The field shows the file name. The path and text stay in `App` for part 2. A file that is not valid ASS shows the error and keeps the previous choice.
2. **Variant.** Changing it reloads the series list for that variant and clears the selected series.
3. **Series.** A dropdown lists the variant's series by name. Its last option, "New series…", replaces the dropdown with a name field, Create, and Cancel. Create saves the series and selects it. An empty name, or a name already used in that variant after trimming and ignoring case, is refused with a message.
4. **Provider.** On change, Start asks whether that provider has a key. If not, `KeyField` appears under the dropdown: a password field and Save. Save stores the key and hides the field. The key is not checked against the provider here; the first real call in part 2 reports a bad key.
5. **Preset.** A dropdown, as today.
6. **Video.** "Choose video…" opens the dialog and shows the file name, with a clear button. The frame setting is disabled until a video is chosen.
7. A **Profiles** link in the card header opens Profiles.

### Profiles

The screen shows the variant selected on Start, with a toggle to switch variant. A back link returns to Start.

Left side, the base profile:

- **Characters per second.** A number field, default 17. A whole number from 1 to 60 is saved on change. Anything else is refused with a message and the stored value stays.
- **Rules.** The base rules are listed. `RuleEditor` adds a prose rule (text) or a glossary rule (English source and Portuguese). Each rule has a delete action.
- **Example scripts.** Listed by name, each with a remove action. "Import example…" opens the dialog, then `StyleChecklist` shows the styles and guesses returned by `pickExample`. Dialogue guesses are checked, skip guesses are unchecked, and ambiguous names need a choice. Confirm calls `importExample` with the checked styles, which copies their visible words into the base under the file name. Cancel imports nothing.

Right side:

- **Series.** The variant's series, each with rename and delete. Delete asks for confirmation and names the series and its rule count. Selecting a series shows its rules with add and delete, using the same `RuleList` and `RuleEditor`.
- **Provider keys.** One row per provider: "saved" or "missing", with Replace (opens `KeyField`) and Remove.
- **Model ids.** Cheap and strong fields per provider, filled from `getModels`. A change is saved on blur. "Reset to defaults" removes the override.

Every change to a profile is saved immediately. There is no separate Save button on Profiles.

## Error handling

- A rejected IPC call shows its message in `ErrorLine`. The screen keeps its state. The next successful action clears the line.
- A cancelled dialog is no change, not an error.
- Profile files are checked for shape on load. An invalid series file is left out of the list and reported in `ErrorLine` by file name. An invalid base file is renamed to `<name>.json.bad` and the variant starts from an empty base, and the rename is reported.
- Each profile write goes to a temporary file in the same folder and is renamed over the target, so a crash leaves either the old file or the new one.
- If `safeStorage` encryption is unavailable, saving a key fails with that message. The key is never stored unencrypted.

## Testing

The suite still opens no window and calls no live provider.

- **File store,** against a temporary folder: save and reload a base and a series; list by variant; rename keeps the id; delete removes the file; an invalid series is skipped and reported; an invalid base is moved to `.bad` and an empty base is returned; a failed write leaves the previous file intact.
- **IPC handlers,** as plain functions with a fake dialog and store: invalid arguments are rejected; a cancelled dialog returns `null`; a non-ASS script returns an error; `getModels` returns the override when set and the default otherwise; `resetModels` restores the default.
- **Components,** with React Testing Library on `jsdom` and a fake `api.ts`:
  - Start: choosing a script shows its name; changing variant reloads the series and clears the selection; "New series…" creates and selects; a duplicate name is refused; `KeyField` appears only when the key is missing and disappears after Save; the frame setting is disabled until a video is chosen.
  - Profiles: add and delete a base rule and a series rule; an invalid characters-per-second value is refused; import an example through `StyleChecklist`; rename and delete a series; reset model ids.
  - An API failure shows `ErrorLine` and keeps the screen.
- **Existing tests:** card and library tests use the new `examples` shape. The check that the renderer bundle never contains `ass-compiler` stays, now against the bundled `main.tsx`.

## Units

| Unit | Purpose | Depends on |
| --- | --- | --- |
| `core/library/fileStore.ts` | Profiles on disk | `card.ts`, `types.ts`, `node:fs` |
| `main/ipc/files.ts` | File dialogs, reading and classifying scripts | Electron `dialog`, `core/ass/script`, `core/ass/classify` |
| `main/ipc/profiles.ts` | Profile IPC | `fileStore` |
| `main/ipc/models.ts` | Model id overrides | `core/providers/models`, `node:fs` |
| `preload/preload.ts` | Typed, checked bridge | Electron `ipcRenderer` |
| `renderer/api.ts` | The renderer's only path to main | `window.honya` |
| `renderer/*.tsx` | Screens and controls | `api.ts`, React |

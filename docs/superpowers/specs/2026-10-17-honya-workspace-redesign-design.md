# Honya workspace redesign

The product owner and the translator redesigned Honya around one idea: Honya is a translation workspace where the human works line by line and the AI helps, rather than a "press translate and review at the end" tool. This document describes the new app. It replaces the current Start, Profiles and Translate screens. The translation engine underneath mostly stays.

Mockups from the design conversation are in `.superpowers/brainstorm/` (not committed): `session-layout.html` (option A was chosen) and `entry-flow.html`.

## Intent

The translator spends almost all their time on the **session page**: the whole script on screen, English beside Portuguese. They can translate by hand, run the AI over whatever isn't done yet, deal with the lines the AI flagged, ask for a better version of one line, and turn a line into a rule. Everything saves itself. They can export at any moment.

Around that page: a first-time setup, a window at launch to pick what to work on, and pages for projects, language styles, settings and session stats.

The quality goal is unchanged from earlier work: good translations in the translator's own voice at the lowest cost. The redesign adds two things to that: the human's edits are first-class (the AI never overwrites them and learns from them), and costs are visible.

## Goals

- A **widescreen** app that uses the whole window, opening maximised.
- **First-time setup**: provider, key (tested before continuing), and defaults for new projects.
- A **launch window** to continue the last session, open a project, or create one.
- A **left menu** that is always there, with the main area on the right.
- A **session page** where every line is editable at any time, the AI translates only what is missing, flags are resolved line by line, and single lines can be retranslated or turned into rules.
- **Two language styles** (PT-PT style, PT-BR style) that every project of that language inherits, editable like a project.
- **Projects** (one per series) with reference translations, rules, glossary and characters per second.
- **Quiet learning**: manual edits are collected silently and turned into rule suggestions at export.
- **Session stats** including cost in euros.
- **Autosave** of everything, always.

## Non-goals

- Changing how the engine translates a batch: prompts, schemas, checks, escalation and presets stay as built.
- More than one script per session, or merging scripts.
- Dark mode.
- Cloud sync, accounts or sharing.
- Editing timing, styles or tags. Only the words of dialogue lines change, as today.

## Anti-goals

- **The AI overwriting a line the translator wrote or edited.** Manual lines are never changed by the AI unless the translator explicitly asks for that line ("Ask AI again").
- **Losing work.** A crash, a closed window or a failed export never loses an edit, a decision or a translated line.
- **Spending money the translator didn't ask for**, with one stated exception: the rule-suggestion request at export (one small request on the cheap model).
- **A frozen screen.** While the AI works, the translator sees which lines are being worked on and can keep editing other lines.

## Vocabulary

- **Language style**: "PT-PT style" or "PT-BR style". Same contents as a project, inherited by every project of that language. Replaces today's base profile.
- **Project**: one series. Has a language, and inherits that language's style. Replaces today's series profile.
- **Session**: one script being translated inside a project, with its optional video.
- **Finished session**: exported at least once with every line translated and no open flags. The translator can also mark a session finished, or reopen it, by hand. Unfinished sessions are the ones Continue, Recent sessions and the project switcher lead back to.
- **Line**: one dialogue event of the script.
- **Manual line**: a line whose Portuguese the translator typed or edited. Shown with a small "you" tag.
- **Flag**: a line the AI or the app marked for a look (doubt, hard call, mild note, too long, other variant's forms, broken glossary rule, translation failed), as today.

## The window

- Opens maximised and uses the full width and height. Below a minimum size (builder's call, around 1200×760) the layout may scroll rather than squeeze.
- Two parts: the **left menu** (fixed width) and the **main area** (everything else).
- Visual style stays Honya's current look: paper and ink colours, orange accent, ink borders, hard offset "stamp" shadows, Iowan Old Style. The Figma file "Honya screens" (https://www.figma.com/design/C7ZYwFTNa1Wxvj20b6EHe8, page "Components") holds this look as variables, styles and components; the builder should express the colours, spacing and border widths as CSS variables named after the Figma variables (`color/bg/surface` → `--color-bg-surface`, `space/8` → `--space-8`, and so on) so the two stay aligned.

### Left menu

From top to bottom:

1. Honya name.
2. **Project switcher**: the current project, with a dropdown listing projects and "Manage projects".
3. **Navigation**: Session, Session stats, Projects, Language styles (PT-PT style, PT-BR style), Settings.
4. **Recent sessions**: the last few sessions across projects (script name, project, finished or not). Clicking one opens it.
5. **This session**: a small summary of the open session: lines translated out of total, open flags, cost so far in euros.

## First-time setup

Shown the first time Honya opens (no provider key saved and setup never completed). Can be opened again from Settings.

Step 1, provider:
- Choose a provider (Claude, GPT, Gemini, Mistral), paste a key.
- **Test the key**: one tiny request to that provider's cheap model. Shows "✓ Gemini answered" or the provider's own error message (rejected key, no credit, rate limit…). The user can't continue until a test has passed.

Step 2, defaults for new projects:
- Portuguese: PT-PT or PT-BR.
- Quality preset: Save, Balanced, Best (with a one-line explanation each).
- Video frames: none, only lines that need one, every line.

Finishing saves the key (encrypted, as today), the default provider and the defaults, then shows the launch window.

## Launch window

Shown every time Honya opens (after setup the first time), over the empty app.

- **Continue**: the most recent unfinished session, with its project, script name, progress, open flags and when it was last touched. One button opens it.
- **Projects**: the list of projects with their language. Picking one opens that project's most recent unfinished session, or the session page in its empty state ("Load a script") if it has none. Each project row also has **New session**, which opens a new empty session in that project even when others are unfinished.
- **New project**: name and language (defaults from setup). Creating it opens the empty session page for that project.
- The user can also close it and use the left menu (builder's call on whether that's a close button or clicking outside).

## Session page

Layout (option A from the mockups): the line list fills the main area, with a **line panel** on the right for the selected line.

### Empty state

A new session shows one large **Load script** button (and drop target for an `.ass` file). After loading:
- The dialogue-style check from today runs: styles the app can't classify are asked about once, in the same place, before the lines appear.
- An optional **Attach video** control sits in the top bar. An attached video always shows frames in the line panel; the AI uses frames only as the project's video-frames setting allows.

### Top bar

- Script name, project, language.
- Provider and preset for this session, changeable here (they start from Settings' default provider and the project's preset). Useful when a provider runs out of quota mid-session.
- **Saved** indicator (shows "Saving…" briefly while a write is pending).
- **Export…**
- The main AI button:
  - "Translate with AI" when no line has a translation.
  - "Translate the rest with AI" once some lines are translated (by hand or by AI).
  - Hidden or disabled when every line has a translation.
  - While running: progress ("Batch 3 of 13 · 75 of 304 lines") with elapsed time and **Stop**, as today.

### Filters

Above the list: All, Flagged, Edited by you, Untranslated, each with a count. Plus a text search over English and Portuguese (builder's call).

### Line list

One row per dialogue line: number, start time, speaker, English, Portuguese, status mark.
- Untranslated lines show an empty, faded Portuguese cell.
- Manual lines show a "you" tag.
- Flagged lines show ⚑ in the accent colour.
- Lines the AI is translating right now show a working state.
- The list handles 300–1,000 lines smoothly (virtualise if needed).
- Keyboard: up/down to move between lines, Enter to edit the selected line, Esc to leave the editor (builder's call on further shortcuts).

### Line panel (right)

For the selected line:
- **Frame** from the video at the middle of the line, if a video is attached. Grabbed on demand when the line is selected and cached with the session (existing frame cache). No video: the frame area shows "Attach a video to see frames".
- Line number, speaker, time on screen, character budget (the existing rule: reading speed, or the English length plus 20% or 5 characters).
- The English.
- The Portuguese in an editable box with a live character count against the budget.
- The flag reason, if flagged.
- Actions:
  - **Accept**: clears the flag, keeps the text.
  - **Ask AI again**: retranslates this one line, with an optional short hint ("less formal", "keep the pun"). Uses the strong model with the surrounding lines as context. The new text replaces the current one; if the line was manual, the panel asks once to confirm. *(Decided:)* the result is an AI line again, goes through the same checks as any AI line and can come back flagged; if it comes back clean, the earlier flag counts as resolved by "retranslated".
  - **Make a rule…**: drafts a rule from this line now (one cheap request, as today's rule offer), lets the user edit it and choose where it goes (project, preselected, or the language style).

### Editing

- Any line can be edited at any time, including before the AI has run and while it is running (on lines not currently being translated).
- An edit makes the line manual and clears its flag.
- Edits are recorded for learning: English, the AI's text at the time (if any), and the translator's text.
- *(Decided:)* edits over an AI draft become the project's **past corrections** (the built `{en, draft, final}` record) each time the session is exported; a later correction of the same line replaces the earlier one. Lines typed from scratch with no AI draft are not stored as corrections.
- *(Decided:)* today's per-edit "change similar lines?" offer (`proposeStructural`, one request per edit) is dropped; the export suggestions replace it.
- Clearing a line's Portuguese makes it untranslated again.

### Running the AI

- The AI translates **only untranslated lines**. Manual lines and lines the AI already translated are skipped.
- Manual lines are **context**: they appear as already-translated lines around the batch, so the AI's lines agree with them. *(Builder's note, decided: no extra request is spent on them. The batch prompt shows the manual lines of and around the batch as "already translated by the translator", and the reply's `terms` may include names and terms the model took from them, so they reach the glossary through the existing path.)*
- Lines appear in the list as each batch finishes; flags appear with them.
- Stop finishes the current step and keeps what's done, as today.
- Only one AI run at a time. Switching to another session or closing the window while a run is going asks "Stop the AI run?"; confirming stops it the same way, keeping what's done. Runs don't continue in the background.
- The preset, checks, fix requests and strong-model escalation work as today.

### Autosave

Every change (edit, accept, AI result, attached video, flag decision) is saved to the session on disk within about a second. There is no Save button. Closing the app or switching sessions never loses anything.

## Export

Available at any time from the top bar.

1. A summary: lines translated, lines still in English, open flags that will be written as notes.
2. **Rule suggestions from your edits**: if the session has manual edits, Honya sends them in one request on the cheap model together with the project's and language style's current rules, and proposes new rules (each with the lines it came from and project / language style choice). The user ticks what to keep. Skipped when there are no edits or nothing is worth a rule.
3. Choose where to save (defaults to the script's folder and `<name>.<pt-pt|pt-br>.ass`, as today).
4. Write the file:
   - Untranslated lines keep their English.
   - Lines with an open flag carry `{note: …}` after the text, outside the tags, as today.
   - Accepted and manual lines are written clean.
   - Line breaks follow the English, as today.
5. Show in Finder.

Exporting doesn't end the session; the translator can keep working and export again.

## Language styles and projects

### Language style page (PT-PT style, PT-BR style)

Areas:
- **Reference translations**: finished episodes (optionally with their English scripts). Adding one or several runs the learning pass (built: one strong request per episode, combined across episodes) against the current rules and shows suggestions to tick. Scripts can be added at any time to improve the rules.
- **Rules and glossary**: list, add, edit, delete. Searchable.
- **Characters per second**.
- "Used by N projects: …" because changes reach all of them.
- The language can't change.

### Project page

The same areas, plus:
- Rules and glossary inherited from the language style shown greyed with "from PT-PT style"; the project's own are editable.
- Characters per second with "use the language style's value".
- Quality preset and video frames for the project's sessions (start from the Settings defaults).
- Language, which can't change once the project has sessions.
- The project's sessions, which can be opened, with **New session** to start the next episode, and Mark finished / Reopen on each.
- Rename and delete (delete asks to confirm and says how many sessions go with it).

A **Projects** page lists projects with language, session count and last activity, plus New project.

### Inheritance

What the AI receives for a session in a project:
- Rules: the language style's rules plus the project's.
- Glossary: both; when both define the same English term, the project's form wins.
- Characters per second: the project's value if set, otherwise the language style's.
- Voice: samples from both sets of reference translations.
- Past corrections: the project's (as built).

### Where suggestions go

Every place that creates a rule (Make a rule…, export suggestions, reference learning) offers project or language style, with the project preselected (on a language style page, the style is the only target).

## Settings page

- Default provider.
- Key per provider, with **Test the key** and Remove.
- Defaults for new projects (language, preset, video frames).
- **Euro exchange rate** used for costs (starts at a recent USD→EUR rate; editable).
- Run first-time setup again.
- **Advanced**:
  - Cheap and strong model per provider, chosen from a dropdown of models known to work (curated list in code, defaults marked "recommended"), with Reset to recommended.
  - Show the provider log file.

## Session stats page

For the open session:
- Lines: translated by the AI, translated by you, still untranslated, total.
- Flags: open, resolved (accepted, edited, retranslated).
- Lines sent to the strong model; lines retranslated on request.
- Cost in euros (with the dollar figure and the rate used), tokens in and out, requests, broken down per model. Covers every request of the session: AI runs, Ask AI again, Make a rule, export suggestions.
- Time spent working (the app's active time on the session).
- Frames grabbed.

## Data and migration

- **Language styles** take over today's base profiles (one per variant), keeping their rules, examples (as reference translations) and characters per second.
- **Projects** take over today's series profiles: name, variant, rules, corrections. Their characters per second starts unset (inherits).
- **Sessions** gain a project id, an optional video, per-line state (untranslated, AI, manual; flag and its resolution) and the learning record of edits. Today's sessions (version 2) are migrated: each finished line becomes an AI line, review edits become manual lines, accepted flags become resolved.
- Migration runs once, automatically, and keeps the old files until it succeeds.
- Settings gain: default provider, defaults for new projects, euro rate, setup completed.

## What stays

- The translation engine (`src/core/pipeline`): brief, batches, checks, fix requests, escalation, notes, cost tracking. It needs two additions: translating a given subset of lines with manual lines as context, and retranslating one line with an optional hint.
- ASS reading and writing (`src/core/ass`), including line-break handling.
- Providers, retries, timeouts, structured replies, logging.
- Learning from reference translations (`src/core/library/learn.ts`) and corrections.
- Bundled ffmpeg and the frame cache.
- Strict TypeScript, tests calling core modules directly, no live provider calls in tests.

## Left to the builder

- Component structure, state management and IPC shape in the renderer and main process.
- The curated model lists per provider and the starting euro rate.
- How the line list is virtualised, exact keyboard shortcuts, search behaviour.
- The minimum window size.
- How "time spent" is measured.
- Updating the screen gallery (`npm run gallery`) to show the new screens, so they can be captured into Figma again.

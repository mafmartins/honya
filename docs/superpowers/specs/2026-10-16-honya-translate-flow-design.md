# Honya translate flow design

Part 2 of wiring the Honya UI. Part 1 (setup) made Start and Profiles work: script, video, series, provider key, profiles. This part makes Honya translate: from the Start screen's button to a finished `.ass` file the user can hand on.

It replaces the original MVP plan's separate Styles, Preflight, Run and Review screens, and its split between part 2 (translate) and part 3 (review), with one flow on one screen.

## Intent

The user is a fansubber or hobbyist translator. They want to watch the translation happen, deal with the lines Honya was unsure about once it is done, and end up with the file in Finder and a short account of what happened.

In the user's words: "a visual of what is going on, almost like a live process of seeing things being translated", "the user input part … should be in that same UI", and "when we finish we open Finder with the created file and give a final report on the UI."

## Goals

- One **Translate** screen that carries the whole job: style check (only if needed), live translation, review, done.
- **Live progress.** Lines appear as each batch finishes, English and Portuguese side by side, with progress through the file. Lines Honya is unsure about are marked as they appear.
- **Decisions at the end, never mid-run.** The run does not pause for line decisions. The review starts when the last batch is done.
- **Rule learning from edits.** Editing a line during review runs the existing structural check (`proposeStructural` in `src/core/review/review.ts`). If the edit is a lasting preference, Honya shows the other lines in this episode that would change and offers to save a rule to the series or the base. This runs on every edit, as the original design specifies.
- **Finish.** Honya writes the translated `.ass`, opens Finder with the file selected, and shows a final report on the screen.
- **Resume.** A run interrupted by closing the app or a crash continues from the last finished batch.

## Non-goals

- Pausing the run to ask about a line.
- Cost or token reporting. The provider clients do not return usage today.
- Choosing a different output folder or file name in the UI. See "Output file".
- Changing how the core pipeline translates: batching, escalation, prompts and presets stay as they are. (Returning counters for the report and reporting provider errors are allowed; see below.)
- Updating the default model ids.

## Anti-goals

- A frozen screen. The user must always see that work is happening, which batch is running, and what came back.
- Losing work. A crash, a closed window, or a failed write must never discard finished batches or review decisions.
- Overwriting the source script.
- Changing a line or a profile the user did not accept.

## Flow

### 1. Start → Translate

Start gains a **Translate** button, enabled when a script and a series are chosen and the selected provider has a key. Pressing it moves to the Translate screen. The Start choices (script, variant, series, provider, preset, video, frame setting) travel with it.

### 2. Styles (only when needed)

Honya classifies the script's styles with the existing classifier. If every style is clearly dialogue or clearly skip, this step is skipped. If any style is ambiguous, the Translate screen first shows the style list with Dialogue and Skip for the ambiguous names (the guessed ones prefilled), and a **Start translating** button that stays disabled until every ambiguous style has a choice. The `StyleChecklist` component from part 1 does this already.

If the confirmed list has no dialogue styles, the screen says so ("This script has no dialogue lines in the chosen styles.") and offers Back.

### 3. Live translation

The screen header shows the job: file name, series, variant, provider, preset, and the output path.

Below it:

- **Progress**: "Batch 3 of 12" and a bar, plus a line count ("75 of 290 lines").
- **Live lines**: a scrolling list, newest at the bottom, each row showing the English and the Portuguese. A line Honya was unsure about (a line that will become a flag: it has a `{note: …}`) is marked in orange with its note. The list follows new lines unless the user has scrolled up.
- **Current activity**: one short line on what is happening now: "Reading the episode" (the brief), "Translating batch 3", "Retrying batch 3", "Asking the strong model about 4 lines", "Grabbing frames". *(Builder's call how fine-grained; at least brief, batch, and escalation.)*
- **Stop**: stops after the current batch. Finished batches stay saved and the run can be resumed.

Errors during the run:

Today a provider failure is invisible: `completeChat` turns any non-200 reply into `{ refused: true }`, and the pipeline turns refusals into English lines with `tradução falhou`. A rejected key would silently produce a whole file of English lines. That must change:

- **Provider errors stop the run.** The provider layer reports a failed call as an error carrying the provider's message and its kind: authentication (401/403), rate limit (429), server (5xx), or network. Rate-limit, server and network errors are retried with backoff (1 s, 4 s, 15 s) before they count as failed; authentication errors are not retried. *(My call.)*
- When a call still fails, the run stops after saving the finished batches. The screen shows the provider's message in the error line (for a rejected key: "Claude rejected the key. Replace it on Profiles."), with **Retry** (continue from the last finished batch) and **Back to Start**.
- **Content problems keep today's behavior.** A real model refusal, a reply with the wrong number of lines, or rewritten tags is still retried once, then escalated, then left in English with `tradução falhou`, exactly as the pipeline does now.
- The activity line shows retries ("Rate limited, retrying in 4 s").

### 4. Review

When the last batch is done:

- **No marked lines**: skip to step 5.
- **Marked lines**: the screen becomes the review. It follows the original review design:
  - Header: series · file name · remaining flag count, and variant · preset.
  - Left: the current line, with the previous and next lines faded, and its note.
  - Right: the English source, an edit field with the Portuguese, and **Accept**.
  - Accept stores the edit (if any) and clears the flag. Accepting leaves the `{note}` in the text, as the original design specifies.
  - Navigation moves through the flagged lines in order. Any line in the file, flagged or not, can be opened from the list and edited.
  - **Review state** *(my call)*: the session keeps an explicit overlay, separate from the translation results: the edited words per line, and the set of accepted flags. A flag exists for every line whose translation has a note; it closes only when the user presses Accept on it, whether or not they edited it, and removing the note text does not close it. Editing a line that had no note does not create a flag. The overlay is applied when the file is written. Rebuilding the draft from the results never reopens accepted flags.
  - When an edit changes the words, Honya runs the structural check before storing it, using the session's provider and its **cheap** model. While it runs, the right side shows "Checking whether this is a lasting change…".
  - If the check returns a proposal, the right side shows two independent choices *(my call)*:
    - **The other lines**: the affected lines (before → after), with "Also change these N lines" checked by default. Unchecking keeps the edit on the edited line only.
    - **The rule**, when the proposal has one: **Save to series**, **Save to base**, or **Don't save**.
    - **Confirm** applies both choices together. Nothing changes until Confirm. If the proposal has no rule, only the lines choice shows; if it has no other lines, only the rule choice shows.
  - If the check fails or the model refuses, the edit is stored on that line only and the screen says the check could not run, with **Retry check**.
  - A saved rule goes through the existing profile handlers, so it is in the profile for the next episode. It does not re-translate this episode.
  - **Finish** is enabled when no flags are open, matching the existing rule that open flags block export.

Review decisions are saved to the session as they are made, so a crash during review resumes in review with the decisions kept.

### 5. Done

Honya writes the translated `.ass` to the output path, then calls Electron's `shell.showItemInFolder` on it. The screen shows the report and two buttons: **Show in Finder** (again) and **Translate another** (back to Start, keeping variant, series, provider and preset, clearing script and video).

**Report.** Some of these the pipeline does not record today; it may return counters for them (additive, no change to how it translates) *(my call)*:

- Lines translated, out of the dialogue lines in the file.
- Lines sent to the strong model.
- Lines left in English (`tradução falhou`).
- Lines over the characters-per-second limit.
- Flags: how many, how many edited, how many accepted as they were.
- Rules saved, and where (series or base).
- Frames: how many used, and cues whose frame could not be grabbed.
- Events copied unchanged (tags that could not be split safely).
- Time taken.
- The output path.

If writing the file fails (for example a read-only or locked destination), the screen shows the error and **Try again**; the session stays intact, as the original design specifies. Discarding a session never deletes a written output file.

## Output file

The output path is the existing `proposedOutputPath`: next to the source, named `<name>.<variant>.ass` (for example `subs.pt-pt.ass`). It is never the source path. If a file already exists at that path, it is replaced; it is shown in the header before the run starts, so the user knows. *(My call; a "Save as…" choice can come later.)*

## Resume

Sessions are already saved after every batch (`userData/sessions/<id>.json`).

- When Start opens and an unfinished session exists (run not finished, or review not finished), Start shows a card above the form: "Unfinished: subs.ass · Kimetsu no Yaiba · batch 5 of 12" (or "in review, 3 flags left"), with **Resume** and **Discard**. Discard asks for confirmation and deletes the session file.
- Resume opens the Translate screen at the same point: the run continues from the next batch, or the review opens with its decisions.
- Only the most recent unfinished session is offered. *(My call; older ones stay on disk and are not listed.)*
- The session stores everything a resume needs: script path and text, confirmed dialogue styles, series id, variant, provider, preset, frame setting, video path, output path, the style card, the saved run, the review overlay, report counters, and elapsed time. It carries a format version; session files from before this change are not offered for resume. *(My call; only development builds have them.)*
- Frames are not stored. On resume, frames for the remaining batches are grabbed again if the video is still there; if it is not, the run continues without pictures and the report says so. *(My call.)*
- If the script file has changed or moved since the session started, resume refuses with "subs.ass changed since this translation started." and offers Discard. *(My call: the session stores the script text; compare it with the file on disk.)*
- The style card used for the session is stored with it, so a resumed run translates with the same card even if the profile changed meanwhile.

## How it fits the existing code

These are the user-visible requirements' consequences for the code, with the decisions already made in part 1:

- **Progress events.** `honya:start` currently runs every batch inside one IPC call and returns at the end. The main process must instead push progress to the renderer as each batch finishes and as activity changes (`webContents.send` on a `honya:progress` channel), and the preload must expose a subscription the renderer can attach and remove. The run itself keeps using `runTranslation` / `resumeTranslation` one batch at a time, as `startTranslation` already does.
- **Starting returns early.** Starting a run returns the session id immediately; completion, stop and failure arrive as events. The main process reads the script from its path and builds the style card from the stored profiles (a missing base counts as an empty base, as in part 1).
- **Replaces the old contract.** The new start, review and finish calls replace `honya:start`, `honya:preflight` and `honya:export`, and the `autonomous` / `assisted` mode goes away: a run with no flags finishes straight away, which is what autonomous meant. *(My call.)*
- **One run at a time.** While a run is active, starting another is refused with "A translation is already running." *(My call.)*
- **Stop.** A stop request is honored between batches; the brief and the current batch finish first, and the screen says "Stopping after this batch…" meanwhile.
- **Review over IPC.** New calls for: loading the draft lines and flags of a session, accepting a line (with or without an edit), running the structural check for an edit, applying a proposal choice (including saving the rule through the existing profile handlers), and finishing (write + reveal). Each call saves the session.
- **Validation.** Every new IPC argument is validated in the main process, as `src/main/ipc/register.ts` does, and every reply is shape-checked in the preload, as `src/preload/readers.ts` does.
- **Renderer.** One `TranslateScreen` with its phases as components. The existing `StylesScreen`, `PreflightScreen`, `RunScreen` and `ReviewScreen` placeholders from part 1 are replaced or reused as those phase components. `App` gains the Translate screen alongside Start and Profiles.
- **Testing.** Same rules as part 1: no live provider and no window in the default suite. The main-process run is tested with the existing fake completer, including progress events, stop between batches, a failed batch, and resume. Components are tested with the fake API, including the no-flags path, a structural proposal, a failed check, and Finish blocked by open flags.

## Left to the builder

- How fine-grained the activity line is beyond brief, batch and escalation.
- The exact layout of the live line list and progress bar, within the paper, ink and orange style.
- Keyboard shortcuts in review (for example Enter to accept).
- How the main process tracks the one active run.

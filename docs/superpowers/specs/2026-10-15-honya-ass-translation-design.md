# Honya MVP design

Honya is an open-source desktop app for fansubbers and hobbyist translators. It translates the dialogue of an English ASS script into European or Brazilian Portuguese, in the user's own voice, for the lowest cost that still meets a chosen quality bar.

The app runs locally on Linux, macOS, and Windows. Scripts, profiles, and API keys stay on the machine. There is no account and no hosted service.

## Goals

- Highest translation quality practical for the money spent on one file.
- A finished ASS the user can hand to the next person, with doubts still visible in the lines.
- House style that survives from episode to episode without resending old scripts on every call.

## Scope

A session translates one English ASS file into one variant, PT-PT or PT-BR. The source of the words is always that subtitle file. A video is optional context. Honya never invents dialogue from the picture or the audio.

Only dialogue events are translated. Signs, songs, and karaoke are copied through unchanged. On a dialogue line, override tags, line breaks, and timing stay as they are. Only the words change.

The user brings their own key for one provider per session: Claude, GPT, Gemini, or Mistral. That provider supplies both the cheap model and the strong model, so a file does not change voice halfway through. Each provider setting stores those two model ids. Built-in defaults are used until the user replaces them.

Out of scope for this version: speech or OCR from a raw video, translating signs, songs, or karaoke, SRT input, mixing providers inside one file, rebreaking lines to fit a cue, accounts, and sharing profiles between machines.

## Profiles

Two layers, both stored on the machine.

A **base profile** is either PT-PT or PT-BR. It holds imported example scripts, prose rules, and a characters-per-second limit. The limit defaults to 17 and can be changed. Importing an example script copies its dialogue into the profile, so the card still builds if the file later moves.

A **series profile** belongs to one variant and one show. It holds that show's names, terms, and tone. The same show in the other variant is a separate series profile.

The compiler turns one base plus one series into a **style card**: voice, rules, names, and terms. The card is rebuilt when either profile changes. During a run the pipeline reads the card, never the raw scripts. A profile with no examples and no rules still compiles. The card then carries no house style, and the first episode can run.

A rule is a short instruction or a glossary pair (source term, Portuguese term). It is saved only after the user accepts it, and the user chooses the series profile or the base. Saving a rule marks the card stale. The next load recompiles it. That recompile applies to later episodes. It does not retranslate the file already open.

## Pipeline

Approach for this version: compile the style card, read the episode once, translate in batches, and send the preset's selected lines to the stronger model. There is no tool-using agent.

1. **Style check.** The script reader parses the ASS and splits override tags from words. It guesses which styles are dialogue. Names treated as dialogue include Default, Dialogue, Main, Alt, Italic, Thought, Flashback, and Narration, plus any name containing "dialogue". Names treated as non-dialogue include Signs, Sign, Song, Songs, Karaoke, OP, ED, and Title, plus any name containing "sign", "song", "karaoke", or "credit". A name that matches both lists, and any other name, is ambiguous. The user corrects the full list before the run. Ambiguous names are asked, not guessed. No model is called before the list is accepted. Confirming zero dialogue styles stops the run.

2. **Preflight.** Honya shows the provider, the preset, the dialogue line count, the frame count, and the output path. The user accepts, and only then does the first paid call happen.

3. **Episode brief.** One pass over the English dialogue returns names, terms, jokes, who is speaking (from the ASS name field when it is filled in), lines that look hard, and lines likely to run long. When frames are selective, the brief also marks which cues need a picture. The brief seeds the glossary: each source term paired with the Portuguese form to reuse.

4. **Frames.** If a video is attached, the user has already chosen none, only the marked lines, or every dialogue line. The frame grabber returns one image near the middle of a cue, and only for cues the setting includes. Images are sent with the call and then discarded.

5. **Batches.** Dialogue is translated in batches of 25 lines. The last batch may be shorter. Each batch carries the style card, the brief, and the glossary. A glossary entry is a source term paired with the Portuguese form already chosen. Later batches reuse those forms, and new choices are added before the next batch starts. The cheap model returns the Portuguese and may mark a line as a doubt, a hard call, or a milder note. Tags are spliced back onto the translated words.

6. **Fit check.** Visible characters (tags removed) divided by the cue duration in seconds. A line over the profile limit is marked as not fitting. Line breaks inside the event are preserved. The check uses the whole visible text and the whole cue.

7. **Escalation.** A second chat completion, with the style card, the brief, and the reason the line was included. The presets are nested. Save is the smallest set, Best is the largest.
   - **Save.** Lines the cheap pass marked as a doubt or a hard call.
   - **Balanced.** The Save set, plus lines the brief marked hard, plus lines that do not fit.
   - **Best.** The Balanced set, plus every other line the cheap pass marked with a note reason.

8. **Notes.** The app, not the model, writes the note. The form is `{note: short reason}` at the end of the dialogue text, outside the tags. Reasons are in the target variant. After the passes that apply to a line, a remaining doubt, hard call, milder note, or a line that still does not fit gets a note. If the strong model returns a line clean and it fits, no note is written for that line.

9. **Draft.** The ASS is rewritten in memory with the same structure as the source. Each completed batch is saved into the session before the next batch starts, so a review or a retry can resume.

The output path is proposed at preflight as `<source-stem>.pt-pt.ass` or `<source-stem>.pt-br.ass` beside the source. The user can change it there. The English file is never overwritten. The session, including finished batches, the draft, and the flags, is stored in the app's data directory on the machine.

## Modes

**Autonomous.** When the draft exists, Honya writes the ASS to the chosen path. Notes are in the dialogue text. There is no review gate.

**Assisted.** The same draft opens on the review screen. A flag is the review state on a noted line. It lives in the session, not in the ASS. Export stays blocked until every flag is accepted. Accepting a flag leaves the `{note}` in the text. Any line, flagged or not, can be opened. The right side then shows the English source and the edit. Accept stores the edit, and on a flagged line it also clears the flag.

An edit is checked for a structural change. If it is one, the user sees the other lines that would change and, when the edit looks like a lasting preference, an offer to save a rule on the series or the base. Nothing in the draft or the profile changes until the user accepts that proposal. Declining the rule keeps the edit on the line they changed.

## Screens

Three colors: warm paper, ink, and orange. Orange is the flag, the note, and the main action. Cards have an ink border and a hard offset shadow.

Assisted review is a split card. The left side shows the current dialogue line, with the previous and next lines faded. The right side shows the English source and Accept. The header shows the series, the file name, the remaining flag count, the variant, and the preset. A structural proposal replaces the right side with the other affected lines and the rule offer.

The other screens are the same card:

- **Start.** File, variant, series, provider, and preset on the left. The user picks an existing series profile or creates one here. Optional video and frame setting on the right.
- **Styles.** Guessed dialogue styles on the left. Names the tool will not decide on the right.
- **Preflight.** Line count and frame count on the left. Provider, preset, output path, and the start action on the right.
- **Run.** Batch progress on the left. The latest line written on the right. Autonomous mode ends on the path of the new file. Assisted mode opens the review card.
- **Profiles.** The base for the selected variant, its rules, and its example scripts on the left. The series list for that variant on the right. Provider keys, and the cheap and strong model ids, are edited from this screen.

## Error handling

A run does not start when the key is missing, the ASS cannot be parsed, the style card cannot be compiled, or the style list is unconfirmed or empty.

A failed call is retried with backoff. If a batch comes back with the wrong number of lines, or with tags rewritten, that batch is retried once and then those lines are escalated. If the strong model still cannot return a clean line, the original English stays in that cue and the line gets `{note: tradução falhou}`.

An event whose tags cannot be split safely is copied through unchanged, skipped by the model, and listed in a session report.

A missing or unreadable video asks once whether to continue without pictures. One cue whose frame cannot be grabbed is translated from the text alone and named in the session report. Frame trouble does not add a note.

If the app closes mid-batch, resume retries only that batch. Finished batches stay.

In assisted mode, a failed structural check keeps the edit on that line, withholds sibling updates, and can be retried. A rule that fails to save leaves the draft change in place and reports that the profile was not updated. An export that cannot write to disk leaves the session intact. Open flags still block export.

## Testing

The default suite never calls a live provider. A fake model returns scripted completions, including a short reply, a reply with the wrong number of lines, and a refusal.

- **Script.** Fixture ASS files round-trip styles, timing, and override tags. Tag split and splice cover positioning and italics. Known dialogue names are classified as dialogue. An unknown name is left for the user. Signs, songs, and karaoke are copied through. A line over 17 characters per second is marked as not fitting. A note is appended outside the tags. An event whose tags cannot be split is copied unchanged.
- **Library.** PT-PT and PT-BR cards stay separate. A series rule appears on that show's card and not on the other variant. Saving a rule marks the card stale, and the next load recompiles it. An empty profile still compiles. API keys never appear in a card or in an exported script.
- **Pipeline.** Escalation is a pure function of the preset, the cheap-pass marks, the brief, and the fit check. Save, Balanced, and Best each have a table of cases, and every Best set contains its Balanced set, which contains its Save set. Batches hold 25 lines, except a shorter final batch, and pass glossary entries forward. A failed batch is retried, then escalated. If the strong reply is still unusable, the English text remains and the line carries `{note: tradução falhou}`. A session saved after batch two resumes at batch three.
- **Review.** Open flags block export. Accepting a flag leaves the note in the text. A structural edit proposes the other lines and a rule. Declining the rule keeps the edit on the changed line. Export writes the notes and drops the flags.
- **Preflight.** An unconfirmed style list, a missing key, or zero dialogue styles produces no model call.

## Units

Five parts, each usable without reading the others.

- **Library.** Keys, base profiles, series profiles, and style cards.
- **Script.** ASS read and write, tag split and splice, style classification, fit check.
- **Frames.** One image for one cue. Nothing else.
- **Pipeline.** Brief, batches, escalation, and notes.
- **Review.** Assisted mode only. Flags, edits, propagation, and rule offers.

const VARIANTS = ["pt-pt", "pt-br"];
const PRESETS = ["save", "balanced", "best"];
const PROVIDERS = ["claude", "gpt", "gemini", "mistral"];
const CARD_STYLE = "background:#faf7f2;color:#2a2420;border:1.5px solid #2a2420;box-shadow:7px 7px 0 #2a2420;accent-color:#e36b1e";
export function render(state) {
    return `<article class="card" style="${CARD_STYLE}">${screenBody(state)}</article>`;
}
export function acceptStyleList(state) {
    const next = cloneState(state);
    next.styleListAccepted = true;
    return next;
}
export function setStyleGuess(state, name, guess) {
    const styles = state.styles;
    if (styles === undefined) {
        return state;
    }
    const next = cloneState(state);
    next.styles = styles.map((style) => (style.name === name ? { name: style.name, guess } : style));
    return next;
}
function cloneState(state) {
    const next = {
        screen: state.screen,
        series: state.series,
        fileName: state.fileName,
        variant: state.variant,
        preset: state.preset,
        provider: state.provider,
        openFlagCount: state.openFlagCount,
        current: state.current,
        proposal: state.proposal,
    };
    if (state.styles !== undefined) {
        next.styles = state.styles;
    }
    if (state.styleListAccepted !== undefined) {
        next.styleListAccepted = state.styleListAccepted;
    }
    if (state.preflight !== undefined) {
        next.preflight = state.preflight;
    }
    if (state.run !== undefined) {
        next.run = state.run;
    }
    if (state.profiles !== undefined) {
        next.profiles = state.profiles;
    }
    if (state.coreProposal !== undefined) {
        next.coreProposal = state.coreProposal;
    }
    if (state.flags !== undefined) {
        next.flags = state.flags;
    }
    return next;
}
function screenBody(state) {
    switch (state.screen) {
        case "start":
            return renderStart(state);
        case "styles":
            return renderStyles(state);
        case "preflight":
            return renderPreflight(state);
        case "run":
            return renderRun(state);
        case "review":
            return renderReview(state);
        case "profiles":
            return renderProfiles(state);
    }
}
function renderStart(state) {
    const file = field("file", `<input type="text" name="file" value="${escapeAttr(state.fileName)}">`);
    const variant = field("variant", selectControl("variant", VARIANTS, state.variant));
    const series = field("series", `<input type="text" name="series" value="${escapeAttr(state.series)}">`);
    const provider = field("provider", selectControl("provider", PROVIDERS, state.provider));
    const preset = field("preset", selectControl("preset", PRESETS, state.preset));
    const create = `<button class="action" type="button" style="color:#e36b1e">Create series profile</button>`;
    const video = field("video", `<input type="file" name="video">`);
    const frames = field("frame setting", frameSetting());
    return `<div class="split"><div>${file}${variant}${series}${provider}${preset}${create}</div><div class="decision">${video}${frames}</div></div>`;
}
function renderStyles(state) {
    const styles = state.styles;
    const items = styles === undefined ? "" : styles.map((style) => renderStyle(style)).join("");
    return [
        `<div class="split">`,
        `<div><ul class="styles">${items}</ul></div>`,
        `<div class="decision">`,
        `<button class="action" type="button" name="styleListAccepted" value="true" style="color:#e36b1e">Accept</button>`,
        `</div></div>`,
    ].join("");
}
function renderStyle(style) {
    const actions = style.guess === "ambiguous"
        ? `<button type="button">Dialogue</button><button type="button">Skip</button>`
        : "";
    return `<li data-style="${escapeAttr(style.name)}"><span class="name">${escapeText(style.name)}</span> <span class="guess">${style.guess}</span>${actions}</li>`;
}
function renderPreflight(state) {
    const summary = state.preflight;
    const lineCount = summary === undefined ? "" : String(summary.dialogueLineCount);
    const frameCount = summary === undefined ? "" : String(summary.frameCount);
    const provider = summary === undefined ? "" : summary.provider;
    const preset = summary === undefined ? "" : summary.preset;
    const outputPath = summary === undefined ? "" : summary.outputPath;
    return [
        `<div class="split">`,
        `<div><p>line count</p><p>${lineCount}</p><p>frame count</p><p>${frameCount}</p></div>`,
        `<div class="decision">`,
        `<p>provider</p><p>${provider}</p>`,
        `<p>preset</p><p>${preset}</p>`,
        `<p>output path</p><p>${escapeText(outputPath)}</p>`,
        `</div></div>`,
    ].join("");
}
function renderRun(state) {
    const run = state.run;
    const batchIndex = run === undefined ? "" : String(run.batchIndex);
    const latest = run === undefined ? "" : escapeText(run.latest.words);
    const event = run === undefined ? "" : ` data-event="${String(run.latest.eventIndex)}"`;
    return [
        `<div class="split">`,
        `<div><p>batch index</p><p>${batchIndex}</p></div>`,
        `<div class="decision"><p>latest line</p><p${event}>${latest}</p></div>`,
        `</div>`,
    ].join("");
}
function renderReview(state) {
    const header = [
        `<header class="card-header">`,
        `<p>${escapeText(state.series)} · ${escapeText(state.fileName)} · ${String(state.openFlagCount)} flags</p>`,
        `<p>${state.variant} · ${state.preset}</p>`,
        `</header>`,
    ].join("");
    return `${header}${renderFlagList(state.flags)}<div class="review-body"><div class="lines">${reviewLines(state)}</div>${reviewDecision(state)}</div>`;
}
function renderFlagList(flags) {
    if (flags === undefined) {
        return "";
    }
    const items = flags
        .map((flag) => {
        const open = flag.open ? "true" : "false";
        return `<li data-event="${String(flag.eventIndex)}" data-open="${open}"></li>`;
    })
        .join("");
    return `<ul class="flags">${items}</ul>`;
}
function renderProfiles(state) {
    const profiles = state.profiles;
    const rules = profiles === undefined ? "" : profiles.rules.map((rule) => `<li>${escapeText(formatRule(rule))}</li>`).join("");
    const examples = profiles === undefined ? "" : profiles.examples.map((name) => `<li>${escapeText(name)}</li>`).join("");
    const series = profiles === undefined ? "" : profiles.series.map((name) => `<li>${escapeText(name)}</li>`).join("");
    const providerKey = profiles === undefined ? "" : profiles.providerKey;
    const cheapModel = profiles === undefined ? "" : profiles.cheapModel;
    const strongModel = profiles === undefined ? "" : profiles.strongModel;
    const ruleList = `<p>base rules</p><ul class="rules">${rules}</ul>`;
    const exampleList = `<p>example script names</p><ul class="examples">${examples}</ul>`;
    const exampleFile = field("example script", `<input type="file" name="example">`);
    const seriesList = `<p>series</p><ul class="series-list">${series}</ul>`;
    const key = field("provider key", `<input type="password" name="providerKey" value="${escapeAttr(providerKey)}">`);
    const cheap = field("cheap model id", `<input type="text" name="cheapModel" value="${escapeAttr(cheapModel)}">`);
    const strong = field("strong model id", `<input type="text" name="strongModel" value="${escapeAttr(strongModel)}">`);
    return `<div class="split"><div>${ruleList}${exampleList}${exampleFile}</div><div class="decision">${seriesList}${key}${cheap}${strong}</div></div>`;
}
function reviewLines(state) {
    const current = state.current;
    if (current === null) {
        return "";
    }
    return `${faded(current.before)}<p class="current">${escapeText(current.words)}</p>${noteLine(current.note)}${faded(current.after)}`;
}
function reviewDecision(state) {
    const proposal = state.proposal;
    if (proposal !== null) {
        const siblings = proposal.siblings.map((line) => `<li>${escapeText(line)}</li>`).join("");
        const rule = proposal.rule === null ? "" : escapeText(proposal.rule);
        return proposalColumn(siblings, rule);
    }
    const core = state.coreProposal;
    if (core !== undefined) {
        const siblings = core.siblings
            .map((line) => `<li data-event="${String(line.eventIndex)}">${escapeText(line.words)}</li>`)
            .join("");
        const rule = core.rule === null ? "" : escapeText(formatRule(core.rule));
        return proposalColumn(siblings, rule);
    }
    const english = state.current === null ? "" : escapeText(state.current.english);
    return [
        `<div class="decision" style="border-left:1.5px dashed #2a2420">`,
        `<p class="english">${english}</p>`,
        `<button class="accept" type="button" style="color:#e36b1e">Accept</button>`,
        `</div>`,
    ].join("");
}
function proposalColumn(siblings, rule) {
    return [
        `<div class="decision" style="border-left:1.5px dashed #2a2420">`,
        `<ul class="siblings">${siblings}</ul>`,
        `<p class="rule">${rule}</p>`,
        `<button type="button">Save to series</button>`,
        `<button type="button">Save to base</button>`,
        `<button class="action" type="button" style="color:#e36b1e">Decline rule</button>`,
        `</div>`,
    ].join("");
}
function formatRule(rule) {
    if (rule.kind === "prose") {
        return rule.text;
    }
    return `${rule.source} → ${rule.pt}`;
}
function noteLine(note) {
    if (note === null) {
        return "";
    }
    return `<p class="note" style="color:#e36b1e">{note: ${escapeText(note)}}</p>`;
}
function faded(text) {
    return `<p class="faded">${escapeText(text)}</p>`;
}
function frameSetting() {
    return [
        `<select name="frames">`,
        `<option value="none">none</option>`,
        `<option value="marked">only the marked lines</option>`,
        `<option value="every">every dialogue line</option>`,
        `</select>`,
    ].join("");
}
function field(label, control) {
    return `<label><span>${label}</span>${control}</label>`;
}
function selectControl(name, choices, selected) {
    const options = choices
        .map((choice) => {
        const selectedAttr = choice === selected ? " selected" : "";
        return `<option value="${choice}"${selectedAttr}>${choice}</option>`;
    })
        .join("");
    return `<select name="${name}">${options}</select>`;
}
function escapeText(text) {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function escapeAttr(text) {
    return escapeText(text).replaceAll('"', "&quot;");
}

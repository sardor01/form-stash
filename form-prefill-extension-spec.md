# Form Prefill & State Replay — Chrome Extension (Technical Spec)

## 1. Goal

A Chrome (MV3) extension for **testing forms during development**. It captures the
filled state of a form, saves it as a named **Preset** under a **Project**, and later
replays (pre-fills) that state into the same form on demand. Built to work against
modern SPA forms (React, Vue) including custom component libraries (Ark UI, Radix UI,
shadcn), date pickers, and rich-text editors.

This is a developer/testing tool used on the author's own apps, so it can request broad
host permissions and does not need to be hardened against hostile pages.

---

## 2. Core concepts & hierarchy

```
Project            (workspace grouping, optional — for filtering)
└─ Form            ("parent form" — a multi-step form, has a label + ordered steps)
   └─ Step preset  (one captured step: its own label + field snapshots)
└─ Preset          (standalone single-step preset, not part of any Form)
```

- **Field snapshot** — one captured field: its identifier(s), type, and value.
- **Preset** — a named set of field snapshots taken from one form/route at one moment.
  A preset is either **standalone** (a one-step form) **or** a **step of a Form**.
- **Form (parent form)** — a labelled container representing a multi-step form. It owns an
  **ordered** list of step presets ("Step 1", "Step 2", …). You can see the parent and
  expand it to view each step. Steps stay separate presets because they live on different
  routes and not all fields are mounted at once.
- **Project** — a top-level grouping (e.g. "Truck Crate App") for filtering. A Project
  contains Forms and/or standalone presets. A step preset inherits its project from its
  Form.

---

## 3. User flows

### 3.1 Capture (save a state)

There are **two ways to trigger a capture**; both produce a field snapshot (§6) that flows
into the **same save form** (step 3 below).

**A. Auto, on submit** *(can be disabled via `settings.autoPromptOnSubmit`)*
1. User fills the form and clicks its submit button (`button[type=submit]`,
   `input[type=submit]`, or a `<button>` with no explicit type inside a `<form>`), or
   presses Enter. The capture-phase listener fires *before* the app's handlers and
   **synchronously snapshots** all detected fields in the **owning form** (the `<form>`
   that contains the button); if there's no `<form>`, a configured container / the document.
2. An in-page modal appears: **"Save these N field values as a preset?"** → `[Save]` `[Dismiss]`.
   - The original submit is **NOT blocked by default** (app validation/handlers run as
     normal during testing). Setting `preventSubmitOnCapture` flips this.

**B. Manual, from the side panel** *(works any time, no submit needed)*
1. User opens the side panel and clicks **"📸 Capture this page"**.
2. The panel messages the active tab's content script (`CAPTURE_NOW`), which snapshots
   the page and returns the result. **Target resolution:**
   - Exactly one form-like container on the page → use it.
   - Multiple → show a quick picker: list each form with its field count
     (`Form 1 · 8 fields`, `Form 2 · 3 fields`, `Everything on page`). Optionally a
     **pick mode**: hover highlights candidate containers, click to choose.
   - No `<form>` element → capture all detected fields in the document (or the picked
     region).
3. The save form (below) opens **inline in the side panel** with the captured count.

**Shared save form** (used by both A's modal and B's panel):
3. Collect:
   - **Label** (free text, required) — e.g. "Shipper details".
   - **Save as**: `○ Standalone preset` or `○ Step of a form`.
   - If **Step of a form**: pick an existing **Form** or "➕ Create new form…" (with a
     form label), and a **Step #** (auto-filled with the next index for that form, editable).
     The step inherits the Form's project.
   - If **Standalone**: pick a **Project** (dropdown + "➕ Create new project…" inline).
4. Save writes to `chrome.storage.local`; a confirmation toast shows.

### 3.2 Replay (pre-fill)
1. User opens the form route and opens the extension **side panel**.
2. Side panel shows the **presets tree** (see §11). Presets/steps whose stored URL/path
   match the current tab are surfaced at the top (non-blocking hint, not a hard filter) —
   so when you land on a form's step-2 route, that step's preset is highlighted.
3. User searches/filters and clicks **Apply** on a preset.
4. The content script runs the **fill engine** (§9 + §10): for each field it waits for
   the element to appear (lazy renders), fills it with the framework-correct method, and
   records success/failure.
5. A **fill report** returns to the side panel: e.g. `12 / 14 filled · 2 not found`,
   with the list of skipped/failed fields.

### 3.3 Manage
- Create / rename / delete **projects**. Deleting a project prompts: delete its contents,
  or unassign them (move to "No project").
- Create / rename / delete **forms**. Deleting a form prompts: delete its steps, or detach
  them into standalone presets. **Reorder steps** (drag or edit Step #); renumber stays
  contiguous.
- Edit a preset/step's label, project, or which form+step it belongs to; move a standalone
  preset into a form as a step (and vice-versa); duplicate; delete; re-capture (overwrite
  values from the current page).

---

## 4. Architecture (Manifest V3)

| Surface | Responsibility |
|---|---|
| **Content script** (`all_frames: true`) | Submit detection, field snapshot (on submit **and** on-demand via `CAPTURE_NOW`), form-target picker, in-page save modal, fill engine. Reads/writes `chrome.storage.local` directly. |
| **Side panel** (`chrome.sidePanel`) | Main UI: **"Capture this page"** button + inline save form, presets tree, search, project/form filters, CRUD, Apply action, fill report. |
| **Service worker** | Message routing between side panel and the active tab's content script; opens the side panel on toolbar click. Minimal logic. |
| **Toolbar popup** *(optional)* | Quick launcher: "Open panel", quick-apply last-used preset for this page. |

`chrome.storage.local` is shared across all three contexts, so storage logic can live in
a small shared module imported everywhere.

**Recommended build stack:** WXT (or CRXJS + Vite) · React + TypeScript · Tailwind v4 ·
zod for stored-data validation. This matches the apps under test and keeps the side-panel
UI ergonomic.

> Use **`chrome.storage.local`**, NOT page `window.localStorage`. `localStorage` is
> per-origin and not the extension's own store; `chrome.storage.local` is the extension's
> shared, structured store. Add the `unlimitedStorage` permission to avoid the ~5 MB cap.

---

## 5. Data model

```ts
interface Project {
  id: string;          // uuid
  name: string;
  createdAt: number;
}

type FieldType =
  | 'text' | 'textarea' | 'number' | 'email' | 'url' | 'tel' | 'password'
  | 'select' | 'multiselect'
  | 'checkbox' | 'radio'
  | 'date' | 'datetime-local' | 'time' | 'month' | 'week'
  | 'custom'           // Ark/Radix combobox, listbox, switch, etc.
  | 'contenteditable'; // rich text / plain contenteditable

interface FieldSelector {
  // tried in order at replay time; first hit wins
  name?: string;            // [name=...] scoped to form
  id?: string;              // #id
  testId?: string;          // [data-testid] / [data-test] / [data-cy]
  ariaLabel?: string;       // aria-label or associated <label> text
  cssPath?: string;         // generated relative CSS path within the form
}

interface FieldSnapshot {
  selector: FieldSelector;
  type: FieldType;
  value: string | string[] | boolean | null;
  // For custom widgets, store BOTH so the fill engine can pick a strategy:
  visibleLabel?: string;    // human-readable option text (e.g. "United States")
  underlyingValue?: string; // value of the hidden native control if one exists
  inShadowRoot?: boolean;
}

interface Preset {
  id: string;
  label: string;            // step label ("Shipper details") or standalone label
  url: string;              // full href at capture time
  origin: string;           // scheme + host
  path: string;             // pathname (for surfacing matches)
  createdAt: number;
  updatedAt: number;
  fields: FieldSnapshot[];

  // grouping — a preset is EITHER a step of a Form, OR standalone:
  formId: string | null;    // set => this preset is a step of that Form
  stepOrder: number | null; // 1-based order within the Form; null if standalone
  projectId: string | null; // used only when standalone; steps inherit Form.projectId
}

interface Form {            // "parent form" — a multi-step form
  id: string;
  label: string;            // e.g. "Truck Crate Booking"
  projectId: string | null;
  entryUrl?: string;        // optional base / first-step URL
  createdAt: number;
  updatedAt: number;
  // steps = Presets where formId === this.id, ordered by stepOrder
}

interface Settings {
  autoPromptOnSubmit: boolean;     // default true — show the save modal on submit
  preventSubmitOnCapture: boolean; // default false
  capturePasswords: boolean;       // default false
  fillEventBlur: boolean;          // dispatch blur after fill (default true)
  perFieldTimeoutMs: number;       // default 3000
}
```

Storage keys: `projects` (Project[]), `forms` (Form[]), `presets` (Preset[]),
`settings` (Settings). Validate everything read from storage with zod and migrate on a
`schemaVersion` key.

**Invariants:** a step preset has non-null `formId` + `stepOrder` and ignores its own
`projectId` (project is derived from its `Form`). A standalone preset has `formId = null`,
`stepOrder = null`, and its own `projectId`. `stepOrder` is contiguous (1..N) within a
form; deleting/reordering steps renumbers.

---

## 6. Field detection (read)

Resolve the **target root**: the `<form>` containing the clicked submit button; else the
nearest configured container; else `document.body`. Then collect, **piercing open shadow
roots recursively**:

- `input` — exclude `type=submit|button|reset|image`. **`type=file` cannot be set
  programmatically** (browser security) → skip and note in report. `type=password` only
  if `settings.capturePasswords` (warn: stored in plaintext, never sync).
- `textarea`, `select` (single + multiple).
- `[contenteditable="true"]`.
- Custom widgets via ARIA: `[role=combobox]`, `[role=listbox]`, `[role=switch]`,
  `[role=checkbox]`, `[role=radio]`, `[role=spinbutton]`, `[role=slider]`.

For each element build a `FieldSelector` with **all** available identifiers (so replay can
fall back):

1. `name` (scoped to form) → 2. `id` → 3. `data-testid` / `data-test` / `data-cy` →
4. `aria-label` or associated `<label for>` text → 5. generated relative CSS path.

Reading values:
- text/number/textarea/select-single: `el.value`.
- select-multiple: array of selected option values.
- checkbox/switch: `el.checked` / `aria-checked`.
- radio group: the checked radio's value.
- contenteditable: store both `textContent` and `innerHTML`.
- custom widget: store `visibleLabel` (selected option's text) AND `underlyingValue`
  (value of any hidden `<input>`/`<select>` the library renders for form submission).

---

## 7. The critical part — framework-aware fill (write)

Setting `el.value = x` does **not** update React/Vue controlled state and the value
reverts on the next render. The fill engine must use native setters + dispatched events.

### 7.1 Standard text / number / textarea / select
```ts
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const protoSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  const ownSetter   = Object.getOwnPropertyDescriptor(el, 'value')?.set;
  // Bypass React's value tracker by using the prototype setter
  if (ownSetter && ownSetter !== protoSetter && protoSetter) protoSetter.call(el, value);
  else if (protoSetter) protoSetter.call(el, value);
  else (el as any).value = value;
}

function fillInput(el: HTMLElement, value: string, blur = true) {
  setNativeValue(el as HTMLInputElement, value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));  // React listens here
  el.dispatchEvent(new Event('change', { bubbles: true }));  // Vue v-model / native change
  if (blur) el.dispatchEvent(new Event('blur', { bubbles: true })); // many validators fire on blur
}
```
> The native-setter trick works from the content-script isolated world because the DOM
> (and its prototypes) are shared with the page. Dispatched bubbling events reach React's
> root delegated listener and Vue's handlers. Only use `chrome.scripting` with
> `world: "MAIN"` if a specific case genuinely needs page-world JS (rare).

### 7.2 checkbox / radio / switch
Compare desired vs current; if different, prefer `el.click()` (most reliable for
controlled components), else set `.checked` via the prototype setter + dispatch
`click`/`change`. For ARIA switches/checkboxes that are `<button role=switch>`, compare
`aria-checked` and `.click()` if it needs to toggle.

### 7.3 `<select>`
`setNativeValue(select, value)` then dispatch `change`. For multi-select, set
`option.selected` on each matching option, then dispatch `change`.

### 7.4 Custom widgets (Ark UI / Radix UI / shadcn) — two strategies
1. **Hidden-control-first (preferred):** these libs usually render a hidden native
   `<select>` or `<input>` that carries the form value. If found via the stored selector,
   fill it like §7.1/§7.3. Fastest and most robust.
2. **Interaction replay (fallback):** click the trigger to open the listbox → wait for
   options to mount (MutationObserver or poll up to `perFieldTimeoutMs`) → find the option
   whose text equals `visibleLabel` → click it. Requires async + per-step timeouts and
   graceful failure.

Capture stores both `underlyingValue` and `visibleLabel` so the engine can attempt (1)
then (2).

### 7.5 Date / time
- Native `input[type=date|datetime-local|time|month|week]`: §7.1 with the correct format
  (`date` → `YYYY-MM-DD`, `time` → `HH:mm`, etc.).
- Custom pickers (react-datepicker, etc.): they are usually a text input → type the
  formatted string via §7.1; if value only commits via calendar clicks, fall back to
  interaction replay.

### 7.6 Rich text / contenteditable
- Plain contenteditable: `el.focus()`, set content, dispatch `input` (bubbles).
- Managed editors (ProseMirror/TipTap, Slate, Lexical, Quill) overwrite raw innerHTML
  from their internal model, so prefer:
  `el.focus(); document.execCommand('selectAll'); document.execCommand('insertText', false, plainText);`
  This is **best-effort** — store plain text as the reliable fallback and surface
  "rich text inserted as plain text" in the report. Editor-specific adapters can be added
  later.

---

## 8. Submit interception

- Content script attaches **capture-phase** listeners on `document`:
  - `click` → if `event.target.closest('button[type=submit], input[type=submit]')` or a
    type-less `<button>` inside a `<form>`.
  - `submit` on `form` (covers Enter-key submission).
- On trigger, **synchronously** snapshot fields (§6) into a pending object, then show the
  in-page save modal.
- Default: do **not** `preventDefault()` — let the app submit/validate normally. If
  `settings.preventSubmitOnCapture` is true, call `preventDefault()` +
  `stopImmediatePropagation()` and offer a "Continue submit" button after saving.
- Debounce so a single user action yields a single prompt.

---

## 9. Replay (fill) engine

For each `FieldSnapshot`:
1. Resolve the element by trying `selector` identifiers in order (§6), piercing open
   shadow roots.
2. If not present yet, wait up to `perFieldTimeoutMs` (MutationObserver, fallback to poll).
3. Dispatch by `type` to the correct writer (§7).
4. Record `{ field, status: 'filled' | 'not-found' | 'skipped' | 'error', detail }`.

Return the aggregated **fill report** to the side panel. Fill sequentially (not parallel)
to avoid races with re-renders; allow small inter-field delays for widgets that animate.

---

## 10. Edge cases & constraints (call these out to the agent)

- **File inputs** cannot be set programmatically → always skipped, listed in report.
- **Passwords**: off by default; if enabled, plaintext in `storage.local`, never synced.
- **Open shadow DOM**: traverse `element.shadowRoot` recursively for both capture and
  fill. **Closed shadow roots are inaccessible** — note in report.
- **iframes**: inject into all frames (`all_frames: true`); **cross-origin iframes are
  inaccessible** — note.
- **Lazy / conditional fields**: handled by the per-field wait in §9. (This is also why
  multi-step forms are one-preset-per-step.)
- **Duplicate names** across a form: the generated `cssPath` disambiguates.
- **Storage limits**: request `unlimitedStorage`; warn on very large rich-text snapshots.

---

## 11. UI spec (side panel)

**Top bar** — a primary **"📸 Capture this page"** button (manual capture, §3.1-B),
the search box, and the project/form filter. Below it, the presets tree. Capturing opens
the shared save form inline in the panel.

**Presets tree** — a collapsible hierarchy grouped `Project ▸ Form ▸ Steps`, plus
standalone presets directly under their project:

```
▾ Truck Crate App            (project)
  ▾ Booking Flow  ⟨form · 3 steps⟩          [Apply all? ✗ see note]
      1. Shipper details      8 fields · /book/shipper   [Apply ▸]
      2. Consignee details    6 fields · /book/consignee [Apply ▸]
      3. Cargo & pricing     11 fields · /book/cargo     [Apply ▸]
  • Quick login preset        2 fields · /login          [Apply ▸]   (standalone)
▾ No project
  • …
```

- A **Form row** shows its label + step count and expands to its **ordered** steps. Each
  step row has its own label, field count, path, and an **Apply** action. There is **no
  "apply all steps"** action — steps live on different routes, so they are applied one at a
  time on the matching route (consistent with the original constraint).
- **Standalone presets** render as leaf rows under their project (no expand).
- **Search box**: filters **as you type** across project / form / step / preset labels
  (and optionally path). Matching a child keeps its parent rows visible; non-matching
  branches collapse out.
- **Project filter**: dropdown (`All projects` · each project · `No project`).
- **Match hint**: any step or standalone preset whose `origin + path` matches the active
  tab gets a "matches this page" badge and floats to the top of its group, with its
  ancestors auto-expanded.
- **Row actions**: `Apply` · `Edit` (label / project / move between form↔standalone /
  change step #) · `Duplicate` · `Delete` · `Re-capture`. Form rows also offer `Rename`,
  `Add step from current page`, and drag-to-reorder of their steps.
- **Apply**: sends the preset/step to the active tab's content script; shows the fill
  report inline (filled / not-found / skipped with the field list).

**Projects & Forms management** — add / rename / delete for both. Delete prompts:
- Project → `Delete contents` / `Move contents to No project` / `Cancel`.
- Form → `Delete steps` / `Detach steps as standalone presets` / `Cancel`.

**In-page save modal** (content script) — title, field count, `Label` input, `Project`
select with inline "Create new project…", `Save` / `Dismiss`. Keyboard accessible,
high z-index, shadow-DOM-isolated styling so the host page CSS can't bleed in.

---

## 12. Permissions / manifest (MV3)

```jsonc
{
  "manifest_version": 3,
  "name": "Form Prefill & Replay",
  "permissions": ["storage", "scripting", "activeTab", "sidePanel", "unlimitedStorage"],
  "host_permissions": ["<all_urls>"],            // dev tool on own apps; tighten if desired
  "background": { "service_worker": "background.js" },
  "side_panel": { "default_path": "sidepanel.html" },
  "action": { "default_title": "Form Prefill" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "all_frames": true,
    "run_at": "document_idle",
    "js": ["content.js"]
  }]
}
```

---

## 13. Suggested project structure

```
src/
  shared/        storage.ts (zod schemas, CRUD, migrations), types.ts, messaging.ts
  content/       detect-submit.ts, snapshot.ts, target-picker.ts, fill-engine.ts,
                 writers/*, save-modal/*
  sidepanel/     App.tsx, CaptureButton.tsx, SaveForm.tsx, PresetsTree.tsx,
                 ProjectFilter.tsx, ProjectsManager.tsx, FormsManager.tsx, FillReport.tsx
  background/    index.ts (router, open side panel on action click)
```
> `SaveForm` (label · standalone-vs-step · form/step/project pickers) is a **shared
> component** rendered both inside the content script's in-page modal and the side panel.

**Messaging protocol** (typed, via `chrome.tabs.sendMessage` / `chrome.runtime`):
`LIST_PROJECTS`, `LIST_FORMS`, `LIST_PRESETS`, `CAPTURE_NOW {pickMode?}` →
`SNAPSHOT_RESULT {fields, candidateForms?}`, `APPLY_PRESET {id}` → `FILL_REPORT {results}`,
`GET_ACTIVE_PAGE_INFO {url, origin, path}`, `CREATE_PROJECT {name}`,
`CREATE_FORM {label, projectId}`,
`SAVE_PRESET {label, snapshot, formId?, stepOrder?, projectId?}`,
`REORDER_STEPS {formId, orderedStepIds}`, plus `DELETE/UPDATE` variants for
projects / forms / presets.

---

## 14. Acceptance criteria (Definition of Done)

1. Capture works **two ways**: (a) clicking a `type=submit` button (or Enter-submit)
   auto-prompts to save — disablable via `autoPromptOnSubmit`; (b) **"Capture this page"**
   in the side panel snapshots the current form on demand (with a form picker when the page
   has more than one). Both open the same save form (standalone vs step-of-form, label,
   project/form/step) and persist to `chrome.storage.local`.
2. Reopening the form and clicking **Apply** correctly pre-fills standard inputs on **both
   a React and a Vue** form such that the app's own state/validation reflects the values
   (verified by submitting successfully without manual edits).
3. Ark/Radix dropdowns and comboboxes are restored via hidden control or interaction
   replay; date pickers and a contenteditable field are restored (rich text at least as
   plain text).
4. The presets **tree** shows `Project ▸ Form ▸ Steps` plus standalone presets, searches
   as-you-type, filters by project, and surfaces presets/steps matching the current page;
   project and form create/rename/delete and step reordering work.
5. Fill report lists any not-found/skipped fields instead of failing silently.
6. File inputs and (by default) passwords are skipped and reported.
7. Multi-step form: one **Form** owns ordered step presets; each step is captured and
   applied independently on its own route, filling only that step's fields. The form's
   steps are visible and reorderable under the parent in the tree.

---

## 15. Nice-to-haves (future, not required for v1)

- Export/import presets & projects as JSON.
- "Diff against current page" before applying.
- Keyboard shortcut to apply the top matching preset.
- Per-field re-capture/edit in the side panel.
- Editor-specific rich-text adapters (TipTap/Slate/Lexical) for full fidelity.

---

## 16. Open decisions to confirm before/while building

- **Hierarchy depth**: spec'd as 3 levels — `Project ▸ Form ▸ Step`. If a Project is more
  bureaucracy than you want, the model collapses cleanly to 2 levels (`Form ▸ Step`, with
  forms ungrouped): just drop `Project`/`projectId` and the project filter. Conversely both
  forms and standalone presets can live without a project ("No project" bucket), so you can
  start flat and adopt projects later.
- **Submit blocking default**: spec'd as *don't block* (`preventSubmitOnCapture=false`).
  Flip if you usually don't want the real submit firing during capture.
- **Host scope**: `<all_urls>` for convenience; restrict to your app domains if preferred.
- **Search scope**: label-only vs label + project + path. Spec'd as label + project + path.
- **Build tool**: WXT recommended; CRXJS/Vite is a fine alternative.

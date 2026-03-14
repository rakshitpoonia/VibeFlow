## AI Code Completion – Implementation Overview

### 1. What this feature does

The playground editor includes an **AI-powered inline code completion system** that behaves similarly to modern IDEs like VS Code or IntelliJ.  
As you type in the Monaco editor, the system can:

- Observe what you are currently writing.
- Collect code context around the cursor.
- Ask a local LLM (via a backend API) for a completion.
- Show the model’s response as **inline ghost text** inside the editor.
- Let you **accept** the suggestion with `Tab`, **reject** it with `Esc`, or **manually trigger** new suggestions with `Ctrl + Space`.

Conceptually, you can think of the end‑to‑end flow like this:

1. The user types code in the Monaco editor.
2. The editor decides it’s a good moment to ask for help (based on cursor movement or certain typed characters), or the user presses `Ctrl + Space` to request help.
3. The editor collects the current document content and the cursor position.
4. This information is passed into the **AI suggestion hook**, which builds a payload.
5. The hook sends a **POST request** to the `/api/code-completion` backend route.
6. The backend route analyzes surrounding code, builds a prompt, and calls the local LLM.
7. The LLM returns a code completion string.
8. The backend passes that completion back to the frontend.
9. The hook stores the suggestion and its position in state.
10. The editor integration layer feeds that suggestion into Monaco’s **inline completion provider**, which displays it as ghost text at the cursor.
11. The user either:
    - presses **Tab** to accept it (the text is inserted into the document), or  
    - presses **Esc** / moves / types to effectively reject or clear it, or  
    - presses **Ctrl + Space** again to manually trigger a fresh suggestion.

The sections below explain how each main part of this pipeline is wired together:

- `playground-editor.tsx` – the **editor integration layer**.
- `useAISuggestion.tsx` – the **AI interaction hook** that talks to the backend.
- `app/api/code-completion/route.ts` – the **backend API route** that talks to the local LLM.

The focus here is on **intent and flow**, not low‑level implementation details.

---

## 2. `playground-editor.tsx` – Editor Integration Layer

### 2.1 Role of this file

`PlaygroundEditor` is the component where:

- The **Monaco editor instance** is created and configured.
- The **AI suggestion life cycle** is wired into the editor.
- User actions like typing, moving the cursor, pressing `Tab`, `Esc`, or `Ctrl + Space` are interpreted in the context of AI suggestions.
- Monaco’s **inline suggestion / ghost text mechanism** is connected to the suggestion state coming from the hook.

In short, this file is the **bridge between the visual editor and the AI suggestion logic**.

### 2.2 Editor setup (Monaco as the core editor)

The component:

- Uses `@monaco-editor/react` to mount a Monaco editor inside a React component.
- Tracks the editor instance and the Monaco API via `useRef`, so they can be reused without re‑mounting the editor.
- Applies editor options such as language mode, inline suggestion behavior, and other usability options.

The **intent** of this setup is:

- To expose a standard code editing experience (syntax highlighting, cursor, typing, etc.).
- To prepare the editor so that **AI suggestions can be layered on top** without fighting Monaco’s own completions.

### 2.3 Inline suggestion system: `createInlineCompletionProvider`

One of the key pieces in this file is a function that conceptually:

- **Registers an inline completion provider** with Monaco.
- Tells Monaco **how to fetch and display inline suggestions** when they are available.

At a high level, `createInlineCompletionProvider`:

- Knows about the **current AI suggestion text** and the **position** at which it should appear.
- Implements a **`provideInlineCompletions`** handler that Monaco calls when it wants to know if there is an inline suggestion to show.
- When Monaco calls this handler, the provider:
  - Checks whether there is a valid suggestion from the AI hook.
  - Checks whether the editor’s current cursor position is close to the stored suggestion position (to avoid showing suggestions in the wrong place).
  - If everything matches, it hands Monaco a **single inline completion item**:
    - The item contains the text to insert.
    - The exact range at which it should be inserted.
    - Additional metadata that tells Monaco this is an AI snippet.
- Returns no items when there is no suitable suggestion or when the cursor has moved away.

The **intent** of this provider is:

- To let Monaco handle the actual **rendering of ghost text**, while the AI system only decides:
  - *What* text should appear.
  - *Where* it should appear.
  - *When* it is valid to show it.

### 2.4 Triggering AI suggestions

The editor triggers AI suggestions in two main ways:

1. **Manual trigger (Ctrl + Space)**  
   A keyboard shortcut is bound so that when the user presses `Ctrl + Space`:
   - The editor calls a callback like `onTriggerSuggestion("completion", editor)`.
   - This callback is wired to the AI hook, which then starts the process of fetching a suggestion.

2. **Automatic triggers (typing / cursor movement)**  
   The editor also listens for:
   - Cursor position changes.
   - Certain content changes, like typing a newline, an opening brace, a dot, or other characters that often indicate the user is in the middle of a construct where suggestions are useful.

   When these conditions are met, and there is no active accepted suggestion:
   - A small delay timer is used (to avoid firing on every keystroke).
   - After the delay, the editor again calls the hook’s trigger function with the current editor instance.

In both cases, the **essential flow is the same**:

- The editor determines the **current cursor position**.
- It reads the current document content from Monaco’s model.
- It passes this information into the AI hook so that a request can be sent to the backend.

### 2.5 Context collection around the cursor

From the editor’s perspective, the context collection step is about:

- Capturing the **entire file content** from the model.
- Capturing the **exact cursor line and column**.

These are passed into the AI hook, which then forwards them to the backend API.  
On the backend side, this data is used to:

- Slice out lines **before** and **after** the cursor.
- Extract the **current line** where the cursor lives.
- Build a prompt that tells the model:
  - What language and framework are likely being used.
  - Where exactly in the code the cursor is.
  - What incomplete patterns or structures the user might be working on.

The **goal** is to give the model a **local window of relevant code** so it can produce a suggestion that:

- Fits the surrounding logic.
- Respects the style and structure of the existing code.

### 2.6 Why `useRef` is heavily used here

The editor integration uses `useRef` to hold several pieces of long‑lived state:

- The **Monaco editor instance** – so it does not need to be recreated on each render.
- The **Monaco API object** (`Monaco`) – to configure language, ranges, and completion kinds.
- The **current suggestion** (text, position, and an internal ID) – so the editor commands can always refer to the active suggestion without waiting for React re‑renders.
- Flags like:
  - Whether a suggestion is currently being accepted.
  - Whether a suggestion was just accepted (used to prevent double insertion).
  - Timeouts for delayed triggers.

The **intent** behind this pattern:

- Maintain a **stable connection to the editor instance**.
- Avoid race conditions between asynchronous events (typing, network responses, suggestion acceptance).
- Keep the React component performant and predictable while still coordinating complex editor behavior.

### 2.7 Suggestion IDs and tracking

Each suggestion is given a **unique ID** when it is prepared to be shown.  
Conceptually, this allows the system to:

- Know **which suggestion is currently active** in the editor.
- Avoid mixing up an **old suggestion** with a **new one** if multiple requests overlap.
- Implement additional logging or analytics around which suggestion was accepted or rejected.

Even if the ID is mostly used for internal tracking and debug logging, it reflects the intent:

- Treat each suggestion as a **distinct entity** that the system can reason about.

### 2.8 Rendering AI suggestions (ghost text)

Once the hook provides a suggestion and the inline completion provider is registered:

- Monaco calls the provider and receives a completion item.
- Monaco is then responsible for drawing the suggestion as **ghost text** at the correct location.

From the user’s perspective:

- The suggestion appears **inline, faintly** in the editor, exactly where code would be inserted.
- It does not immediately modify the actual file content.
- It is purely a **visual preview** until the user decides to accept it.

This separation between:

- **Preview** (ghost text), and
- **Actual edits** (inserting code on accept)

is a key design choice that mirrors how professional IDEs handle inline AI suggestions.

### 2.9 Accepting suggestions (Tab key)

When the user presses **Tab**:

- A high‑priority keyboard command intercepts the key press.
- The editor checks:
  - Whether there is an active suggestion at the current cursor position.
  - Whether it is safe to accept it (not already in the middle of accepting).
- If everything is valid:
  - The suggestion text is **inserted into the document** at the intended range.
  - The cursor is moved to the end of the inserted text.
  - The suggestion state is cleared so that the ghost text disappears.
  - A callback like `onAcceptSuggestion` is invoked, which informs the rest of the system that the suggestion was accepted.

The **intent** is to make accepting a suggestion feel:

- **Instant** (no noticeable delay).
- **Atomic** (no partial inserts or double‑inserts).
- **Natural** (using the same key that many IDEs use).

### 2.10 Rejecting or clearing suggestions (Esc, moving, typing)

Suggestions can be effectively rejected in several ways:

- Pressing **Esc**:
  - Calls a reject handler.
  - Clears the current suggestion so the ghost text disappears.
- Moving the cursor away:
  - The editor detects that the cursor has left the suggestion region.
  - It clears the current suggestion.
- Typing over the suggestion:
  - If the user continues typing something else instead of accepting, the system interprets this as a rejection and clears the active suggestion.

The intent is that:

- Suggestions should never “stick” and get in the way.
- The user always feels in control; they can ignore or dismiss AI output simply by normal editing actions.

---

## 3. `useAISuggestion.tsx` – AI Interaction Hook

### 3.1 Role of this hook

`useAISuggestions` is a **custom React hook** that centralizes all logic related to:

- Storing and updating AI suggestion state.
- Talking to the backend completion API.
- Exposing high‑level actions that the editor can call.

You can think of it as the **brain of the AI suggestion system on the frontend**.  
The editor component focuses on rendering and keyboard behavior, while this hook focuses on **when and how to talk to the AI**.

The hook exposes state such as:

- The current suggestion text (if any).
- Whether a request is currently loading.
- The position where the suggestion should appear.
- Whether the AI assistant is enabled at all.

And it exposes key functions like:

- `fetchSuggestion`
- `acceptSuggestion`
- `rejectSuggestion`
- `clearSuggestion`

### 3.2 `fetchSuggestion()` – talking to the backend

Conceptually, `fetchSuggestion(type, editor)` performs the following steps:

1. **Check whether AI suggestions are enabled** in the current state.
2. **Validate the editor instance and cursor**:
   - If the editor is not ready or the cursor position is unknown, it aborts early.
3. **Gather context from the editor**:
   - Read the full file content from the editor’s model.
   - Read the current cursor line and column.
4. **Build a request payload**:
   - `fileContent`: the entire text of the file.
   - `cursorLine` and `cursorColumn`: zero‑based positions of the cursor.
   - `suggestionType`: a label describing why this suggestion is being requested (for example, completion after a newline).
5. **Send a POST request** to `/api/code-completion` using `fetch`.
6. **Wait for the response** and parse the returned JSON.
7. **If a suggestion string is present**:
   - Trim it.
   - Store it in hook state along with the cursor position where it should appear.
8. **If no suggestion is returned or an error occurs**:
   - Log a warning or error.
   - Clear the loading flag so the UI can recover.

The **intent** of `fetchSuggestion`:

- Provide a single, reusable path for “ask the AI model for help given the current editor context”.
- Hide all networking and error‑handling details from the editor component.

### 3.3 `acceptSuggestion()` – confirming the suggestion

From the hook’s perspective, `acceptSuggestion(editor, monaco)`:

- Confirms that there **is** an active suggestion and a known position.
- Optionally cleans or normalizes the suggestion text (for example, removing artifacts like line prefixes).
- Ensures that any related decorations (visual markers, if used) are removed from the editor.
- Clears the suggestion from state so that:
  - The inline provider will no longer offer it.
  - The UI updates to reflect that there is no pending suggestion.

Note that the **actual text insertion** is coordinated in the editor integration layer (where Monaco’s editing APIs are available), but the hook owns the **logical notion of “this suggestion has been accepted and is no longer pending”**.

### 3.4 `rejectSuggestion()` – discarding without changes

`rejectSuggestion(editor)` is responsible for:

- Removing any visual decorations associated with the suggestion.
- Clearing the suggestion text and position from state.
- Leaving the editor content completely untouched.

This function embodies the intent that:

- Rejecting a suggestion should be a **safe, no‑side‑effects operation** on the document.

### 3.5 `clearSuggestion()` – generic reset

`clearSuggestion(editor)` is a more generic reset function that:

- Cleans the same decorations.
- Resets the suggestion state (text and position) back to `null`.

It is useful in situations where:

- The suggestion becomes invalid because the user moved or edited the code significantly.
- The system wants to force a full reset before starting a new round of suggestion fetching.

Together, these functions make the hook a **self‑contained service** for the editor:

- The editor does not need to know how the API works.
- It just tells the hook, “I need a suggestion now” or “The suggestion was accepted / rejected,” and the hook takes care of the rest.

---

## 4. API Route: `app/api/code-completion/route.ts`

### 4.1 Role of this route

The API route at `app/api/code-completion/route.ts` is the **backend endpoint** that:

- Receives POST requests from the frontend with editor context.
- Analyzes and structures this context.
- Builds a prompt tailored for code completion.
- Sends the prompt to a **local LLM** (via Ollama’s HTTP API).
- Returns the generated completion back to the frontend in a clean form.

This layer **isolates model communication** from frontend logic so that:

- The frontend never needs to know about model URLs, prompt templates, or temperature settings.
- The model can be swapped or configured without touching editor code.

### 4.2 Request handling flow

When the frontend calls `/api/code-completion`:

1. The request body is parsed into a structured object containing:
   - `fileContent`
   - `cursorLine`
   - `cursorColumn`
   - `suggestionType`
   - (Optionally) `fileName`
2. The route validates that the required fields are present and well‑formed.
3. It calls an internal **context analysis function** that:
   - Splits the file into lines.
   - Extracts:
     - A set of lines **before** the cursor (within a certain radius).
     - The **current line**.
     - A set of lines **after** the cursor.
   - Detects likely **language and framework** from content and file extension.
   - Performs lightweight structural analysis:
     - Whether the cursor is inside a function or class.
     - Whether the cursor is after a comment.
     - Whether there are incomplete patterns like open braces or unfinished conditions.
4. Using this analysis, the route builds a **prompt string** that:
   - Describes the language and framework.
   - Embeds the extracted context with a marker showing the exact cursor position.
   - Provides clear instructions to the model:
     - Only output code.
     - Do not include explanations or markdown.
     - Keep the suggestion short and well‑formatted.
5. It then calls a **local LLM endpoint** (for example, an Ollama `generate` API) with:
   - The prompt.
   - Model name (e.g., `codellama:latest`).
   - Generation settings like temperature and maximum tokens.
6. When the model responds:
   - The route cleans the response:
     - Strips out code fences if the model accidentally adds them.
     - Trims trailing explanatory text or comments that don’t belong to the completion.
     - Caps the suggestion to a small number of lines to keep it focused.
7. Finally, it returns a JSON response containing:
   - The cleaned `suggestion` string.
   - Some metadata and context that can be useful for debugging or tooling.

The **intent** of this route is to provide a **robust, opinionated gateway** between the raw LLM and the editor:

- It shields the editor from noisy or malformed model outputs.
- It encodes good defaults for how long and how focused a suggestion should be.

---

## 5. End‑to‑End Flow Summary

To tie everything together, here is the overall system in simple steps:

1. **User types in the Monaco editor.**
2. The editor listens to:
   - Cursor movements.
   - Typed characters.
   - Manual triggers like `Ctrl + Space`.
3. When a suggestion should be requested:
   - The editor gathers:
     - The full file content.
     - The current cursor line and column.
   - It calls `fetchSuggestion()` from `useAISuggestions`, passing along the editor context.
4. `fetchSuggestion()`:
   - Builds a payload with the content, cursor position, and suggestion type.
   - Sends a **POST** request to `/api/code-completion`.
5. The **API route**:
   - Validates the payload.
   - Analyzes code context around the cursor.
   - Builds a specialized prompt for the LLM.
   - Calls the **local AI model**.
   - Cleans the model’s response into a concise code snippet.
   - Returns that snippet as `suggestion`.
6. The hook receives the response:
   - Stores the suggestion text and the cursor position in its state.
7. The **editor integration**:
   - Registers or updates the inline completion provider with this new suggestion.
   - Monaco shows the suggestion as **inline ghost text** at the right place.
8. The user now has several choices:
   - Press **Tab**:
     - The editor accepts the suggestion.
     - The suggestion text is inserted into the file at the cursor.
     - The suggestion state is cleared.
   - Press **Esc**:
     - The suggestion is rejected.
     - Ghost text disappears, editor content remains unchanged.
   - Keep typing or move the cursor:
     - The system detects that the suggestion is no longer valid.
     - It clears the suggestion and may later request a new one when appropriate.
   - Press **Ctrl + Space**:
     - Manually triggers a fresh suggestion request at the current cursor position.

Through this pipeline, the playground delivers an **IDE‑like AI code completion experience** on top of Monaco, powered by a local LLM and clearly separated responsibilities across:

- The **editor integration** (`playground-editor.tsx`).
- The **AI suggestion hook** (`useAISuggestion.tsx`).
- The **backend completion API** (`app/api/code-completion/route.ts`).

Each layer focuses on its own concern—UI, state and API orchestration, and model communication—making the system both understandable and extensible for anyone reading the project for the first time.


# React Event Log Viewer

A browser tool for tracing what happened to a record in a [Contember](https://docs.contember.com/reference/engine/content/event-log/) project, and fixing it.

## Browser extension

**Contember Request Inspector** is a Chrome and Edge extension for working with Contember Admin. It records every Content, System and Tenant API request the admin makes, explains why a request failed, and shows what each mutation changed in the event log.

### Download

- **Latest build from `main`:** [contember-request-inspector.zip](https://nightly.link/VojtaStanek/contember-event-log-viewer/workflows/extension/main/contember-request-inspector.zip) (the newest artifact of the [Browser extension workflow](https://github.com/VojtaStanek/contember-event-log-viewer/actions/workflows/extension.yml?query=branch%3Amain), no GitHub login needed)
- **A specific build** (for example from a pull request): open a run of the [Browser extension workflow](https://github.com/VojtaStanek/contember-event-log-viewer/actions/workflows/extension.yml) and download the `contember-request-inspector` artifact. You need to be signed in to GitHub for this.

### Install

1. Unzip the download into a folder you'll keep. The browser loads the extension from that folder.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the unzipped folder, the one containing `manifest.json`.
5. Reload any Contember Admin tabs that were already open.

To update, replace the folder's contents with a newer build and click the reload icon on the extension's card. Chrome 111 or Edge 111 or newer is required.

### Use

- **DevTools panel:** open DevTools on the admin tab and switch to the **Contember** panel. It lists that tab's requests live, newest first, and follows the DevTools theme.
- **Request history:** click the toolbar icon, then **Open request history**. It opens a full page for the current tab, and you can switch to all tabs.
- **Toolbar badge:** a red number counts failed requests on the tab since you last looked at the panel or history.

The list marks queries **Q** and mutations **M**. Failed requests are tinted, with the reason (`Validation`, `Not applied`, `GraphQL error`, `HTTP 401`, …). Cancelled requests are greyed out, and a divider separates page loads. You can filter by text (field, entity, ID, variables, error message), operation, API, entity, or failed only. Press `/` to search and use `↑` `↓` to move through requests.

Each request has these tabs:

- **Overview:** problems first, with the field path and message for Contember's validation and mutation errors (which arrive with HTTP 200 and `ok: false`). Then the records it loaded or wrote, its fields with their arguments, and timing and size.
- **Query**, **Variables**, **Response:** the formatted query, plus collapsible JSON with copy value and copy path.
- **Changes:** for a successful mutation, the event-log transaction it created, matched by time, with before and after values. From there you can open the record's full history, the transaction or the identity. This uses the same views as the web app below.
- **Headers:** method, URL, status and request headers.
- **Copy** menu: query, variables, response, a `fetch()` call to run in the admin's console, or a cURL command.

### How it works

- A content script wraps `fetch` and `XMLHttpRequest` in the page. It copies only POST requests to Contember endpoints, `…/content/{project}/{stage}`, `…/system/{project}` and `…/tenant`, behind any prefix such as the admin's `/_api` proxy. You can add other URL patterns in the settings (gear icon). The page always receives its original response.
- History is stored in the extension's IndexedDB in your browser. The last 2,000 requests are kept by default (changeable in settings), across reloads and browser restarts. Clear it with the ⊘ button, and pause recording with the ● button.
- **The Changes tab and record history** call the System API from the admin tab itself, so the admin's HttpOnly session cookie authenticates them. The extension never reads or stores the cookie or a token. The logged-in user needs history access in the project. Without it, the rest of the inspector still works. If the admin tab is closed, you'll be asked to open it.
- Nothing is sent anywhere else. The extension asks for access to all sites because Contember Admin can run on any domain.

### Develop

```
npm install
npm run watch:extension   # rebuilds build-extension/ on change; load that folder unpacked
npm run test:extension    # unit tests for request analysis and filtering
npm run lint:extension
npm run build:extension   # production build into build-extension/
```

The extension lives in `extension/` and reuses the web app's components from `src/` (event stream, record view, schema handling, styles).

## Web app

### Features

- **Record history**: every create, update and delete of a row, grouped by transaction, with before/after values.
- **Relations are links**: click a related ID to open that record. Join-table rows link to both sides.
- **Related records**: list the records connected to this one right now (e.g. articles in a category), including inverse and many-to-many relations.
- **Transactions**: open every change committed in the same transaction. You can also open all changes by one identity, or the latest changes in a table.
- **Editing**: change a field's current value through the Content API, or restore a value from history. A before/after preview shows before you save.
- **Loads only what you open**: the schema loads once per session, history loads 50 events at a time, and current values and relations load only when you expand them.
- Saved connection profiles, navigation trail, browser back/forward and shareable links (`#/row/{table}/{id}`, `#/tx/{id}`). The token never goes into the URL.

The token needs history access to read events. Relations and editing also need read access to the schema and to the Content API. Without them the history still works, using raw table and column names.

### Usage

1. Clone the repository:
   ```
   git clone https://github.com/VojtaStanek/contember-event-log-viewer.git
   ```
2. Navigate to the project directory:
   ```
   cd contember-event-log-viewer
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Start the development server:
   ```
   npm start
   ```
5. Open your browser and navigate to `http://localhost:3000`.

### Connection

- **API endpoint**: Base URL of the Contember engine, e.g. `https://api.example.com`.
- **Project**: Project slug.
- **Stage**: Defaults to `live`.
- **Token**: Bearer token. Profiles, including the token, are stored in this browser's local storage.

# React Event Log Viewer

A browser tool for tracing what happened to a record in a [Contember](https://docs.contember.com/reference/engine/content/event-log/) project, and fixing it.

## Features

- **Record history**: every create, update and delete of a row, grouped by transaction, with before/after values.
- **Relations are links**: click a related ID to open that record. Join-table rows link to both sides.
- **Related records**: list the records connected to this one right now (e.g. articles in a category), including inverse and many-to-many relations.
- **Transactions**: open every change committed in the same transaction. You can also open all changes by one identity, or the latest changes in a table.
- **Editing**: change a field's current value through the Content API, or restore a value from history. A before/after preview shows before you save.
- **Loads only what you open**: the schema loads once per session, history loads 50 events at a time, and current values and relations load only when you expand them.
- Saved connection profiles, navigation trail, browser back/forward and shareable links (`#/row/{table}/{id}`, `#/tx/{id}`). The token never goes into the URL.

The token needs history access to read events. Relations and editing also need read access to the schema and to the Content API. Without them the history still works, using raw table and column names.

## Usage

1. Clone the repository:
   ```
   git clone https://github.com/githubnext/workspace-blank.git
   ```
2. Navigate to the project directory:
   ```
   cd workspace-blank
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

## Connection

- **API endpoint**: Base URL of the Contember engine, e.g. `https://api.example.com`.
- **Project**: Project slug.
- **Stage**: Defaults to `live`.
- **Token**: Bearer token. Profiles, including the token, are stored in this browser's local storage.

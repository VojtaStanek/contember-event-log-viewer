# React Event Log Viewer

This project is a React web application that allows you to enter the following inputs:
- API endpoint
- Project name
- Bearer auth token
- Table name
- Primary key

The application will then fetch and display the event log as documented in the [Contember documentation](https://docs.contember.com/reference/engine/content/event-log/).

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

## Required Inputs

- **API endpoint**: The URL of the API endpoint to fetch the event log data.
- **Project name**: The name of the project.
- **Bearer auth token**: The authentication token for accessing the API.
- **Table name**: The name of the table containing the event log data.
- **Primary key**: The primary key of the table.

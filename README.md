# Health Tracker Backend

A robust Node.js backend for a comprehensive health and fitness tracking application. This project provides APIs for managing body measurements, progress photos, sleep data, and workout plans/sessions.

## 🚀 Features

- **Authentication:** Google OAuth2 integration for secure user login.
- **Measurements:** Track bodyweight, body fat, and various body part measurements (chest, waist, biceps, etc.).
- **Progress Photos:** Upload and manage front, side, and back view photos. Supports local storage and Google Drive integration.
- **Sleep Tracking:** Log bedtime, wake time, resting heart rate (RHR), and sleep quality metrics (sleep score, deep/REM sleep).
- **Workout Management:**
  - Comprehensive exercise database (auto-seeded).
  - Create and manage personalized workout plans and days.
  - Log workout sessions with detailed set-by-set tracking (weight, reps, RPE).
- **Database:** Support for both SQLite (local development) and PostgreSQL (production).

## 🛠 Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** SQLite3, PostgreSQL (via `pg`)
- **Authentication:** Google OAuth2 (via `googleapis`)
- **Testing:** Jest, Supertest
- **Environment Management:** `dotenv`, `cross-env`

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/)
- A Google Cloud Project with OAuth2 credentials (for authentication and optional Google Drive storage).

## ⚙️ Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/yourusername/health-tracker-backend.git
    cd health-tracker-backend
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Configure environment variables:**
    Copy the `.env.example` file to `.env` and fill in your credentials.

    ```bash
    cp .env.example .env
    ```

    Essential variables:
    - `GOOGLE_CLIENT_ID`: Your Google OAuth2 Client ID.
    - `GOOGLE_CLIENT_SECRET`: Your Google OAuth2 Client Secret.
    - `SESSION_KEY`: A secret string for session encryption.
    - `FRONTEND_URL`: The URL of your frontend application (e.g., `http://localhost:3000`).

4.  **Seed the database:**
    The application automatically seeds exercises on first run, but you can also run it manually:
    ```bash
    npm run seed
    ```

## 🚀 Running the Application

- **Development mode:**
  ```bash
  npm start
  ```
  The server will start on `http://localhost:5000` (by default).

## 🧪 Running Tests

The project includes a comprehensive test suite using Jest.

```bash
npm test
```

## 📁 Project Structure

- `src/app.js`: Main Express application configuration.
- `src/config/`: Database and service configurations.
- `src/controllers/`: Logic for handling API requests.
- `src/routes/`: API route definitions.
- `src/scripts/`: Utility scripts (e.g., database seeding).
- `tests/`: Integration and unit tests.
- `server.js`: Application entry point.

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## ⚖️ License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

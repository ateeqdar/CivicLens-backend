# CivicLens Backend

This repository contains the backend API for CivicLens, built with Node.js and Express.

## Project Setup

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Environment Variables:**
    Create a `.env` file in the `backend` directory with the following variables:
    ```
    PORT=3000
    SUPABASE_URL=your_supabase_url
    SUPABASE_KEY=your_supabase_anon_key
    GEMINI_API_KEY=your_gemini_api_key
    ```
    (Adjust variables as per your actual `.env` file content)

3.  **Run Development Server:**
    ```bash
    npm start
    ```
    or
    ```bash
    npm run dev
    ```

## Deployment

This backend application is a Node.js server. Common deployment platforms include Render, Heroku, AWS EC2, DigitalOcean Droplets, etc.

## Technologies Used

*   Node.js
*   Express.js
*   Supabase (for database/authentication)
*   Google Gemini API (for AI services)
*   (Add any other major backend libraries/frameworks you use)

## API Endpoints

(Optional: Document your API endpoints here)

## Contributing

(Optional: Add guidelines for contributing to the backend)

## License

(Optional: Add license information)

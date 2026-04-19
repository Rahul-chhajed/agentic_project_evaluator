# Agentic Instructor AI

A full-stack academic project evaluation platform where teachers create course rubrics and students submit project work for AI-assisted proposal review, milestone feedback, and final grading.

## Overview

This project helps reduce instructor workload by automating three core workflows:
- Proposal evaluation (approve or reject project ideas against course context)
- Milestone feedback (iterative guidance while students build)
- Final grading (rubric-aware scoring with evidence-aware checks)

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, Axios, React Router
- Backend: Node.js, Express, PostgreSQL, JWT, bcrypt
- AI: Google Gemini API with robust JSON parsing and fallback evaluators

## Repository Structure

- backend: Express API, auth, evaluation services, PostgreSQL integration
- frontend: React dashboards for teachers and students
- database_schema.md: SQL schema and indexing guide
- design.txt: product and architecture design notes

## Core Features

- Role-based authentication for teacher and student users
- Teacher course creation with:
  - course description
  - curriculum
  - learning objectives
  - evaluation criteria
- Student enrollment via course code
- Student project proposal submission and AI decisioning
- Milestone submission with optional code snippets for evidence checks
- Auto-generated milestone feedback and score history
- Final score generation with grade bands (A/B/C/D/F)
- Teacher final-score view per course
- Course-level submission lock controlled by teacher

## How Scoring Works

For submission scoring, the system combines:
- text_score (20%)
- code_score (50%)
- consistency_score (30%)

Then it applies evidence penalties where narrative claims are weakly supported by code evidence. If LLM output is malformed/unavailable, deterministic fallback scoring is used so the workflow remains reliable.

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 14+
- Gemini API key

## Environment Variables

Create backend/.env with:

DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME
JWT_SECRET=your_strong_secret_here
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-1.5-flash
MILESTONE_WEIGHT=0.4
FINAL_SUBMISSION_WEIGHT=0.6

Notes:
- GEMINI_MODEL is optional; defaults to gemini-1.5-flash.
- MILESTONE_WEIGHT and FINAL_SUBMISSION_WEIGHT are configurable and default to 0.4 / 0.6.

## Database Setup

1. Create a PostgreSQL database.
2. Apply schema from database_schema.md.
3. Ensure the course lock column exists:

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS submissions_locked BOOLEAN NOT NULL DEFAULT FALSE;

## Local Development

### 1) Install Dependencies

Backend:
- cd backend
- npm install

Frontend:
- cd frontend
- npm install

### 2) Run Backend

From backend:
- node app.js

Backend runs on:
- http://localhost:5000

### 3) Run Frontend

From frontend:
- npm run dev

Frontend runs on:
- http://localhost:5173

## API Surface (High Level)

Auth routes:
- POST /auth/teacher/signup
- POST /auth/teacher/login
- POST /auth/student/signup
- POST /auth/student/login

Teacher routes:
- POST /api/teacher/courses
- GET /api/teacher/courses
- GET /api/teacher/courses/:courseId/projects
- POST /api/teacher/courses/:courseId/submission-lock
- GET /api/teacher/courses/:courseId/final-scores
- GET /api/teacher/projects/:projectId/submissions

Student routes:
- GET /api/student/courses
- POST /api/student/enroll
- GET /api/student/projects
- POST /api/student/projects
- GET /api/student/projects/:projectId/submissions
- POST /api/student/projects/:projectId/submissions
- GET /api/student/projects/:projectId/score-summary

## Frontend Experience

- Protected routes by role (teacher/student)
- Full-screen request loader while API/LLM calls are in progress
- Teacher dashboard for courses, project review, and final score table
- Student dashboard for enrollment, proposal submission, milestone uploads, and feedback modal

## Security Notes

- JWT-based auth and role guards are enforced in backend middleware.
- Passwords are hashed with bcrypt.
- Keep JWT_SECRET and GEMINI_API_KEY private.
- Configure CORS origin for deployment environments.

## Deployment Notes

Before deployment:
- Replace localhost URLs with deployed API/frontend domains.
- Move secrets to platform environment settings.
- Add process manager or startup script for backend (PM2, systemd, container, etc.).

## Known Gaps (Current MVP)

- No automated test suite yet
- No file object storage integration (only metadata/snippets flow)
- No plagiarism detection pipeline
- No advanced moderation or fairness calibration workflows

## License

This repository currently has no explicit license file. Add one (for example, MIT) before open-source distribution.

// Vercel serverless function entry point
// This file re-exports the actual handler from the backend directory

export { default } from '../backend/src/api/cron';

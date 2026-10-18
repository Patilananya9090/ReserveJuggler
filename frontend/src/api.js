// In dev, VITE_API_URL is unset → calls go to '' (proxied by Vite to localhost:8000).
// In production, set VITE_API_URL=https://your-backend.onrender.com in Vercel dashboard.
const BASE = import.meta.env.VITE_API_URL ?? ''

export function apiFetch(input, init) {
  return fetch(`${BASE}${input}`, init)
}

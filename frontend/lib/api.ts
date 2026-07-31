// ponytail: DRY-005 — shared API base URL for all frontend components.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

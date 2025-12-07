// Frontend configuration
// Temporary: for now you will manually paste the test org id here.
// Later we will replace this with auth + memberships.

export const TEST_ORG_ID = "d6b7bbde-54bb-4782-989d-cf9093f8cadf";

// API Base URL - use VITE_API_BASE_URL env var (must be prefixed with VITE_ for Vite)
// Fallback to localhost:4000 if not set
const FALLBACK_API_BASE_URL = 'http://localhost:4000';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || FALLBACK_API_BASE_URL;

// ============================================================================
// CANDIDATE PORTAL API CLIENT
//
// A separate axios instance + token key from the recruiter app, so a candidate
// session and a recruiter session never collide in the same browser. Candidate
// token lives under `candidate_token` in localStorage.
// ============================================================================

import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";
export const CANDIDATE_TOKEN_KEY = "candidate_token";

export const portalApi = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

portalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(CANDIDATE_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

portalApi.interceptors.response.use(
  (r) => r,
  (error) => {
    // On an expired/invalid candidate session, drop the token and bounce to the
    // portal login — but never for the auth endpoints themselves (those surface
    // their own inline errors, e.g. "wrong code").
    const url: string = error.config?.url || "";
    const isAuth = url.includes("/candidate-auth/");
    if (error.response?.status === 401 && !isAuth) {
      const had = !!localStorage.getItem(CANDIDATE_TOKEN_KEY);
      localStorage.removeItem(CANDIDATE_TOKEN_KEY);
      localStorage.removeItem("candidate_profile");
      if (had) window.location.href = "/jobs-portal/login?expired=1";
    }
    return Promise.reject(error);
  },
);

// ── typed helpers ───────────────────────────────────────────────────────────
type ApiEnvelope<T> = { success: boolean; data: T; error?: { message: string } };

function unwrapErr(e: any): never {
  const msg = e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || "Something went wrong";
  throw new Error(msg);
}

export async function pget<T>(url: string, params?: Record<string, any>): Promise<T> {
  try {
    const { data } = await portalApi.get<ApiEnvelope<T>>(url, { params });
    return (data as any).data ?? (data as any);
  } catch (e) {
    unwrapErr(e);
  }
}

export async function ppost<T>(url: string, body?: any): Promise<T> {
  try {
    const { data } = await portalApi.post<ApiEnvelope<T>>(url, body);
    return (data as any).data ?? (data as any);
  } catch (e) {
    unwrapErr(e);
  }
}

export async function ppatch<T>(url: string, body?: any): Promise<T> {
  try {
    const { data } = await portalApi.patch<ApiEnvelope<T>>(url, body);
    return (data as any).data ?? (data as any);
  } catch (e) {
    unwrapErr(e);
  }
}

// Multipart apply (resume upload)
export async function papplyForm<T>(url: string, form: FormData): Promise<T> {
  try {
    const { data } = await portalApi.post<ApiEnvelope<T>>(url, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return (data as any).data ?? (data as any);
  } catch (e) {
    unwrapErr(e);
  }
}

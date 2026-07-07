// ============================================================================
// CANDIDATE PORTAL STORE (Zustand)
// Holds the candidate session — token + profile — separate from recruiter auth.
// ============================================================================

import { create } from "zustand";
import { CANDIDATE_TOKEN_KEY } from "./api";

export interface CandidateProfile {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email_verified: boolean;
  headline?: string | null;
  location?: string | null;
  current_company?: string | null;
  current_title?: string | null;
  experience_years?: number | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
  skills?: string[] | null;
  default_resume_id?: string | null;
}

const PROFILE_KEY = "candidate_profile";

interface PortalState {
  token: string | null;
  profile: CandidateProfile | null;
  isAuthenticated: boolean;
  signIn: (token: string, profile: CandidateProfile) => void;
  setProfile: (profile: CandidateProfile) => void;
  signOut: () => void;
  load: () => void;
}

export const usePortalStore = create<PortalState>((set) => ({
  token: null,
  profile: null,
  isAuthenticated: false,

  signIn: (token, profile) => {
    localStorage.setItem(CANDIDATE_TOKEN_KEY, token);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    set({ token, profile, isAuthenticated: true });
  },

  setProfile: (profile) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    set({ profile });
  },

  signOut: () => {
    localStorage.removeItem(CANDIDATE_TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    set({ token: null, profile: null, isAuthenticated: false });
  },

  load: () => {
    const token = localStorage.getItem(CANDIDATE_TOKEN_KEY);
    const raw = localStorage.getItem(PROFILE_KEY);
    if (token) {
      set({
        token,
        profile: raw ? JSON.parse(raw) : null,
        isAuthenticated: true,
      });
    }
  },
}));

export function isCandidateLoggedIn(): boolean {
  return !!localStorage.getItem(CANDIDATE_TOKEN_KEY);
}

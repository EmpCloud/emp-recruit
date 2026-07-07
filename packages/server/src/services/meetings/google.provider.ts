// ============================================================================
// GOOGLE MEET PROVIDER (via Google Calendar API)
//
// "Sign in with Google" → we get Calendar scope → create a calendar event with
// conferenceData → Google returns a Meet link. No manual token entry.
//
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// ============================================================================

import {
  IMeetingProvider,
  MeetingProvider,
  OAuthTokens,
  CreateMeetingInput,
  CreatedMeeting,
  MeetingProviderError,
} from "./provider.interface";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const CAL_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "openid", "email"];

export class GoogleMeetProvider implements IMeetingProvider {
  readonly provider: MeetingProvider = "google";

  isConfigured(): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  getAuthUrl(state: string, redirectUri: string): string {
    const p = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline", // ask for a refresh token
      prompt: "consent", // force refresh_token on re-consent
      state,
    });
    return `${AUTH}?${p.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw new MeetingProviderError(`Google token exchange failed: ${await res.text()}`, "google");
    const j: any = await res.json();
    // We requested the `openid email` scope, so the response includes an
    // id_token (JWT) whose payload carries the connected account's email. Decode
    // it so the UI can show "Connected · user@company.com" instead of null.
    const accountEmail = emailFromIdToken(j.id_token);
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: new Date(Date.now() + (j.expires_in || 3600) * 1000),
      scope: j.scope,
      accountEmail,
    };
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new MeetingProviderError(`Google token refresh failed: ${await res.text()}`, "google");
    const j: any = await res.json();
    return {
      accessToken: j.access_token,
      refreshToken, // Google doesn't re-issue on refresh
      expiresAt: new Date(Date.now() + (j.expires_in || 3600) * 1000),
      scope: j.scope,
    };
  }

  async createMeeting(accessToken: string, input: CreateMeetingInput): Promise<CreatedMeeting> {
    const end = new Date(input.startTime.getTime() + input.durationMinutes * 60_000);
    const body = {
      summary: input.title,
      description: input.description || "",
      start: { dateTime: input.startTime.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: (input.attendeeEmails || []).map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: `emprecruit-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };
    const res = await fetch(CAL_EVENTS, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new MeetingProviderError(`Google event create failed: ${await res.text()}`, "google");
    const j: any = await res.json();
    const joinUrl = j.hangoutLink || j.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri;
    if (!joinUrl) throw new MeetingProviderError("Google returned no Meet link", "google");
    return {
      joinUrl,
      externalId: j.id,
      metadata: { htmlLink: j.htmlLink, calendarEventId: j.id },
    };
  }
}

// Decode the `email` claim from a Google id_token (a JWT). We only read the
// payload for a display value — no signature verification needed here since the
// token came directly from Google's token endpoint over TLS.
function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  const parts = idToken.split(".");
  if (parts.length < 2) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : undefined;
  } catch {
    return undefined;
  }
}

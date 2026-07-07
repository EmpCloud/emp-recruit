// ============================================================================
// ZOOM PROVIDER (via Zoom OAuth + Meetings API)
//
// "Sign in with Zoom" → OAuth → create a meeting on the user's account → Zoom
// returns a join URL. No manual token entry.
//
// Env: ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
// ============================================================================

import {
  IMeetingProvider,
  MeetingProvider,
  OAuthTokens,
  CreateMeetingInput,
  CreatedMeeting,
  MeetingProviderError,
} from "./provider.interface";

const AUTH = "https://zoom.us/oauth/authorize";
const TOKEN = "https://zoom.us/oauth/token";
const CREATE = "https://api.zoom.us/v2/users/me/meetings";

function basicAuth(): string {
  return Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString("base64");
}

export class ZoomProvider implements IMeetingProvider {
  readonly provider: MeetingProvider = "zoom";

  isConfigured(): boolean {
    return !!(process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
  }

  getAuthUrl(state: string, redirectUri: string): string {
    const p = new URLSearchParams({
      response_type: "code",
      client_id: process.env.ZOOM_CLIENT_ID || "",
      redirect_uri: redirectUri,
      state,
    });
    return `${AUTH}?${p.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: {
        authorization: `Basic ${basicAuth()}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    if (!res.ok) throw new MeetingProviderError(`Zoom token exchange failed: ${await res.text()}`, "zoom");
    const j: any = await res.json();
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: new Date(Date.now() + (j.expires_in || 3600) * 1000),
      scope: j.scope,
    };
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: {
        authorization: `Basic ${basicAuth()}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    if (!res.ok) throw new MeetingProviderError(`Zoom token refresh failed: ${await res.text()}`, "zoom");
    const j: any = await res.json();
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token || refreshToken,
      expiresAt: new Date(Date.now() + (j.expires_in || 3600) * 1000),
      scope: j.scope,
    };
  }

  async createMeeting(accessToken: string, input: CreateMeetingInput): Promise<CreatedMeeting> {
    const res = await fetch(CREATE, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        topic: input.title,
        type: 2, // scheduled meeting
        start_time: input.startTime.toISOString(),
        duration: input.durationMinutes,
        timezone: "UTC",
        settings: { join_before_host: true, waiting_room: false },
      }),
    });
    if (!res.ok) throw new MeetingProviderError(`Zoom meeting create failed: ${await res.text()}`, "zoom");
    const j: any = await res.json();
    if (!j.join_url) throw new MeetingProviderError("Zoom returned no join URL", "zoom");
    return {
      joinUrl: j.join_url,
      externalId: String(j.id),
      metadata: { password: j.password, start_url: j.start_url, host_email: j.host_email },
    };
  }
}

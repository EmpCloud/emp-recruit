// ============================================================================
// MICROSOFT TEAMS PROVIDER (via Microsoft Graph)
//
// "Sign in with Microsoft" → OnlineMeetings.ReadWrite scope → create an
// onlineMeeting → Graph returns a Teams join URL. No manual token entry.
//
// Env: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT (default "common")
// ============================================================================

import {
  IMeetingProvider,
  MeetingProvider,
  OAuthTokens,
  CreateMeetingInput,
  CreatedMeeting,
  MeetingProviderError,
} from "./provider.interface";

const TENANT = () => process.env.MICROSOFT_TENANT || "common";
const AUTH = () => `https://login.microsoftonline.com/${TENANT()}/oauth2/v2.0/authorize`;
const TOKEN = () => `https://login.microsoftonline.com/${TENANT()}/oauth2/v2.0/token`;
const GRAPH_MEETINGS = "https://graph.microsoft.com/v1.0/me/onlineMeetings";
const SCOPES = ["OnlineMeetings.ReadWrite", "User.Read", "offline_access", "openid", "email"];

export class MicrosoftTeamsProvider implements IMeetingProvider {
  readonly provider: MeetingProvider = "microsoft";

  isConfigured(): boolean {
    return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  }

  getAuthUrl(state: string, redirectUri: string): string {
    const p = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID || "",
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPES.join(" "),
      state,
    });
    return `${AUTH()}?${p.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    return this.tokenReq({
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    return this.tokenReq({ refresh_token: refreshToken, grant_type: "refresh_token" });
  }

  private async tokenReq(extra: Record<string, string>): Promise<OAuthTokens> {
    const res = await fetch(TOKEN(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID || "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || "",
        scope: SCOPES.join(" "),
        ...extra,
      }),
    });
    if (!res.ok) throw new MeetingProviderError(`Microsoft token request failed: ${await res.text()}`, "microsoft");
    const j: any = await res.json();
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: new Date(Date.now() + (j.expires_in || 3600) * 1000),
      scope: j.scope,
    };
  }

  async createMeeting(accessToken: string, input: CreateMeetingInput): Promise<CreatedMeeting> {
    const end = new Date(input.startTime.getTime() + input.durationMinutes * 60_000);
    const res = await fetch(GRAPH_MEETINGS, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        startDateTime: input.startTime.toISOString(),
        endDateTime: end.toISOString(),
        subject: input.title,
      }),
    });
    if (!res.ok) throw new MeetingProviderError(`Teams meeting create failed: ${await res.text()}`, "microsoft");
    const j: any = await res.json();
    if (!j.joinWebUrl) throw new MeetingProviderError("Teams returned no join URL", "microsoft");
    return {
      joinUrl: j.joinWebUrl,
      externalId: j.id,
      metadata: { audioConferencing: j.audioConferencing },
    };
  }
}

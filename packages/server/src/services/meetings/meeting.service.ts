// ============================================================================
// MEETING SERVICE
//
// Orchestrates OAuth connections + meeting creation across Google/Teams/Zoom.
//   - getProvider              : the adapter for a provider key
//   - beginOAuth / completeOAuth : the "Sign in with X" redirect dance
//   - listConnections          : which providers an org has connected
//   - createMeetingForInterview : mint a real join link + save it on the interview
//
// Tokens are stored per-org in meeting_connections; access tokens are refreshed
// on demand from the refresh token, so no one re-enters credentials.
// ============================================================================

import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { ValidationError, NotFoundError } from "../../utils/errors";
import { IMeetingProvider, MeetingProvider, CreatedMeeting } from "./provider.interface";
import { GoogleMeetProvider } from "./google.provider";
import { MicrosoftTeamsProvider } from "./microsoft.provider";
import { ZoomProvider } from "./zoom.provider";

const PROVIDERS: Record<MeetingProvider, IMeetingProvider> = {
  google: new GoogleMeetProvider(),
  microsoft: new MicrosoftTeamsProvider(),
  zoom: new ZoomProvider(),
};

export function getProvider(key: string): IMeetingProvider {
  const p = PROVIDERS[key as MeetingProvider];
  if (!p) throw new ValidationError(`Unknown meeting provider: ${key}`);
  return p;
}

// The OAuth redirect URI back to this server. Providers must be configured with
// this exact URI. Defaults derive from PUBLIC_URL/API base.
function redirectUri(provider: string): string {
  const base = process.env.PUBLIC_API_URL || `http://localhost:${config.port}`;
  return `${base}/api/v1/meetings/oauth/${provider}/callback`;
}

// ---------------------------------------------------------------------------
// Which providers are available (configured) + connected (for an org).
// ---------------------------------------------------------------------------
export async function listConnections(orgId: number): Promise<
  { provider: MeetingProvider; configured: boolean; connected: boolean; account_email?: string }[]
> {
  const knex = getDB().knex();
  const rows = await knex("meeting_connections")
    .where({ organization_id: orgId, status: "connected" })
    .select("provider", "account_email");
  const byProvider = new Map<string, string | undefined>(
    rows.map((r: any) => [r.provider, r.account_email]),
  );
  return (Object.keys(PROVIDERS) as MeetingProvider[]).map((provider) => ({
    provider,
    configured: PROVIDERS[provider].isConfigured(),
    connected: byProvider.has(provider),
    account_email: byProvider.get(provider) || undefined,
  }));
}

// ---------------------------------------------------------------------------
// Begin OAuth — returns the provider consent URL to redirect the recruiter to.
// ---------------------------------------------------------------------------
export async function beginOAuth(
  orgId: number,
  userId: number | undefined,
  providerKey: string,
  redirectAfter?: string,
): Promise<string> {
  const provider = getProvider(providerKey);
  if (!provider.isConfigured()) {
    throw new ValidationError(`${providerKey} is not configured on the server (missing client id/secret)`);
  }
  const knex = getDB().knex();
  const state = crypto.randomBytes(24).toString("hex");
  await knex("meeting_oauth_states").insert({
    id: uuidv4(),
    state,
    organization_id: orgId,
    user_id: userId ?? null,
    provider: providerKey,
    redirect_after: redirectAfter || null,
    expires_at: new Date(Date.now() + 10 * 60_000),
    created_at: new Date(),
  });
  return provider.getAuthUrl(state, redirectUri(providerKey));
}

// ---------------------------------------------------------------------------
// Complete OAuth — exchange code, store the connection. Returns redirect target.
// ---------------------------------------------------------------------------
export async function completeOAuth(
  providerKey: string,
  code: string,
  state: string,
): Promise<{ redirectAfter: string | null }> {
  const knex = getDB().knex();
  const stateRow = await knex("meeting_oauth_states").where({ state, provider: providerKey }).first();
  if (!stateRow) throw new ValidationError("Invalid or expired OAuth state");
  if (new Date(stateRow.expires_at) < new Date()) {
    await knex("meeting_oauth_states").where({ id: stateRow.id }).del();
    throw new ValidationError("OAuth state expired — please try connecting again");
  }
  await knex("meeting_oauth_states").where({ id: stateRow.id }).del();

  const provider = getProvider(providerKey);
  const tokens = await provider.exchangeCode(code, redirectUri(providerKey));

  const existing = await knex("meeting_connections")
    .where({ organization_id: stateRow.organization_id, provider: providerKey })
    .first();
  const row = {
    organization_id: stateRow.organization_id,
    provider: providerKey,
    connected_by: stateRow.user_id,
    account_email: tokens.accountEmail || existing?.account_email || null,
    access_token: tokens.accessToken,
    // Keep the prior refresh token if the provider didn't return a new one.
    refresh_token: tokens.refreshToken || existing?.refresh_token || null,
    expires_at: tokens.expiresAt || null,
    scope: tokens.scope || null,
    status: "connected",
    updated_at: new Date(),
  };
  if (existing) {
    await knex("meeting_connections").where({ id: existing.id }).update(row);
  } else {
    await knex("meeting_connections").insert({ id: uuidv4(), created_at: new Date(), ...row });
  }
  logger.info(`Meeting provider ${providerKey} connected for org ${stateRow.organization_id}`);
  return { redirectAfter: stateRow.redirect_after };
}

export async function disconnect(orgId: number, providerKey: string): Promise<void> {
  const knex = getDB().knex();
  await knex("meeting_connections")
    .where({ organization_id: orgId, provider: providerKey })
    .update({ status: "revoked", access_token: null, refresh_token: null, updated_at: new Date() });
}

// ---------------------------------------------------------------------------
// Get a VALID access token for an org+provider, refreshing if expired.
// ---------------------------------------------------------------------------
async function validAccessToken(orgId: number, providerKey: string): Promise<string> {
  const knex = getDB().knex();
  const conn = await knex("meeting_connections")
    .where({ organization_id: orgId, provider: providerKey, status: "connected" })
    .first();
  if (!conn) throw new ValidationError(`${providerKey} is not connected for this organization`);

  const notExpired = conn.expires_at && new Date(conn.expires_at).getTime() - 60_000 > Date.now();
  if (conn.access_token && notExpired) return conn.access_token;

  if (!conn.refresh_token) {
    throw new ValidationError(`${providerKey} session expired — please reconnect`);
  }
  const provider = getProvider(providerKey);
  const tokens = await provider.refresh(conn.refresh_token);
  await knex("meeting_connections").where({ id: conn.id }).update({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken || conn.refresh_token,
    expires_at: tokens.expiresAt || null,
    updated_at: new Date(),
  });
  return tokens.accessToken;
}

// ---------------------------------------------------------------------------
// Create a meeting for an interview and persist the link on the interview row.
// providerKey optional — defaults to the org's first connected provider.
// ---------------------------------------------------------------------------
export async function createMeetingForInterview(
  orgId: number,
  interviewId: string,
  providerKey?: string,
  attendeeEmails?: string[],
): Promise<CreatedMeeting & { provider: MeetingProvider }> {
  const knex = getDB().knex();
  const interview = await knex("interviews").where({ id: interviewId, organization_id: orgId }).first();
  if (!interview) throw new NotFoundError("Interview");

  // Resolve provider: explicit, else the org's first connected one.
  let key = providerKey;
  if (!key) {
    const conn = await knex("meeting_connections")
      .where({ organization_id: orgId, status: "connected" })
      .first();
    if (!conn) throw new ValidationError("No meeting provider connected — connect Google, Teams, or Zoom first");
    key = conn.provider;
  }

  const accessToken = await validAccessToken(orgId, key!);
  const provider = getProvider(key!);
  const created = await provider.createMeeting(accessToken, {
    title: interview.title,
    startTime: new Date(interview.scheduled_at),
    durationMinutes: interview.duration_minutes || 60,
    description: interview.notes || undefined,
    attendeeEmails,
  });

  await knex("interviews").where({ id: interviewId }).update({
    meeting_link: created.joinUrl,
    meeting_provider: key,
    meeting_external_id: created.externalId,
    meeting_metadata: JSON.stringify(created.metadata || {}),
    updated_at: new Date(),
  });

  return { ...created, provider: key as MeetingProvider };
}

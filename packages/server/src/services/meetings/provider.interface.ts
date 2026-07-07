// ============================================================================
// MEETING PROVIDER INTERFACE
//
// A common shape for Google Meet / Microsoft Teams / Zoom so interview
// scheduling can create a video meeting regardless of provider. Each provider
// implements getAuthUrl (start OAuth), exchangeCode (finish OAuth), and
// createMeeting (mint a meeting from a stored connection).
// ============================================================================

export type MeetingProvider = "google" | "microsoft" | "zoom";

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  accountEmail?: string;
}

export interface CreateMeetingInput {
  title: string;
  startTime: Date;
  durationMinutes: number;
  description?: string;
  attendeeEmails?: string[];
}

export interface CreatedMeeting {
  joinUrl: string; // the link candidates/interviewers click
  externalId: string; // provider's meeting/event id
  metadata?: Record<string, any>; // passcode, dial-in, host url, etc.
}

export interface IMeetingProvider {
  readonly provider: MeetingProvider;

  /** Build the provider consent URL the recruiter is redirected to. */
  getAuthUrl(state: string, redirectUri: string): string;

  /** Exchange the OAuth `code` for tokens. */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;

  /** Refresh an expired access token from a refresh token. */
  refresh(refreshToken: string): Promise<OAuthTokens>;

  /** Create a meeting using a valid access token. */
  createMeeting(accessToken: string, input: CreateMeetingInput): Promise<CreatedMeeting>;

  /** Whether this provider is configured (client id/secret present in env). */
  isConfigured(): boolean;
}

export class MeetingProviderError extends Error {
  constructor(message: string, public provider: MeetingProvider) {
    super(message);
    this.name = "MeetingProviderError";
  }
}

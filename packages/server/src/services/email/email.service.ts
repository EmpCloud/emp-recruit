// ============================================================================
// EMAIL SERVICE
// Email template management and sending via nodemailer + Handlebars.
// ============================================================================

import nodemailer from "nodemailer";
import Handlebars from "handlebars";
import { getDB } from "../../db/adapters";
import { config } from "../../config";
import { NotFoundError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { EmailTemplate } from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Nodemailer transporter (singleton)
// ---------------------------------------------------------------------------
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth:
        config.email.user && config.email.password
          ? { user: config.email.user, pass: config.email.password }
          : undefined,
    });
  }
  return transporter;
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export async function listTemplates(orgId: number): Promise<EmailTemplate[]> {
  const db = getDB();
  const result = await db.findMany<EmailTemplate>("email_templates", {
    filters: { organization_id: orgId },
    sort: { field: "name", order: "asc" },
    limit: 100,
  });
  return result.data;
}

export async function getTemplateById(orgId: number, id: string): Promise<EmailTemplate> {
  const db = getDB();
  const template = await db.findOne<EmailTemplate>("email_templates", {
    id,
    organization_id: orgId,
  });
  if (!template) {
    throw new NotFoundError("Email template", id);
  }
  return template;
}

export async function createTemplate(
  orgId: number,
  data: { name: string; trigger: string; subject: string; body: string; is_active?: boolean },
): Promise<EmailTemplate> {
  const db = getDB();
  return db.create<EmailTemplate>("email_templates", {
    organization_id: orgId,
    name: data.name,
    trigger: data.trigger,
    subject: data.subject,
    body: data.body,
    is_active: data.is_active !== false,
  } as Partial<EmailTemplate>);
}

export async function updateTemplate(
  orgId: number,
  id: string,
  data: Partial<Pick<EmailTemplate, "name" | "trigger" | "subject" | "body" | "is_active">>,
): Promise<EmailTemplate> {
  const db = getDB();
  const template = await db.findOne<EmailTemplate>("email_templates", {
    id,
    organization_id: orgId,
  });
  if (!template) {
    throw new NotFoundError("Email template", id);
  }
  return db.update<EmailTemplate>("email_templates", id, data as Partial<EmailTemplate>);
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

export function renderTemplate(
  templateContent: string,
  variables: Record<string, any>,
): string {
  const compiled = Handlebars.compile(templateContent);
  return compiled(variables);
}

// ---------------------------------------------------------------------------
// Send email
// ---------------------------------------------------------------------------

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ messageId: string }> {
  const transport = getTransporter();

  const info = await transport.sendMail({
    from: config.email.from,
    to,
    subject,
    html,
  });

  logger.info(`Email sent to ${to}: ${subject} (messageId: ${info.messageId})`);

  return { messageId: info.messageId };
}

// ---------------------------------------------------------------------------
// Convenience: render + send using a stored template
// ---------------------------------------------------------------------------

export async function sendTemplatedEmail(
  orgId: number,
  trigger: string,
  to: string,
  variables: Record<string, any>,
): Promise<{ messageId: string } | null> {
  const db = getDB();
  const template = await db.findOne<EmailTemplate>("email_templates", {
    organization_id: orgId,
    trigger,
    is_active: true,
  });

  if (!template) {
    logger.warn(`No active email template found for trigger: ${trigger} (org: ${orgId})`);
    return null;
  }

  const renderedSubject = renderTemplate(template.subject, variables);
  const renderedBody = renderTemplate(template.body, variables);

  return sendEmail(to, renderedSubject, renderedBody);
}

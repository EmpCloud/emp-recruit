import type { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";

export async function seed(knex: Knex): Promise<void> {
  // Only seed if no email templates exist
  const existing = await knex("email_templates").first();
  if (existing) return;

  const now = new Date();

  // Default email templates
  const templates = [
    {
      id: uuidv4(),
      organization_id: 1,
      name: "Application Received",
      trigger: "application_received",
      subject: "Thank you for applying to {{jobTitle}}",
      body: `<p>Dear {{candidateName}},</p>
<p>Thank you for your interest in the <strong>{{jobTitle}}</strong> position at {{orgName}}.</p>
<p>We have received your application and our team will review it shortly. We will get back to you within 5-7 business days.</p>
<p>Best regards,<br/>{{orgName}} Recruitment Team</p>`,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      organization_id: 1,
      name: "Interview Scheduled",
      trigger: "interview_scheduled",
      subject: "Interview Scheduled — {{jobTitle}}",
      body: `<p>Dear {{candidateName}},</p>
<p>We are pleased to inform you that your interview for <strong>{{jobTitle}}</strong> has been scheduled.</p>
<p><strong>Date:</strong> {{interviewDate}}<br/>
<strong>Time:</strong> {{interviewTime}}<br/>
<strong>Type:</strong> {{interviewType}}<br/>
{{#if meetingLink}}<strong>Meeting Link:</strong> <a href="{{meetingLink}}">{{meetingLink}}</a>{{/if}}</p>
<p>Please let us know if you need to reschedule.</p>
<p>Best regards,<br/>{{orgName}} Recruitment Team</p>`,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      organization_id: 1,
      name: "Offer Letter",
      trigger: "offer_sent",
      subject: "Offer Letter — {{jobTitle}} at {{orgName}}",
      body: `<p>Dear {{candidateName}},</p>
<p>Congratulations! We are delighted to extend an offer for the position of <strong>{{jobTitle}}</strong> at {{orgName}}.</p>
<p>Please find the details of your offer attached. Kindly review and respond by {{expiryDate}}.</p>
<p>We look forward to welcoming you to the team!</p>
<p>Best regards,<br/>{{orgName}} Recruitment Team</p>`,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      organization_id: 1,
      name: "Application Rejected",
      trigger: "application_rejected",
      subject: "Update on your application — {{jobTitle}}",
      body: `<p>Dear {{candidateName}},</p>
<p>Thank you for your interest in the <strong>{{jobTitle}}</strong> position at {{orgName}} and for taking the time to go through our selection process.</p>
<p>After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.</p>
<p>We encourage you to apply for future openings. We wish you the best in your career.</p>
<p>Best regards,<br/>{{orgName}} Recruitment Team</p>`,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
  ];

  await knex("email_templates").insert(templates);

  // Default career page
  const careerPage = {
    id: uuidv4(),
    organization_id: 1,
    slug: "default",
    title: "Careers",
    description: "Join our team and help build the future.",
    logo_url: null,
    banner_url: null,
    primary_color: "#4F46E5",
    is_active: true,
    custom_css: null,
    created_at: now,
    updated_at: now,
  };

  await knex("career_pages").insert(careerPage);
}

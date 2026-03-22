# EMP Recruit

> Streamline hiring and onboarding for faster, seamless team growth

[![Part of EmpCloud](https://img.shields.io/badge/EmpCloud-Module-blue)]()
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-purple.svg)](LICENSE)

EMP Recruit is the recruitment and applicant tracking module of the EmpCloud ecosystem. It provides end-to-end hiring workflow management from job posting through candidate tracking, interviews, offers, and onboarding.

---

## Features

| Feature | Description |
|---------|-------------|
| Job Postings | Create openings with title, description, requirements, department, location, salary range, employment type |
| Career Page | Public-facing careers page, customizable per organization |
| Application Tracking (ATS) | Kanban pipeline: Applied -> Screened -> Interview -> Offer -> Hired/Rejected |
| Candidate Management | Candidate profiles, resume upload/parsing, notes, tags |
| Interview Scheduling | Schedule interviews, assign interviewers, calendar integration |
| Interview Feedback | Structured scorecards, interviewer ratings, recommendation |
| Offer Management | Generate offer letters, approval workflow, e-signature |
| Onboarding Checklists | Pre-joining tasks, document collection, IT provisioning, welcome kit |
| Referral Program | Employee referral tracking, bonus eligibility |
| Recruitment Analytics | Time-to-hire, source effectiveness, pipeline conversion, offer acceptance rate |
| Job Board Integration | Post to LinkedIn, Indeed, Naukri via API hooks |
| Email Templates | Automated emails for each pipeline stage (Handlebars-based) |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20 |
| Backend | Express 5, TypeScript |
| Frontend | React 19, Vite 6, TypeScript |
| Styling | Tailwind CSS, Radix UI |
| Database | MySQL 8 via Knex.js (`emp_recruit` database) |
| Cache / Queue | Redis 7, BullMQ |
| Auth | OAuth2/OIDC via EMP Cloud (RS256 JWT verification) |
| File Uploads | Multer (local storage, S3-ready) |

---

## Project Structure

```
emp-recruit/
  package.json
  pnpm-workspace.yaml
  tsconfig.json
  docker-compose.yml
  .env.example
  packages/
    shared/                     # @emp-recruit/shared
      src/
        types/                  # TypeScript interfaces & enums
        validators/             # Zod request validation schemas
        constants/              # Stage definitions, defaults
    server/                     # @emp-recruit/server (port 4500)
      src/
        config/                 # Environment configuration
        db/
          connection.ts         # Knex connection to emp_recruit
          empcloud.ts           # Read-only connection to empcloud DB
          migrations/           # 5 migration files
        api/
          middleware/            # auth, RBAC, error handling, upload
          routes/               # Route handlers per domain
          validators/           # Request validators
        services/               # Business logic (thin controller pattern)
        jobs/                   # BullMQ workers (email, resume parse, job board sync)
        utils/                  # Logger, errors, response helpers
    client/                     # @emp-recruit/client (port 5179)
      src/
        api/                    # API client & hooks
        components/
          layout/               # DashboardLayout, PublicLayout
          ui/                   # Radix-based UI primitives
          recruit/              # KanbanBoard, FeedbackForm, etc.
        pages/                  # Route-based page components
        lib/                    # Auth store, utilities
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `job_postings` | Job openings with title, description, requirements, salary, status |
| `candidates` | Candidate profiles with contact info, resume, experience, source |
| `applications` | Links candidates to jobs with pipeline stage tracking |
| `application_stage_history` | Audit trail of all stage transitions |
| `interviews` | Scheduled interviews with type, time, location, meeting link |
| `interview_panelists` | Interviewer assignments per interview |
| `interview_feedback` | Structured scorecard ratings and recommendations |
| `offers` | Offer details with salary, designation, approval status |
| `offer_approvers` | Multi-step offer approval chain |
| `onboarding_templates` | Reusable onboarding task templates |
| `onboarding_template_tasks` | Individual tasks within a template |
| `onboarding_checklists` | Instantiated checklists for hired candidates |
| `onboarding_tasks` | Individual onboarding task assignments and progress |
| `referrals` | Employee referral tracking with bonus eligibility |
| `email_templates` | Handlebars-based email templates per pipeline stage |
| `career_pages` | Per-org public career page configuration |
| `job_board_postings` | External job board posting status tracking |
| `recruitment_events` | Analytics event log for reporting |

---

## API Endpoints

All endpoints under `/api/v1/`. Server runs on port **4500**.

### Job Postings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs` | List job postings (paginated, filterable) |
| POST | `/jobs` | Create job posting |
| GET | `/jobs/:id` | Get job posting detail |
| PUT | `/jobs/:id` | Update job posting |
| PATCH | `/jobs/:id/status` | Change status (publish/pause/close) |
| GET | `/jobs/:id/applications` | List applications for a job |
| GET | `/jobs/:id/analytics` | Job-level analytics |

### Candidates
| Method | Path | Description |
|--------|------|-------------|
| GET | `/candidates` | List/search candidates |
| POST | `/candidates` | Create candidate |
| GET | `/candidates/:id` | Get candidate profile |
| PUT | `/candidates/:id` | Update candidate |
| POST | `/candidates/:id/resume` | Upload/replace resume |

### Applications (ATS)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/applications` | List all applications |
| POST | `/applications` | Create application |
| GET | `/applications/:id` | Get application with full history |
| PATCH | `/applications/:id/stage` | Move to next/prev stage |
| GET | `/applications/:id/timeline` | Stage history timeline |

### Interviews
| Method | Path | Description |
|--------|------|-------------|
| GET | `/interviews` | List interviews |
| POST | `/interviews` | Schedule interview |
| GET | `/interviews/:id` | Get interview detail |
| PUT | `/interviews/:id` | Reschedule/update |
| POST | `/interviews/:id/feedback` | Submit feedback scorecard |

### Offers
| Method | Path | Description |
|--------|------|-------------|
| POST | `/offers` | Create offer |
| GET | `/offers/:id` | Get offer detail |
| POST | `/offers/:id/submit-approval` | Submit for approval |
| POST | `/offers/:id/approve` | Approve offer |
| POST | `/offers/:id/send` | Send to candidate |

### Onboarding
| Method | Path | Description |
|--------|------|-------------|
| GET | `/onboarding/templates` | List templates |
| POST | `/onboarding/templates` | Create template |
| POST | `/onboarding/checklists` | Generate checklist for hire |
| PATCH | `/onboarding/tasks/:id` | Update task status |

### Public Career Page (No Auth)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/public/careers/:slug` | Public career page |
| GET | `/public/careers/:slug/jobs` | List open jobs |
| POST | `/public/careers/:slug/apply` | Submit application with resume |

### Other Endpoints
- **Referrals**: CRUD for employee referral submissions
- **Email Templates**: CRUD with preview rendering
- **Career Page Admin**: Config and publish controls
- **Analytics**: Overview, pipeline funnel, time-to-hire, source effectiveness
- **Job Board Integration**: Post/remove jobs on external boards

---

## Frontend Pages

### Admin Pages (Authenticated)
| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | Overview stats, open positions, pipeline summary |
| `/jobs` | Job List | Job postings with status/department filters |
| `/jobs/new` | Job Form | Create/edit job posting |
| `/jobs/:id` | Job Detail | Applications kanban board |
| `/candidates` | Candidate List | Searchable candidate database |
| `/candidates/:id` | Candidate Detail | Full profile, application history |
| `/interviews` | Interview List | Calendar view of interviews |
| `/offers` | Offer List | Offers with status filter |
| `/onboarding` | Onboarding List | Active onboarding checklists |
| `/referrals` | Referral List | Referral tracking |
| `/analytics` | Analytics | Charts: time-to-hire, funnel, sources |
| `/settings` | Settings | Career page, email templates, integrations |

### Public Pages (No Auth)
| Route | Page | Description |
|-------|------|-------------|
| `/careers/:slug` | Career Page | Public career page with org branding |
| `/careers/:slug/jobs/:jobId` | Job View | Public job detail |
| `/careers/:slug/apply/:jobId` | Application Form | Resume upload and apply |

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+
- MySQL 8+
- Redis 7+
- EMP Cloud running (for authentication)

### Install
```bash
git clone https://github.com/anthropic/emp-recruit.git
cd emp-recruit
pnpm install
```

### Environment Setup
```bash
cp .env.example .env
# Edit .env with your database credentials and EMP Cloud URL
```

### Docker
```bash
docker-compose up -d
```

### Development
```bash
# Run all packages in development mode
pnpm dev

# Run individually
pnpm --filter @emp-recruit/server dev    # Server on :4500
pnpm --filter @emp-recruit/client dev    # Client on :5179

# Run migrations
pnpm --filter @emp-recruit/server migrate
```

---

## Implementation Plan

### Phase 1: MVP (Weeks 1-3)
**Goal:** Basic job posting and application tracking.
1. Monorepo scaffolding (package.json, tsconfig, docker-compose)
2. Database layer (dual connections, Migration 001: jobs, candidates, applications)
3. Server foundation (Express, auth middleware, RBAC, error handling)
4. Job Posting CRUD, Candidate CRUD, Application pipeline
5. Client scaffolding (Vite, Tailwind, routing, auth)
6. Job pages, Candidate pages, Kanban board, Basic dashboard

### Phase 2: Core Features (Weeks 4-6)
**Goal:** Interviews, offers, career page, email.
1. Migration 002 (interviews, panelists, feedback)
2. Interview scheduling and feedback scorecards
3. Migration 003 (offers, onboarding)
4. Offer approval workflow
5. Career page (admin config + public routes)
6. Email templates with Handlebars, BullMQ email queue
7. Client pages for interviews, offers, career page admin

### Phase 3: Advanced (Weeks 7-9)
**Goal:** Onboarding, referrals, analytics, integrations.
1. Onboarding templates and checklists
2. Referral program
3. Migration 005 (job board postings, recruitment events)
4. Analytics dashboard (time-to-hire, funnel, sources)
5. Job board integration (LinkedIn, Indeed, Naukri)
6. Resume parsing queue, Calendar integration (.ics)
7. E2E tests with Playwright

---

## License

This project is licensed under the [AGPL-3.0 License](LICENSE).

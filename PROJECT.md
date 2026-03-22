# EMP Recruit — Project Progress

## Status: In Progress

### Scaffolding
- [ ] Root config (package.json, pnpm-workspace, tsconfig, docker-compose, .env)
- [ ] Shared package (types, validators, constants)
- [ ] Server infrastructure (config, utils, DB layer, auth middleware)
- [ ] Client shell (Vite, React, Tailwind, routing, layouts)

### Database (5 migrations, 18 tables)
- [ ] Migration 001: job_postings, candidates, applications, stage_history
- [ ] Migration 002: interviews, panelists, feedback
- [ ] Migration 003: offers, approvers, onboarding templates/checklists/tasks
- [ ] Migration 004: referrals, email_templates, career_pages
- [ ] Migration 005: job_board_postings, recruitment_events, audit_logs

### Server Services (11 services)
- [ ] Auth service (login, register, refresh via empcloud DB)
- [ ] Job service (CRUD, status transitions, slug generation)
- [ ] Candidate service (CRUD, resume upload, dedup)
- [ ] Application service (ATS pipeline, stage transitions, notes)
- [ ] Interview service (scheduling, panelists, feedback scorecards)
- [ ] Offer service (create, approval chain, send, accept/decline)
- [ ] Onboarding service (templates, checklists, task tracking)
- [ ] Referral service (submit, track, bonus eligibility)
- [ ] Email service (Handlebars templates, send)
- [ ] Career page service (config, public jobs, public apply)
- [ ] Analytics service (dashboard, funnel, time-to-hire, sources)

### API Routes (12 route files, ~55 endpoints)
- [ ] Auth, Jobs, Candidates, Applications
- [ ] Interviews, Offers, Onboarding
- [ ] Referrals, Email templates, Career page
- [ ] Public routes (no auth), Analytics

### Frontend Pages (21 pages)
- [ ] Dashboard, Job list/form/detail
- [ ] Candidate list/detail, Application detail
- [ ] Interview list/detail, Offer list/detail
- [ ] Onboarding list/templates/detail
- [ ] Referrals, Analytics, Settings
- [ ] Public: Career page, Job view, Application form, Success

### Testing & Verification
- [ ] Server compiles and starts
- [ ] Migrations run successfully
- [ ] API endpoints respond
- [ ] Frontend renders
- [ ] E2E flow works (post job → apply → interview → offer → hire)

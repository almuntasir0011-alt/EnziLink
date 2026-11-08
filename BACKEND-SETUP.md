# EnziLink backend setup

This repository is a standalone EnziLink application. Its backend must use a dedicated Supabase project and must never reuse the EnziVolt project.

## Database migration

The initial schema is in `supabase/migrations/202611080001_initial_marketplace.sql`. It creates customer/worker profiles, worker skills, service requests, responses, conversations, messages, reviews, blocks and reports with Row Level Security enabled.

Important privacy choices:
- No phone number, email address or street address is stored in public worker profile tables.
- Worker profiles are searchable only after the worker publishes them.
- Customer requests and messages require authentication.
- Admin role assignment and moderation tooling are intentionally not self-service; add a trusted server-side admin process before enabling them.
- This is a schema foundation, not a claim that the frontend is already connected.

## Activation checklist

1. Create a separate Supabase project named EnziLink.
2. Apply the migration using the Supabase migration workflow.
3. Configure the EnziLink frontend with only its project URL and publishable/anon key.
4. Never place a service-role key in browser code or GitHub Pages.
5. Connect signup/login, worker profile, search, request posting, responses and messaging one flow at a time.
6. Test RLS with two separate test accounts (customer and worker) before public launch.

The GitHub Pages site remains a prototype until these steps and end-to-end tests are complete.

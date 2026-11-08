# EnziLink — Technician & Service Marketplace

**Tagline:** Connect Skills. Create Opportunities.

Bangladesh-first marketplace connecting customers directly with skilled workers across professions. EnziLink is a separate application under the EnziVolt parent brand.

## Current integration

- Uses the existing free Supabase project used by EnziVolt to avoid an additional paid project.
- EnziLink data is isolated in its own `el_*` tables in the shared `public` schema. Existing EnziVolt tables are not renamed or overwritten.
- Row Level Security is enabled on all 10 EnziLink tables.
- EnziLink sign-up/login, worker discovery, and customer job-post creation are connected to Supabase Auth and the Data API.
- The EnziLink landing page links to the EnziVolt Customer Portal: https://enzivolt.netlify.app/customer/
- The EnziVolt Customer Portal links back to the EnziLink project repository.

## Data and security

- Frontend uses only the Supabase publishable key; never put a service-role key in browser code.
- Customer requests, conversations, messages, reports, and private account records are restricted by RLS.
- Public visitors can read only published worker profile information and reviews.
- EnziLink uses its own prefixed database tables: `el_profiles`, `el_worker_profiles`, `el_worker_skills`, `el_service_requests`, `el_request_responses`, `el_conversations`, `el_messages`, `el_reviews`, `el_user_blocks`, and `el_reports`.

## Remaining work before production

- Worker profile editing, skills management, publish/unpublish controls, public contact phone, and click-to-call worker cards are implemented.
- Worker response, messaging, review, moderation, and admin interfaces.
- Full customer identity and request-status synchronization with the EnziVolt Customer Portal. At present the two portals cross-link, but their existing account systems and service-request backends are not yet unified.
- Test signup, email confirmation, login, worker search, and job posting on the deployed website.
- Configure backups and monitor the Supabase Free project's inactivity/pause limits. Free service does not guarantee continuous uptime or long-term backups.

## Deployment

The site is a responsive Bengali-first PWA starter. Deploy the repository's static files to the chosen static host after completing the remaining tests. Do not expose any Supabase secret/service-role key in frontend code.

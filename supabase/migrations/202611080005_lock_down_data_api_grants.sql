
revoke all on table
 public.el_profiles, public.el_worker_profiles, public.el_worker_skills,
 public.el_service_requests, public.el_request_responses, public.el_conversations,
 public.el_messages, public.el_reviews, public.el_user_blocks, public.el_reports
from anon, authenticated;

grant select on public.el_profiles, public.el_worker_profiles, public.el_worker_skills, public.el_reviews to anon;
grant select on public.el_profiles, public.el_worker_profiles, public.el_worker_skills, public.el_reviews to authenticated;
grant update (display_name, area, updated_at) on public.el_profiles to authenticated;
grant insert, update on public.el_worker_profiles to authenticated;
grant insert, update, delete on public.el_worker_skills to authenticated;
grant select, insert, update on public.el_service_requests to authenticated;
grant select, insert, update on public.el_request_responses to authenticated;
grant select, insert on public.el_conversations to authenticated;
grant select, insert on public.el_messages to authenticated;
grant insert on public.el_reviews to authenticated;
grant select, insert, delete on public.el_user_blocks to authenticated;
grant select, insert on public.el_reports to authenticated;

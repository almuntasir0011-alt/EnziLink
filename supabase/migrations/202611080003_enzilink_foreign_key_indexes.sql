
create index if not exists el_conversations_customer_id_idx on public.el_conversations(customer_id);
create index if not exists el_conversations_worker_id_idx on public.el_conversations(worker_id);
create index if not exists el_messages_sender_id_idx on public.el_messages(sender_id);
create index if not exists el_reports_reported_user_id_idx on public.el_reports(reported_user_id);
create index if not exists el_reports_reporter_id_idx on public.el_reports(reporter_id);
create index if not exists el_reports_request_id_idx on public.el_reports(request_id);
create index if not exists el_reviews_reviewer_id_idx on public.el_reviews(reviewer_id);
create index if not exists el_reviews_worker_id_idx on public.el_reviews(worker_id);
create index if not exists el_service_requests_customer_id_idx on public.el_service_requests(customer_id);
create index if not exists el_user_blocks_blocked_id_idx on public.el_user_blocks(blocked_id);
create index if not exists el_worker_skills_worker_id_idx on public.el_worker_skills(worker_id);

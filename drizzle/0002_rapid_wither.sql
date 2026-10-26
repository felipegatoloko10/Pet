ALTER TABLE "workspaces" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Application tables are accessed exclusively through the account-checked backend.
-- Supabase Auth owns its separate auth schema. No browser key can read these tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['auth_user','auth_session','auth_account','auth_verification','auth_device_code','invitations','workspaces','operations','credentials','oauth_states','calendar_channels','push_subscriptions','approvals'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

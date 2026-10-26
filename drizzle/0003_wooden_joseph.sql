ALTER TABLE "invitations" ADD COLUMN "activation_hash" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "activation_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "activation_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "activation_purpose" text DEFAULT 'register' NOT NULL;
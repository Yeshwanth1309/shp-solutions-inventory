DROP TABLE "mfa_credentials" CASCADE;--> statement-breakpoint
DROP TABLE "mfa_recovery_codes" CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "mfa_verified_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "mfa_enabled";
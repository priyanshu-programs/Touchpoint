CREATE TABLE "integration_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_enc" text NOT NULL,
	"key_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_clients_provider_check" CHECK ("integration_clients"."provider" in ('google'))
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"account_email" text NOT NULL,
	"scopes" text[] NOT NULL,
	"status" text NOT NULL,
	"refresh_token_enc" text,
	"access_token_enc" text,
	"access_expires_at" timestamp with time zone,
	"key_version" integer NOT NULL,
	"sync_cursor" text,
	"last_sync_at" timestamp with time zone,
	"last_refresh_at" timestamp with time zone,
	"last_error" text,
	"connected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_connections_provider_check" CHECK ("integration_connections"."provider" in ('google')),
	CONSTRAINT "integration_connections_status_check" CHECK ("integration_connections"."status" in ('connected', 'expired', 'revoked', 'error'))
);
--> statement-breakpoint
ALTER TABLE "integration_clients" ADD CONSTRAINT "integration_clients_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_clients_owner_provider_idx" ON "integration_clients" USING btree ("owner_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_owner_provider_idx" ON "integration_connections" USING btree ("owner_id","provider");
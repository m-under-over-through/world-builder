CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"body" text,
	"created_day" date NOT NULL,
	"deck_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"workshop_id" uuid NOT NULL,
	"issuer_participant_id" uuid NOT NULL,
	"used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_day" date NOT NULL,
	"wave" text,
	"invites_left" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"participant_id" uuid NOT NULL,
	"session_no" integer NOT NULL,
	"started_day" date NOT NULL,
	"deck_version" text NOT NULL,
	"seed" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waves" (
	"workshop_id" uuid NOT NULL,
	"wave" text NOT NULL,
	"label" text NOT NULL,
	"opened_count" integer DEFAULT 0 NOT NULL,
	"joined_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"public_key" text NOT NULL,
	"key_fingerprint" text NOT NULL,
	"deck_version" text NOT NULL,
	"warmups_per_session" integer NOT NULL,
	"checkpoints_per_session" integer NOT NULL,
	"invites_per_participant" integer NOT NULL,
	"cap" integer NOT NULL,
	"opens_day" date NOT NULL,
	"closes_day" date NOT NULL,
	"delete_day" date NOT NULL,
	CONSTRAINT "workshops_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_issuer_participant_id_participants_id_fk" FOREIGN KEY ("issuer_participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waves" ADD CONSTRAINT "waves_workshop_id_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_session" ON "events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "invites_issuer" ON "invites" USING btree ("issuer_participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_workshop_code" ON "participants" USING btree ("workshop_id","code_hash");--> statement-breakpoint
CREATE INDEX "sessions_participant" ON "sessions" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waves_workshop_wave" ON "waves" USING btree ("workshop_id","wave");
CREATE TABLE IF NOT EXISTS "admin_users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ap_map" (
	"bssid" text PRIMARY KEY NOT NULL,
	"building" text,
	"floor" text,
	"zone" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checkouts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"device_id" bigint,
	"user_id" bigint,
	"consent_at" timestamp with time zone NOT NULL,
	"checked_out" timestamp with time zone DEFAULT now(),
	"returned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "devices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"serial" text NOT NULL,
	"asset_no" text,
	"model" text,
	"wifi_mac" text,
	"fcm_token" text,
	"device_token_hash" text,
	"knox_licensed" boolean DEFAULT false,
	"enrolled_at" timestamp with time zone DEFAULT now(),
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "devices_serial_unique" UNIQUE("serial"),
	CONSTRAINT "devices_asset_no_unique" UNIQUE("asset_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"device_id" bigint,
	"reported_at" timestamp with time zone DEFAULT now(),
	"lat" double precision,
	"lng" double precision,
	"accuracy_m" real,
	"bssid" text,
	"ssid" text,
	"public_ip" "inet",
	"battery_pct" smallint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"emp_no" text NOT NULL,
	"name" text NOT NULL,
	"dept" text,
	"email" text,
	CONSTRAINT "users_emp_no_unique" UNIQUE("emp_no")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_checkout_per_device" ON "checkouts" USING btree ("device_id") WHERE "checkouts"."returned_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_device_time" ON "reports" USING btree ("device_id","reported_at" DESC NULLS LAST);
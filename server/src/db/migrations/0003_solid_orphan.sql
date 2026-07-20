ALTER TABLE "reports" ADD COLUMN "battery_status" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "battery_plug" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "battery_temp_c" real;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "battery_health" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "battery_voltage_mv" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "wifi_rssi" smallint;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "wifi_link_mbps" smallint;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "wifi_freq_mhz" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "local_ip" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "storage_free_mb" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "storage_total_mb" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "os_version" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "uptime_sec" bigint;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "nearby_aps" jsonb;
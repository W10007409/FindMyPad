CREATE TABLE IF NOT EXISTS "assets" (
	"serial" text PRIMARY KEY NOT NULL,
	"asset_no" text,
	"sap_no" text,
	"model" text,
	"owner_name" text,
	"owner_emp_no" text,
	"org1" text,
	"org2" text,
	"location" text,
	"status" text,
	"issued_at" text,
	"note" text,
	CONSTRAINT "assets_asset_no_unique" UNIQUE("asset_no")
);

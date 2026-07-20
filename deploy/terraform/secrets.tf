############################################
# FindMyPad — Secrets Manager
############################################
# Three secrets consumed by the ECS task definition's `secrets` block
# (valueFrom = ARN), matching server/src/config.ts env var names EXACTLY:
#   JWT_SECRET, DATABASE_URL, FIREBASE_SERVICE_ACCOUNT
#
# DATABASE_URL is fully managed here (built from a generated random_password
# + the RDS endpoint, see rds.tf) so the pilot works out of the box.
# JWT_SECRET gets a generated placeholder value on first apply but is marked
# `ignore_changes` so an operator can rotate it out-of-band without Terraform
# reverting it on the next apply.
# FIREBASE_SERVICE_ACCOUNT has NO safe generated value — it MUST be filled in
# out-of-band with the real Firebase service-account JSON. See README.md.

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "${var.project}/JWT_SECRET"
  description = "JWT signing secret for the FindMyPad API"

  tags = { Name = "${var.project}-jwt-secret" }
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false # JWT secret just needs entropy, not URL-safety concerns.
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result

  lifecycle {
    ignore_changes = [secret_string] # allow out-of-band rotation
  }
}

resource "aws_secretsmanager_secret" "database_url" {
  name        = "${var.project}/DATABASE_URL"
  description = "PostgreSQL connection string for the FindMyPad API"

  tags = { Name = "${var.project}-database-url" }
}
# NOTE: the secret_version for DATABASE_URL is defined in rds.tf, once the
# RDS instance's endpoint is known (it interpolates host/port/db name +
# the generated DB password).

resource "aws_secretsmanager_secret" "firebase_service_account" {
  name        = "${var.project}/FIREBASE_SERVICE_ACCOUNT"
  description = "Firebase service-account JSON used by the API to send FCM push (ring/locate commands)"

  tags = { Name = "${var.project}-firebase-service-account" }
}

# TODO(operator): after `terraform apply`, replace this placeholder with the
# real service-account JSON, e.g.:
#   aws secretsmanager put-secret-value \
#     --secret-id "${var.project}/FIREBASE_SERVICE_ACCOUNT" \
#     --secret-string file://firebase-service-account.json
resource "aws_secretsmanager_secret_version" "firebase_service_account" {
  secret_id     = aws_secretsmanager_secret.firebase_service_account.id
  secret_string = jsonencode({ TODO = "replace with real Firebase service-account JSON out-of-band" })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

############################################
# FindMyPad — RDS PostgreSQL 16
############################################

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-db-subnets"
  subnet_ids = module.vpc.private_subnets

  tags = { Name = "${var.project}-db-subnets" }
}

resource "random_password" "db" {
  length  = 32
  special = true
  # Avoid characters that need percent-encoding / break a postgres:// URI.
  override_special = "!#$%^&*()-_=+[]{}<>?"
}

resource "aws_db_instance" "main" {
  identifier = "${var.project}-db"

  engine         = "postgres"
  engine_version = "16"

  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"

  db_name  = "findmypad"
  username = "pad"
  password = random_password.db.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  multi_az                = var.db_multi_az
  backup_retention_period = var.db_backup_retention
  deletion_protection     = var.db_deletion_protection # TODO(prod): set true.

  skip_final_snapshot       = !var.db_deletion_protection # TODO(prod): false + final_snapshot_identifier once deletion_protection is on.
  copy_tags_to_snapshot     = true
  auto_minor_version_upgrade = true

  # TODO(prod): storage_encrypted = true with a customer-managed KMS key,
  # enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"], performance
  # insights, and a maintenance window that avoids peak hours.
  storage_encrypted = true

  tags = { Name = "${var.project}-db" }
}

# DATABASE_URL secret version — built once the RDS endpoint is known.
# Matches server/src/config.ts (`DATABASE_URL: z.string().min(1)`), consumed
# by the Node `pg`/Drizzle client as a standard postgres:// connection URI.
resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = "postgres://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"

  lifecycle {
    ignore_changes = [secret_string] # allow out-of-band rotation without terraform reverting it
  }
}

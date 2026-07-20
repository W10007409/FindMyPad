############################################
# FindMyPad — ECS execution + task IAM roles
############################################
# Execution role: what ECS itself needs (pull image from ECR, read secrets
# for the `secrets` block, write logs to CloudWatch).
# Task role: what the *application code* needs at runtime. FindMyPad's API
# doesn't call any AWS APIs directly today (FCM push goes to Google, not
# AWS), so this starts empty. TODO(prod): attach least-privilege policies
# here if the app later needs S3 (e.g. MAXMIND_MMDB_PATH) or other AWS APIs.

data "aws_iam_policy_document" "ecs_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ---------------------------------------------------------------------------
# Execution role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "ecs_execution" {
  name               = "${var.project}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json

  tags = { Name = "${var.project}-ecs-execution" }
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "ecs_execution_secrets" {
  statement {
    sid       = "ReadAppSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.jwt_secret.arn,
      aws_secretsmanager_secret.database_url.arn,
      aws_secretsmanager_secret.firebase_service_account.arn,
    ]
  }
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name   = "${var.project}-ecs-execution-secrets"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_execution_secrets.json
}

# ---------------------------------------------------------------------------
# Task role (application runtime permissions)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "ecs_task" {
  name               = "${var.project}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json

  tags = { Name = "${var.project}-ecs-task" }
}

# TODO(prod): add aws_iam_role_policy resources here if/when the app needs
# to call AWS APIs directly (e.g. S3 read for a MaxMind mmdb file).

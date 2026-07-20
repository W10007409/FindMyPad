############################################
# FindMyPad — ECS Fargate cluster, task definition, service
############################################
# The service runs with RUN_MIGRATIONS=false to avoid multiple tasks racing
# to run the same migration concurrently on deploy. Migrations are run as a
# separate one-off `aws ecs run-task` invocation — see README.md for the
# exact command. This keeps the scaffold simple (no custom Lambda/CI step)
# while still being safe for desired_count > 1.

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled" # TODO(prod): "enabled" for cluster-level metrics.
  }

  tags = { Name = "${var.project}-cluster" }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.ecs_cpu)
  memory                   = tostring(var.ecs_memory)
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn             = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "TRUST_PROXY", value = "true" },
        { name = "PORT", value = "3000" },
        { name = "RUN_MIGRATIONS", value = "false" }, # one-off task runs migrations instead; see README.md
        { name = "CORP_PUBLIC_IPS", value = var.corp_public_ips },
        { name = "CORP_SSIDS", value = var.corp_ssids },
        { name = "RETENTION_DAYS", value = tostring(var.retention_days) },
        { name = "STALE_DAYS", value = tostring(var.stale_days) },
      ]

      secrets = [
        { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "FIREBASE_SERVICE_ACCOUNT", valueFrom = aws_secretsmanager_secret.firebase_service_account.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])

  tags = { Name = "${var.project}-api-task" }
}

resource "aws_ecs_service" "api" {
  name            = "${var.project}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  launch_type     = "FARGATE"
  desired_count   = var.desired_count

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name    = "api"
    container_port    = 3000
  }

  # Give tasks time to pass the ALB health check before the deployment
  # considers them for traffic; ALB's own health_check settings (alb.tf)
  # govern actual routing.
  health_check_grace_period_seconds = 60

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  # TODO(prod): consider deployment_circuit_breaker { enable = true, rollback = true }.

  depends_on = [aws_lb_listener.https]

  tags = { Name = "${var.project}-api-service" }
}

############################################
# One-off DB migration task — NOTE, not a resource
############################################
# The service above always runs with RUN_MIGRATIONS=false to avoid two tasks
# racing the same migration on deploy. Run migrations explicitly, once, using
# the SAME task definition with the env var overridden:
#
#   aws ecs run-task \
#     --cluster ${var.project}-cluster \
#     --launch-type FARGATE \
#     --task-definition <task-def-arn-or-family:revision> \
#     --network-configuration "awsvpcConfiguration={subnets=[<private-subnet-ids>],securityGroups=[<ecs-sg-id>],assignPublicIp=DISABLED}" \
#     --overrides '{"containerOverrides":[{"name":"api","environment":[{"name":"RUN_MIGRATIONS","value":"true"}]}]}'
#
# Do this once after `terraform apply` (and again after any deploy that adds
# a new migration) — see README.md for the full sequence. Deliberately not
# automated via null_resource/local-exec here to keep this scaffold simple
# and avoid surprising side effects on every `terraform apply`.

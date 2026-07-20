############################################
# FindMyPad — CloudWatch log group for ECS
############################################

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project}"
  retention_in_days = 30 # TODO(prod): tune retention / ship to a log sink.

  tags = { Name = "${var.project}-ecs-logs" }
}

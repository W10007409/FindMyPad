############################################
# FindMyPad — Application Load Balancer
############################################
# Public ALB terminating TLS with the ACM cert from dns.tf, forwarding to the
# ECS service's target group on port 3000. HTTP redirects to HTTPS.
# The ALB preserves/sets X-Forwarded-For, which the API relies on for
# CORP_PUBLIC_IPS classification (see server/src/config.ts TRUST_PROXY).

resource "aws_lb" "api" {
  name               = "${var.project}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets

  # TODO(prod): enable_deletion_protection = true, access_logs to an S3 bucket.
  enable_deletion_protection = false
  idle_timeout                = 60

  tags = { Name = "${var.project}-alb" }
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project}-api-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip" # Fargate awsvpc mode registers ENIs, not instances.

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # ECS-managed target groups need a short deregistration delay tradeoff
  # against in-flight requests. TODO(prod): tune for your traffic pattern.
  deregistration_delay = 30

  tags = { Name = "${var.project}-api-tg" }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.api.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

############################################
# FindMyPad — VPC + security groups
############################################
# 2 AZs, public + private subnets, single NAT gateway (toggle via
# var.enable_nat_gateway). Private subnets host ECS tasks + RDS; the NAT
# gateway gives ECS tasks outbound egress to call Firebase Cloud Messaging.

locals {
  # Simple /20 carve-up per AZ inside var.vpc_cidr (assumes a /16 input, as
  # per the default). TODO(prod): make subnet CIDRs explicit vars if the
  # default vpc_cidr changes shape.
  public_subnets  = [for i, az in var.azs : cidrsubnet(var.vpc_cidr, 4, i)]
  private_subnets = [for i, az in var.azs : cidrsubnet(var.vpc_cidr, 4, i + 8)]
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project}-vpc"
  cidr = var.vpc_cidr

  azs             = var.azs
  public_subnets  = local.public_subnets
  private_subnets = local.private_subnets

  enable_dns_support   = true
  enable_dns_hostnames = true

  enable_nat_gateway = var.enable_nat_gateway
  single_nat_gateway = true # cost tradeoff: one NAT for all AZs. TODO(prod): one_nat_gateway_per_az = true for HA.

  # Useful for cost visibility; safe to drop for pilot.
  enable_flow_log = false # TODO(prod): enable VPC flow logs to CloudWatch/S3.

  tags = {
    Project = var.project
  }
}

# ---------------------------------------------------------------------------
# Security groups
# ---------------------------------------------------------------------------

# ALB: public HTTP/HTTPS from the internet.
resource "aws_security_group" "alb" {
  name        = "${var.project}-alb-sg"
  description = "Public ALB - allows 80/443 from the internet"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTP (redirected to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-alb-sg" }
}

# ECS service: only reachable from the ALB, on the app port (3000).
resource "aws_security_group" "ecs" {
  name        = "${var.project}-ecs-sg"
  description = "ECS Fargate service - allows app port only from the ALB"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "App port from ALB only"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All outbound (needed for FCM via NAT, ECR pull, Secrets Manager, RDS)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-ecs-sg" }
}

# RDS: only reachable from the ECS service SG, on 5432.
resource "aws_security_group" "rds" {
  name        = "${var.project}-rds-sg"
  description = "RDS PostgreSQL - allows 5432 from the ECS service only"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "PostgreSQL from ECS service only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-rds-sg" }
}

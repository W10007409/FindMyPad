############################################
# FindMyPad — input variables
############################################

variable "project" {
  description = "Short project name, used to prefix resource names/tags."
  type        = string
  default     = "findmypad"
}

variable "region" {
  description = "Primary AWS region for the VPC/ECS/RDS/ALB stack."
  type        = string
  default     = "ap-northeast-2"
}

variable "domain" {
  description = "Root domain that owns the hosted zone (e.g. example.com). REQUIRED — no sane default."
  type        = string
}

variable "api_subdomain" {
  description = "Subdomain label for the API (results in api.<domain>)."
  type        = string
  default     = "api"
}

variable "app_subdomain" {
  description = "Subdomain label for the dashboard SPA (results in app.<domain>)."
  type        = string
  default     = "app"
}

variable "hosted_zone_name" {
  description = "Name of the existing Route53 public hosted zone (e.g. example.com.). Must already exist — this stack does NOT create the zone."
  type        = string
}

# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "azs" {
  description = "Availability zones to spread public/private subnets across (2 AZs recommended for pilot)."
  type        = list(string)
  default     = ["ap-northeast-2a", "ap-northeast-2c"]
}

variable "enable_nat_gateway" {
  description = "Whether to create a NAT gateway for private-subnet egress (required for ECS -> Firebase FCM outbound). Single NAT gateway is used when true (cost tradeoff vs one-per-AZ)."
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------------
# RDS
# ---------------------------------------------------------------------------

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.small"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB (gp3)."
  type        = number
  default     = 20
}

variable "db_multi_az" {
  description = "Whether RDS is Multi-AZ. Default false for pilot cost; TODO(prod): set true."
  type        = bool
  default     = false
}

variable "db_backup_retention" {
  description = "RDS automated backup retention in days."
  type        = number
  default     = 7
}

variable "db_deletion_protection" {
  description = "RDS deletion protection. Default false for easy teardown during pilot; TODO(prod): set true."
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# ECS / Fargate
# ---------------------------------------------------------------------------

variable "ecs_cpu" {
  description = "Fargate task CPU units (256/512/1024/...)."
  type        = number
  default     = 512
}

variable "ecs_memory" {
  description = "Fargate task memory in MB."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired number of running ECS service tasks."
  type        = number
  default     = 2
}

variable "image_tag" {
  description = "Docker image tag in ECR to deploy (e.g. a git SHA or 'latest')."
  type        = string
  default     = "latest"
}

# ---------------------------------------------------------------------------
# Application env vars (server/src/config.ts)
# ---------------------------------------------------------------------------

variable "corp_public_ips" {
  description = "Comma-separated list of corp-network public egress IPs/CIDRs, used by the API to classify a pad report as on-corp-network. Maps to CORP_PUBLIC_IPS."
  type        = string
  default     = ""
}

variable "corp_ssids" {
  description = "Comma-separated list of corp Wi-Fi SSIDs. Maps to CORP_SSIDS."
  type        = string
  default     = ""
}

variable "retention_days" {
  description = "Days of pad-report history to retain before pruning. Maps to RETENTION_DAYS."
  type        = number
  default     = 90
}

variable "stale_days" {
  description = "Days without a report before a pad is flagged stale/unresponsive. Maps to STALE_DAYS."
  type        = number
  default     = 7
}

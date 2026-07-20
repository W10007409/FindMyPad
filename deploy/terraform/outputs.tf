############################################
# FindMyPad — outputs
############################################

output "api_url" {
  description = "Public HTTPS URL of the API."
  value       = "https://${local.api_fqdn}"
}

output "app_url" {
  description = "Public HTTPS URL of the dashboard SPA."
  value       = "https://${local.app_fqdn}"
}

output "alb_dns_name" {
  description = "ALB's default DNS name (useful for debugging before DNS propagates)."
  value       = aws_lb.api.dns_name
}

output "ecr_repository_url" {
  description = "ECR repository URL to push the API image to."
  value       = aws_ecr_repository.api.repository_url
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port). Sensitive because it's an internal address alongside connection details elsewhere."
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "dashboard_bucket" {
  description = "S3 bucket name for the dashboard SPA build output (sync target)."
  value       = aws_s3_bucket.dashboard.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidations after deploys)."
  value       = aws_cloudfront_distribution.dashboard.id
}

output "cloudfront_domain" {
  description = "CloudFront distribution's default domain name."
  value       = aws_cloudfront_distribution.dashboard.domain_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name (for `aws ecs run-task` migration one-offs)."
  value       = aws_ecs_cluster.main.name
}

output "ecs_task_definition_arn" {
  description = "Latest ECS task definition ARN (for `aws ecs run-task` migration one-offs)."
  value       = aws_ecs_task_definition.api.arn
}

output "ecs_private_subnet_ids" {
  description = "Private subnet IDs (for `aws ecs run-task` --network-configuration)."
  value       = module.vpc.private_subnets
}

output "ecs_security_group_id" {
  description = "ECS service security group ID (for `aws ecs run-task` --network-configuration)."
  value       = aws_security_group.ecs.id
}

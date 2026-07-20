# FindMyPad — Terraform (구성안 B: 권장 매니지드 스택)

> **SCAFFOLD — review/harden before production.** This is a reviewable
> starting point, not a hardened prod config. Before real production traffic,
> at minimum revisit: WAF in front of the ALB/CloudFront, RDS
> `deletion_protection`/Multi-AZ, RDS/secret backup + rotation policy,
> least-privilege IAM (the task role is currently empty; the execution role
> is scoped to this project's 3 secrets + the AWS-managed ECS execution
> policy), VPC flow logs, ALB/CloudFront access logging, remote Terraform
> state (S3 + lock table — see the commented `backend` block in
> `versions.tf`), and confirming private subnets have no unintended public
> routes. Every `TODO(prod)` comment scattered across these files is a
> checklist item.

Provisions the "recommended managed" AWS architecture described in
`../aws-architecture.md` (구성안 B): VPC, ECR, Secrets Manager, RDS
PostgreSQL 16, ECS Fargate + ALB (public HTTPS API), Route53 + ACM, and an
S3 + CloudFront static dashboard.

Matches `server/src/config.ts` exactly: the ECS task's `secrets` block
injects `JWT_SECRET`, `DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT`; its `environment`
block sets `TRUST_PROXY`, `PORT`, `RUN_MIGRATIONS`, `CORP_PUBLIC_IPS`,
`CORP_SSIDS`, `RETENTION_DAYS`, `STALE_DAYS`.

## Files

| File | Contents |
|---|---|
| `versions.tf` | Terraform/provider version pins, default + `us_east_1` aliased AWS providers |
| `variables.tf` | All input variables |
| `network.tf` | VPC module (2 AZ, public+private, single NAT) + ALB/ECS/RDS security groups |
| `ecr.tf` | ECR repo for the API image + lifecycle policy |
| `secrets.tf` | Secrets Manager secrets (`JWT_SECRET`, `DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT`) |
| `rds.tf` | RDS PostgreSQL 16 + DB subnet group + generated password + `DATABASE_URL` secret version |
| `iam.tf` | ECS execution role (pull image, read secrets, write logs) + task role |
| `logs.tf` | CloudWatch log group `/ecs/${project}` |
| `ecs.tf` | ECS cluster, task definition, service; migration one-off task instructions |
| `alb.tf` | Public ALB, HTTPS/HTTP listeners, target group (`/health`) |
| `dns.tf` | Route53 zone lookup, ACM cert for `api.<domain>`, DNS validation, A/ALIAS record |
| `dashboard.tf` | S3 bucket (private, OAC) + CloudFront + ACM (us-east-1) for `app.<domain>` + Route53 record |
| `outputs.tf` | `api_url`, `app_url`, `alb_dns_name`, `ecr_repository_url`, `rds_endpoint` (sensitive), `dashboard_bucket`, `cloudfront_domain`, etc. |
| `terraform.tfvars.example` | Sample variable values — copy to `terraform.tfvars` and edit |

## Prerequisites

- An existing Route53 **public hosted zone** for your domain (`hosted_zone_name`). This stack looks it up via `data "aws_route53_zone"` — it does **not** create or delegate the zone.
- AWS credentials with permission to create VPC/ECS/RDS/ALB/ACM/Route53/S3/CloudFront/Secrets Manager/IAM/ECR resources.
- A Firebase project + service-account JSON (for FCM push — ring/locate commands). This is an external dependency; Terraform cannot generate it.
- Docker + AWS CLI locally (or CI) to build/push the API image.

## Apply order

```bash
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: domain, hosted_zone_name, and anything else you want to change

terraform init
terraform plan   # review
terraform apply
```

1. **Build + push the API image to ECR** (can happen before or after `terraform apply` — ECR just needs to exist first; the ECS service will fail to start tasks until an image with `var.image_tag` exists).
   ```bash
   aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
   docker build -f ../Dockerfile -t <ecr_repository_url_output>:latest ../..
   docker push <ecr_repository_url_output>:latest
   ```
2. **`terraform apply`** — provisions everything (see above). Note the outputs (`api_url`, `ecr_repository_url`, `ecs_cluster_name`, `ecs_task_definition_arn`, `ecs_private_subnet_ids`, `ecs_security_group_id`, `dashboard_bucket`, `cloudfront_domain`).
3. **Set secret values that Terraform can't generate:**
   - `FIREBASE_SERVICE_ACCOUNT` — real Firebase service-account JSON:
     ```bash
     aws secretsmanager put-secret-value \
       --secret-id findmypad/FIREBASE_SERVICE_ACCOUNT \
       --secret-string file://firebase-service-account.json
     ```
   - `JWT_SECRET` and `DATABASE_URL` are already populated by Terraform (generated `random_password`s). Rotate them out-of-band with `aws secretsmanager put-secret-value` any time — the Terraform resources use `ignore_changes = [secret_string]` so `apply` won't stomp a manual rotation.
   - After changing any secret, force a new ECS deployment so tasks pick up the new value: `aws ecs update-service --cluster <ecs_cluster_name> --service findmypad-api --force-new-deployment`.
4. **Run the DB migration one-off task.** The ECS *service* always runs with `RUN_MIGRATIONS=false` to avoid multiple tasks racing the same migration on deploy (with `desired_count > 1`, two tasks starting the migration concurrently is a real race). Run it explicitly once (and again after any deploy that adds a new migration), using the same task definition with an override:
   ```bash
   aws ecs run-task \
     --cluster <ecs_cluster_name output> \
     --launch-type FARGATE \
     --task-definition <ecs_task_definition_arn output> \
     --network-configuration "awsvpcConfiguration={subnets=[<ecs_private_subnet_ids output, comma-separated>],securityGroups=[<ecs_security_group_id output>],assignPublicIp=DISABLED}" \
     --overrides '{"containerOverrides":[{"name":"api","environment":[{"name":"RUN_MIGRATIONS","value":"true"}]}]}'
   ```
   Wait for the task to reach `STOPPED` with exit code 0 before relying on the API (or before the service's tasks start serving traffic against a not-yet-migrated schema).
5. **Upload the dashboard to S3:**
   ```bash
   cd ../../dashboard
   npm ci && npm run build
   aws s3 sync dist/ s3://<dashboard_bucket output>/ --delete
   aws cloudfront create-invalidation --distribution-id <cloudfront_distribution_id output> --paths "/*"
   ```
6. **Point the Android app's `baseUrl` to `https://api.<domain>/`** — update `defaultBaseUrl` in `AppContainer.kt` (currently hardcoded to `127.0.0.1:3000`; see `../aws-architecture.md`) and confirm the network-security-config allows HTTPS-only (the `knox` flavor disallows cleartext). Rebuild/redistribute the app.

## Notes

- **Migration one-off task**: deliberately not automated via `null_resource`/`local-exec` in Terraform — that would either run migrations on every `apply` (dangerous) or require fragile triggers. A manual/CI-scripted `aws ecs run-task` (step 4 above) is simpler and safer for a scaffold. Wire it into your CI pipeline once you have one.
- **Image tag**: `var.image_tag` defaults to `latest`. For real deploys, prefer pinning to an immutable tag (git SHA) per `terraform apply` / CI run, and force a new deployment (`aws ecs update-service --force-new-deployment`) rather than relying on ECS to notice a mutated `latest` tag.
- **DNS validation**: `terraform apply` will create ACM certs and wait (via `aws_acm_certificate_validation`) for the Route53 validation records to be issued. This can take a few minutes on first apply.
- **Costs**: NAT gateway, ALB, CloudFront, and RDS are the main recurring costs. `enable_nat_gateway` and `db_multi_az` are the two easiest levers to cut pilot cost.

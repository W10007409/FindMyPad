############################################
# FindMyPad — Dashboard static hosting (S3 + CloudFront)
############################################
# TODO(operator): this file only provisions the hosting infrastructure. The
# built SPA is NOT uploaded by Terraform — after `terraform apply`, build the
# dashboard and sync it separately:
#
#   cd dashboard && npm ci && npm run build
#   aws s3 sync dist/ s3://<dashboard bucket name from outputs>/ --delete
#   aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
#
# See README.md for the full deploy sequence.

resource "aws_s3_bucket" "dashboard" {
  bucket = "${var.project}-dashboard-${data.aws_caller_identity.current.account_id}"

  tags = { Name = "${var.project}-dashboard" }
}

resource "aws_s3_bucket_public_access_block" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id

  versioning_configuration {
    status = "Enabled" # cheap safety net against accidental `sync --delete` mistakes
  }
}

data "aws_caller_identity" "current" {}

# CloudFront Origin Access Control — lets CloudFront read the private bucket
# directly (no bucket ACLs, no public bucket policy).
resource "aws_cloudfront_origin_access_control" "dashboard" {
  name                              = "${var.project}-dashboard-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  policy = data.aws_iam_policy_document.dashboard_bucket.json
}

data "aws_iam_policy_document" "dashboard_bucket" {
  statement {
    sid     = "AllowCloudFrontOAC"
    actions = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.dashboard.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.dashboard.arn]
    }
  }
}

locals {
  app_fqdn = "${var.app_subdomain}.${var.domain}"
}

# ACM cert for CloudFront MUST live in us-east-1, regardless of var.region.
resource "aws_acm_certificate" "app" {
  provider = aws.us_east_1

  domain_name       = local.app_fqdn
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "${var.project}-app-cert" }
}

resource "aws_route53_record" "app_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.app.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "app" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for r in aws_route53_record.app_cert_validation : r.fqdn]
}

resource "aws_cloudfront_distribution" "dashboard" {
  enabled             = true
  default_root_object = "index.html"
  aliases             = [local.app_fqdn]
  price_class         = "PriceClass_200" # TODO(prod): tune (100/200/All) for your user geography.

  origin {
    domain_name              = aws_s3_bucket.dashboard.bucket_regional_domain_name
    origin_id                = "s3-dashboard"
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods          = ["GET", "HEAD"]
    target_origin_id        = "s3-dashboard"
    viewer_protocol_policy  = "redirect-to-https"
    compress                = true
    cache_policy_id         = "658327ea-f89d-4fab-a63d-7e88639e58f6" # AWS managed "CachingOptimized"
  }

  # SPA client-side routing: any path S3 can't find (404) or that's blocked
  # by the bucket policy for anonymous listing (403) should fall back to
  # index.html so the React router can take over.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.app.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${var.project}-dashboard-cdn" }
}

# app.<domain> -> CloudFront
resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = local.app_fqdn
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.dashboard.domain_name
    zone_id                = aws_cloudfront_distribution.dashboard.hosted_zone_id
    evaluate_target_health = false
  }
}

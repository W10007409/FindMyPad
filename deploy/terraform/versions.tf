############################################
# FindMyPad — Terraform / provider pinning
############################################
# SCAFFOLD: pinned to the latest-known-good minor ranges as of authoring time.
# TODO(prod): consider a remote backend (S3 + DynamoDB lock table) instead of
# local state before this is used for anything beyond a pilot.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # TODO(prod): uncomment and configure a remote backend.
  # backend "s3" {
  #   bucket         = "findmypad-tfstate"
  #   key            = "terraform/findmypad/terraform.tfstate"
  #   region         = "ap-northeast-2"
  #   dynamodb_table = "findmypad-tflock"
  #   encrypt        = true
  # }
}

# Default provider — region where the API/DB/ECS stack lives.
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}

# CloudFront requires ACM certificates for a distribution's custom domain to
# live in us-east-1, regardless of where the rest of the stack runs.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}

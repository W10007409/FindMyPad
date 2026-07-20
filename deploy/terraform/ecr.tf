############################################
# FindMyPad — ECR repository for the API image
############################################

resource "aws_ecr_repository" "api" {
  name                 = "${var.project}-api"
  image_tag_mutability = "MUTABLE" # TODO(prod): consider IMMUTABLE + a promotion pipeline.

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "${var.project}-api" }
}

# Keep only the last N images to control storage cost.
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 15 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 15
        }
        action = { type = "expire" }
      }
    ]
  })
}

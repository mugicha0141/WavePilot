provider "aws" {
  region     = "ap-northeast-1"
  access_key = var.environment == "local" ? "test" : null
  secret_key = var.environment == "local" ? "test" : null

  skip_credentials_validation = var.environment == "local"
  skip_metadata_api_check     = var.environment == "local"
  skip_requesting_account_id  = var.environment == "local"
  s3_use_path_style           = var.environment == "local"

  dynamic "endpoints" {
    for_each = var.environment == "local" ? [1] : []
    content {
      s3         = var.aws_endpoint
      dynamodb   = var.aws_endpoint
      lambda     = var.aws_endpoint
      iam        = var.aws_endpoint
      sts        = var.aws_endpoint
      apigateway   = var.aws_endpoint
      apigatewayv2 = var.aws_endpoint
      ssm          = var.aws_endpoint
    }
  }
}

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

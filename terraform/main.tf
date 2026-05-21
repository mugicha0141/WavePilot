# ── IAMロール（LocalStack・AWS共通） ─────────────────────────────
resource "aws_iam_role" "lambda_role" {
  name = "wave-app-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "lambda_dynamodb" {
  name = "wave-app-lambda-dynamodb"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
        "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"
      ]
      Resource = [
        "arn:aws:dynamodb:ap-northeast-1:*:table/user_login",
        "arn:aws:dynamodb:ap-northeast-1:*:table/user_login/index/*",
        "arn:aws:dynamodb:ap-northeast-1:*:table/favorite_places",
        "arn:aws:dynamodb:ap-northeast-1:*:table/favorite_places/index/*",
        "arn:aws:dynamodb:ap-northeast-1:*:table/WaveData",
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_dynamodb" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_dynamodb.arn
}

# ── S3（静的ホスティング） ────────────────────────────────────────
resource "aws_s3_bucket" "wave_app_static" {
  bucket        = var.s3_bucket_name
  force_destroy = true

  tags = {
    Name        = "Wave App Static Assets"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "wave_app_static" {
  bucket                  = aws_s3_bucket.wave_app_static.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "wave_app_static" {
  bucket = aws_s3_bucket.wave_app_static.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGetObject"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.wave_app_static.arn}/*"
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.wave_app_static]
}

resource "aws_s3_bucket_website_configuration" "wave_app_static" {
  bucket = aws_s3_bucket.wave_app_static.id
  index_document { suffix = "index.html" }
  error_document { key    = "index.html" }
}

# ── DynamoDB ─────────────────────────────────────────────────────
resource "aws_dynamodb_table" "wave_data" {
  name         = "WaveData"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "SpotID"

  attribute {
    name = "SpotID"
    type = "S"
  }
}

resource "aws_dynamodb_table" "user_login" {
  name         = "user_login"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "N"
  }

  attribute {
    name = "user_name"
    type = "S"
  }

  global_secondary_index {
    name            = "UserNameIndex"
    hash_key        = "user_name"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "favorite_places" {
  name         = "favorite_places"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  global_secondary_index {
    name            = "user_id-index"
    hash_key        = "user_id"
    projection_type = "ALL"
  }
}

# ── Cognito（本番のみ） ───────────────────────────────────────────
resource "aws_cognito_user_pool" "main" {
  count = var.environment == "prod" ? 1 : 0
  name  = "wavepilot-user-pool"

  password_policy {
    minimum_length    = 8
    require_uppercase = false
    require_lowercase = false
    require_numbers   = false
    require_symbols   = false
  }
}

resource "aws_cognito_user_pool_client" "main" {
  count           = var.environment == "prod" ? 1 : 0
  name            = "wavepilot-client"
  user_pool_id    = aws_cognito_user_pool.main[0].id
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    refresh_token = "days"
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  count            = var.environment == "prod" ? 1 : 0
  api_id           = aws_apigatewayv2_api.wave_app.id
  authorizer_type  = "JWT"
  name             = "cognito-authorizer"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.main[0].id]
    issuer   = "https://cognito-idp.ap-northeast-1.amazonaws.com/${aws_cognito_user_pool.main[0].id}"
  }
}

# ── SSM ──────────────────────────────────────────────────────────
data "aws_ssm_parameter" "stormglass_key" {
  name = "/wave-app/stormglass-api-key"
}

data "aws_ssm_parameter" "jwt_secret" {
  count = var.environment == "prod" ? 0 : 1
  name  = "/wave-app/jwt-secret"
}

# ── Lambda ───────────────────────────────────────────────────────
resource "aws_lambda_function" "wave_app_backend" {
  function_name    = "wave-app-backend"
  role             = aws_iam_role.lambda_role.arn
  handler          = "server.handler"
  runtime          = var.environment == "prod" ? "nodejs22.x" : "nodejs18.x"
  filename         = "index.zip"
  source_code_hash = filebase64sha256("index.zip")

  environment {
    variables = var.environment == "prod" ? {
      STORMGLASS_API_KEY = data.aws_ssm_parameter.stormglass_key.value
    } : {
      STORMGLASS_API_KEY = data.aws_ssm_parameter.stormglass_key.value
      JWT_SECRET         = data.aws_ssm_parameter.jwt_secret[0].value
    }
  }
}

# ── API Gateway HTTP API ──────────────────────────────────────────
resource "aws_apigatewayv2_api" "wave_app" {
  name          = "wave-app-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = false
    allow_headers     = ["*"]
    allow_methods     = ["*"]
    allow_origins     = ["*"]
    expose_headers    = ["date", "keep-alive"]
    max_age           = 86400
  }
}

resource "aws_apigatewayv2_stage" "wave_app" {
  api_id      = aws_apigatewayv2_api.wave_app.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "wave_app" {
  api_id                 = aws_apigatewayv2_api.wave_app.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.wave_app_backend.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "wave_app" {
  api_id             = aws_apigatewayv2_api.wave_app.id
  route_key          = "$default"
  target             = "integrations/${aws_apigatewayv2_integration.wave_app.id}"
  authorization_type = var.environment == "prod" ? "JWT" : "NONE"
  authorizer_id      = one(aws_apigatewayv2_authorizer.cognito[*].id)
}

# OPTIONSプリフライトリクエストは認証不要（CORSのため）
resource "aws_apigatewayv2_route" "wave_app_options" {
  api_id    = aws_apigatewayv2_api.wave_app.id
  route_key = "OPTIONS /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.wave_app.id}"
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.wave_app_backend.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.wave_app.execution_arn}/*/*"
}

# ── CloudFront（本番のみ） ────────────────────────────────────────
resource "aws_cloudfront_distribution" "wave_app" {
  count               = var.environment == "prod" ? 1 : 0
  enabled             = true
  default_root_object = "index.html"

  origin {
    domain_name = aws_s3_bucket_website_configuration.wave_app_static.website_endpoint
    origin_id   = "S3-wave-app-static"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-wave-app-static"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # SPAのルーティング対応（リロード時に404/403をindex.htmlに返す）
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
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Environment = var.environment
  }
}

# ── Outputs ──────────────────────────────────────────────────────
output "lambda_url" {
  value = aws_apigatewayv2_stage.wave_app.invoke_url
}

output "s3_bucket_name" {
  value = aws_s3_bucket.wave_app_static.bucket
}

output "s3_website_url" {
  value = var.environment == "local" ? "http://${aws_s3_bucket.wave_app_static.bucket}.s3-website.localhost.localstack.cloud:4566" : "https://${aws_cloudfront_distribution.wave_app[0].domain_name}"
}

output "cognito_user_pool_id" {
  value = one(aws_cognito_user_pool.main[*].id)
}

output "cognito_client_id" {
  value = one(aws_cognito_user_pool_client.main[*].id)
}

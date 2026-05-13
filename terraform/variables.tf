variable "environment" {
  description = "デプロイ環境 (local / prod)"
  type        = string
  default     = "local"
}

variable "aws_endpoint" {
  description = "LocalStackエンドポイント（prod環境では空文字）"
  type        = string
  default     = ""
}

variable "s3_bucket_name" {
  description = "S3バケット名（AWSではグローバルで一意である必要あり）"
  type        = string
}


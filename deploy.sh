#!/bin/bash
set -e

# ── 色定義 ──────────────────────────────────────────
BOLD="\033[1m"; RESET="\033[0m"
GREEN="\033[32m"; YELLOW="\033[33m"; CYAN="\033[36m"; RED="\033[31m"

step()  { echo -e "\n${BOLD}${CYAN}▶ $1${RESET}"; }
ok()    { echo -e "${GREEN}✔ $1${RESET}"; }
info()  { echo -e "${YELLOW}  $1${RESET}"; }
error() { echo -e "${RED}✖ $1${RESET}" >&2; exit 1; }

# ── ヘルプ ───────────────────────────────────────────
usage() {
  echo -e "${BOLD}使い方:${RESET}"
  echo "  ./deploy.sh [--env local|prod] [モード]"
  echo ""
  echo -e "${BOLD}環境オプション:${RESET}"
  echo "  --env local  LocalStack へデプロイ（デフォルト）"
  echo "  --env prod   AWS 本番環境へデプロイ"
  echo ""
  echo -e "${BOLD}モードオプション:${RESET}"
  echo "  (なし)       フルデプロイ（インフラ＋バックエンド＋フロントエンド）"
  echo "  --backend    バックエンドのみ（Lambdaコードを更新）"
  echo "  --frontend   フロントエンドのみ（ビルド＋S3同期）"
  echo "  --infra      インフラのみ（terraform apply）"
  echo "  --help       このヘルプを表示"
  echo ""
  echo -e "${BOLD}例:${RESET}"
  echo "  ./deploy.sh                        # LocalStack フルデプロイ"
  echo "  ./deploy.sh --env prod             # AWS フルデプロイ"
  echo "  ./deploy.sh --backend              # LocalStack Lambda更新"
  echo "  ./deploy.sh --env prod --frontend  # AWS フロントエンドのみ"
  exit 0
}

# ── 引数パース ────────────────────────────────────────
ENV="local"
MODE="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV="$2"
      [[ "$ENV" == "local" || "$ENV" == "prod" ]] || error "--env は local または prod を指定してください"
      shift 2 ;;
    --backend)  MODE="backend";  shift ;;
    --frontend) MODE="frontend"; shift ;;
    --infra)    MODE="infra";    shift ;;
    --help)     usage ;;
    *) error "不明なオプション: $1\n./deploy.sh --help で使い方を確認できます" ;;
  esac
done

# ── 環境依存コマンド ──────────────────────────────────
# terraform コマンド
tf() {
  if [ "$ENV" = "local" ]; then
    docker-compose run --rm -T terraform "$@"
  else
    terraform -chdir=terraform "$@"
  fi
}

# AWS CLI コマンド
awscli() {
  if [ "$ENV" = "local" ]; then
    docker-compose exec -T localstack awslocal "$@"
  else
    aws "$@"
  fi
}

# S3 sync（ローカルパスが環境で異なる）
s3_sync() {
  local bucket="$1"
  if [ "$ENV" = "local" ]; then
    docker-compose exec -T localstack awslocal s3 sync \
      /workspace/client/build "s3://${bucket}" --region ap-northeast-1 --delete
  else
    aws s3 sync ./client/build "s3://${bucket}" --region ap-northeast-1 --delete
  fi
}

# ── 各ステップ ───────────────────────────────────────
setup_ssm() {
  step "SSM Parameter の設定"
  if [ "$ENV" = "local" ]; then
    if [ ! -f "server/.env" ]; then
      error "server/.env が見つかりません。先に作成してください。"
    fi
    API_KEY=$(grep "^STORMGLASS_API_KEY=" server/.env | cut -d= -f2-)
  else
    if [ ! -f ".env.prod" ]; then
      error ".env.prod が見つかりません。プロジェクトルートに作成してください。\n例: STORMGLASS_API_KEY=your-api-key"
    fi
    API_KEY=$(grep "^STORMGLASS_API_KEY=" .env.prod | cut -d= -f2-)
  fi

  if [ -z "$API_KEY" ]; then
    error "STORMGLASS_API_KEY が見つかりません。"
  fi

  awscli ssm put-parameter \
    --name "/wave-app/stormglass-api-key" \
    --value "$API_KEY" \
    --type SecureString \
    --overwrite \
    --region ap-northeast-1 > /dev/null

  # JWT_SECRET はローカル開発専用（本番は Cognito で認証するため不要）
  if [ "$ENV" = "local" ]; then
    JWT_SECRET_VAL=$(grep "^JWT_SECRET=" server/.env | cut -d= -f2-)
    if [ -z "$JWT_SECRET_VAL" ]; then
      error "JWT_SECRET が server/.env に見つかりません。"
    fi
    awscli ssm put-parameter \
      --name "/wave-app/jwt-secret" \
      --value "$JWT_SECRET_VAL" \
      --type SecureString \
      --overwrite \
      --region ap-northeast-1 > /dev/null
  fi

  ok "SSM Parameter を設定しました"
}

check_localstack() {
  if [ "$ENV" = "local" ]; then
    step "LocalStack の起動確認"
    if ! docker-compose ps localstack 2>/dev/null | grep -q "Up\|running"; then
      error "LocalStack が起動していません。先に 'docker-compose up -d localstack' を実行してください。"
    fi
    ok "LocalStack は起動中"
  fi
}

build_backend() {
  step "バックエンド ZIP のビルド"
  cd server
  zip -r ../terraform/index.zip . --exclude "*.DS_Store" --exclude "*.map" > /dev/null
  zip -d ../terraform/index.zip .env 2>/dev/null || true
  cd ..
  ok "terraform/index.zip を作成しました"
}

run_terraform() {
  step "Terraform apply（インフラ構築）"
  tf init -reconfigure -input=false 2>&1 | tail -3
  tf apply -var-file="envs/${ENV}.tfvars" -auto-approve -input=false
  ok "インフラの構築が完了しました"
}

update_lambda() {
  step "Lambda コードの更新"
  if [ "$ENV" = "local" ]; then
    awscli lambda update-function-code \
      --function-name wave-app-backend \
      --zip-file fileb:///workspace/terraform/index.zip \
      --region ap-northeast-1 > /dev/null
  else
    aws lambda update-function-code \
      --function-name wave-app-backend \
      --zip-file fileb://terraform/index.zip \
      --region ap-northeast-1 > /dev/null
  fi
  ok "Lambda を更新しました"
}

get_lambda_url() {
  LAMBDA_URL=$(tf output -raw lambda_url 2>/dev/null | tr -d '\r\n')
  if [ -z "$LAMBDA_URL" ]; then
    if [ "$ENV" = "local" ]; then
      LAMBDA_URL="http://localhost:8080"
      info "API Gateway はローカル環境でスキップのため、ローカルサーバー URL を使用: $LAMBDA_URL"
    else
      error "Lambda URL を取得できませんでした。先に --infra を実行してください。"
    fi
  else
    info "Lambda URL: $LAMBDA_URL"
  fi
}

build_frontend() {
  step "フロントエンドのビルド"
  get_lambda_url

  if [ "$ENV" = "prod" ]; then
    USER_POOL_ID=$(tf output -raw cognito_user_pool_id 2>/dev/null | tr -d '\r\n')
    CLIENT_ID=$(tf output -raw cognito_client_id 2>/dev/null | tr -d '\r\n')
    GENERATE_SOURCEMAP=false \
      REACT_APP_API_URL="$LAMBDA_URL" \
      REACT_APP_AUTH_MODE=cognito \
      REACT_APP_USER_POOL_ID="$USER_POOL_ID" \
      REACT_APP_CLIENT_ID="$CLIENT_ID" \
      npm run build --prefix client
  else
    GENERATE_SOURCEMAP=false REACT_APP_API_URL="$LAMBDA_URL" npm run build --prefix client
  fi

  ok "ビルドが完了しました"
}

deploy_frontend() {
  step "S3 へのデプロイ"
  BUCKET=$(tf output -raw s3_bucket_name 2>/dev/null | tr -d '\r\n')
  s3_sync "$BUCKET"
  ok "S3 へのアップロードが完了しました"

  if [ "$ENV" = "prod" ]; then
    step "CloudFront キャッシュの無効化"
    DIST_ID=$(aws cloudfront list-distributions \
      --query "DistributionList.Items[?Origins.Items[?DomainName=='${BUCKET}.s3.amazonaws.com' || DomainName=='${BUCKET}.s3-website.ap-northeast-1.amazonaws.com']].Id" \
      --output text 2>/dev/null | head -1 | tr -d '\r\n')
    if [ -n "$DIST_ID" ]; then
      aws cloudfront create-invalidation \
        --distribution-id "$DIST_ID" \
        --paths "/*" \
        --region us-east-1 > /dev/null
      ok "CloudFront キャッシュを無効化しました（Distribution: ${DIST_ID}）"
    else
      info "CloudFront Distribution ID が取得できませんでした（手動で無効化してください）"
    fi
  fi
}

seed_db() {
  step "DynamoDB 初期データの投入"
  COUNT=$(awscli dynamodb scan \
    --table-name user_login --region ap-northeast-1 \
    --select COUNT --query 'Count' --output text 2>/dev/null || echo "0")

  if [ "$COUNT" -gt "0" ]; then
    info "user_login にすでにデータがあるためスキップします（${COUNT}件）"
    return
  fi

  awscli dynamodb put-item \
    --table-name user_login \
    --region ap-northeast-1 \
    --item '{
      "id":            {"N": "1"},
      "user_name":     {"S": "test"},
      "user_password": {"S": "password123"}
    }'
  ok "テストユーザーを登録しました（user_name: test / user_password: password123）"
}

seed_cognito() {
  step "Cognito ユーザーの作成"
  POOL_ID=$(tf output -raw cognito_user_pool_id 2>/dev/null | tr -d '\r\n')

  EXISTING=$(aws cognito-idp admin-get-user \
    --user-pool-id "$POOL_ID" \
    --username test \
    --region ap-northeast-1 2>/dev/null | grep -c '"Username"' || true)

  if [ "$EXISTING" -gt "0" ]; then
    info "Cognito にすでにユーザーが存在するためスキップします"
    return
  fi

  aws cognito-idp admin-create-user \
    --user-pool-id "$POOL_ID" \
    --username test \
    --temporary-password "Temp1234!" \
    --message-action SUPPRESS \
    --region ap-northeast-1 > /dev/null

  aws cognito-idp admin-set-user-password \
    --user-pool-id "$POOL_ID" \
    --username test \
    --password "password123" \
    --permanent \
    --region ap-northeast-1

  ok "Cognito ユーザーを作成しました（username: test / password: password123）"
}

start_local_server() {
  if [ "$ENV" != "local" ]; then return; fi
  step "Express サーバーの起動"
  if lsof -ti:8080 > /dev/null 2>&1; then
    info "ポート 8080 はすでに使用中です（サーバー起動済み）"
    return
  fi
  cd server
  nohup node server.js > /tmp/wave-server.log 2>&1 &
  echo $! > /tmp/wave-server.pid
  cd ..
  sleep 1
  if lsof -ti:8080 > /dev/null 2>&1; then
    ok "Express サーバーを起動しました（PID: $(cat /tmp/wave-server.pid)）"
    info "ログ: tail -f /tmp/wave-server.log"
    info "停止: kill \$(cat /tmp/wave-server.pid)"
  else
    error "Express サーバーの起動に失敗しました。ログを確認してください: /tmp/wave-server.log"
  fi
}

print_url() {
  S3_URL=$(tf output -raw s3_website_url 2>/dev/null | tr -d '\r\n')
  echo -e "\n${BOLD}${GREEN}🎉 デプロイ完了！${RESET}"
  echo -e "   環境: ${BOLD}${ENV}${RESET}"
  echo -e "   アクセス URL: ${BOLD}${S3_URL}${RESET}\n"
}

# ── エントリーポイント ────────────────────────────────
START=$(date +%s)
echo -e "${BOLD}環境: ${ENV}  モード: ${MODE}${RESET}"

case "$MODE" in
  backend)
    check_localstack
    build_backend
    update_lambda
    ;;
  frontend)
    check_localstack
    build_frontend
    deploy_frontend
    print_url
    ;;
  infra)
    check_localstack
    setup_ssm
    run_terraform
    ;;
  all)
    check_localstack
    build_backend
    setup_ssm
    run_terraform
    seed_db
    if [ "$ENV" = "prod" ]; then
      seed_cognito
    fi
    build_frontend
    deploy_frontend
    start_local_server
    print_url
    ;;
esac

END=$(date +%s)
echo -e "  所要時間: $((END - START)) 秒"

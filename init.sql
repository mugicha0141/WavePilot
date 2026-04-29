CREATE TABLE IF NOT EXISTS user_login (
  id SERIAL PRIMARY KEY,
  user_name TEXT NOT NULL,
  user_password TEXT NOT NULL
);

-- テスト用のデータを1件入れておく
INSERT INTO user_login (user_name, user_password) 
VALUES ('test', 'password123')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS favorite_places (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,          -- 誰のお気に入りか（外部キー）
  point_name TEXT NOT NULL,          -- ポイントの名称（鵠沼、辻堂など）
  latitude DOUBLE PRECISION NOT NULL, -- 緯度
  longitude DOUBLE PRECISION NOT NULL, -- 経度
  wave_cache JSONB, -- 生データ
  updated_at TIMESTAMP --キャッシュ日付
  
  -- user_loginテーブルのidと紐付け。ユーザーが削除されたらお気に入りも消す
  CONSTRAINT fk_user
    FOREIGN KEY(user_id) 
    REFERENCES user_login(id)
    ON DELETE CASCADE
);
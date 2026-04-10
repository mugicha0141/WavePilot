CREATE TABLE IF NOT EXISTS user_login (
  id SERIAL PRIMARY KEY,
  user_name TEXT NOT NULL,
  user_password TEXT NOT NULL
);

-- テスト用のデータを1件入れておく
INSERT INTO user_login (user_name, user_password) 
VALUES ('test', 'password123')
ON CONFLICT DO NOTHING;
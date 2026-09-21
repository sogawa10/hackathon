# DB スキーマ変更手順書

VegeTASK では **マイグレーションツールを使いません**。`DB/01_create_table.sql` /
`DB/02_add_vegetable.sql` の本体を直接編集し、テーブルを DROP してから流し直す運用です。
この手順書は、その運用をローカル・サーバー（コンテナ）の両方で実行する手順をまとめたものです。

---

## 0. 前提・方針

- 差分マイグレーションファイル（`ALTER TABLE` を積み重ねる `add_xxx.sql` のようなもの）は
  **作らない**。スキーマ変更は必ず `DB/01_create_table.sql`（野菜マスタなら
  `DB/02_add_vegetable.sql`）本体を書き換える。
- データは毎回捨てられる前提。既存行に対するバックフィル SQL は不要。
- `initdb.d`（`DB/` 配下）はファイル名順に実行され、**データボリューム／データディレクトリが
  空のときだけ**自動実行される。スキーマを変えても再起動だけでは反映されない。
- `02_add_vegetable.sql` の野菜マスタ INSERT は `ON CONFLICT DO NOTHING` なので、何度流し直しても
  安全（重複エラーにならない）。
- 実ユーザーデータを保持したまま変更したくなった時点で `goose` 等の導入を再検討する
  （将来メモ。メリット: 変更履歴とロールバックが明確になる／デメリット: 現行のシンプルな
  DROP→再作成運用から離れる）。

---

## 1. 変更の流れ

1. `DB/01_create_table.sql`（必要なら `DB/02_add_vegetable.sql`）を直接編集する。
2. 変更内容が分かる PR を作成し、レビューを受ける。
3. マージ後、ローカル環境とサーバー（コンテナ）それぞれで、本ドキュメントの手順に従って
   反映する。

---

## 2. ローカル反映（Docker を使わない `go run` / `go test` 環境）

`back-end/.env` の `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME` で指す
PostgreSQL に対して、`psql` で直接流し直します。PostgreSQL 17 の `psql` は
`C:\Program Files\PostgreSQL\17\bin` にあります。

```bash
cd "C:\Program Files\PostgreSQL\17\bin"

# 1. 既存テーブルを DROP（依存関係があるので CASCADE で一括削除）
./psql -h <DB_HOST> -p <DB_PORT> -U <DB_USER> -d <DB_NAME> -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 2. 編集後の SQL を流し直す（ファイル名の順序どおりに実行すること）
./psql -h <DB_HOST> -p <DB_PORT> -U <DB_USER> -d <DB_NAME> -f "C:\Users\dolph\workspace\hackathon\DB\01_create_table.sql"
./psql -h <DB_HOST> -p <DB_PORT> -U <DB_USER> -d <DB_NAME> -f "C:\Users\dolph\workspace\hackathon\DB\02_add_vegetable.sql"
```

- パスワードを都度聞かれたくない場合は `PGPASSWORD=<DB_PASS>` を先頭に付けるか、`.pgpass` を
  使ってください。
- 反映後、`cd back-end && go test -v` で統合テストが通ることを確認します。

---

## 3. サーバー（コンテナ）での反映

サーバーでは `docker-compose.yml` の `db` サービス（`postgres:17-alpine`）に対して反映します。
`/opt/vegetask` で作業し、`./.env` の `DB_USER` / `DB_NAME` の値を使ってください。

### 3.1 データ破棄可の場合（推奨・確実）

コンテナのデータボリューム（`pgdata`）ごと作り直す方法です。initdb.d が最初から再実行されるため、
`01_create_table.sql` → `02_add_vegetable.sql` の順序も自動的に守られます。

```bash
cd /opt/vegetask
docker compose down -v     # -v でボリューム（pgdata）ごと削除。データは全て失われる
docker compose up -d
docker compose ps          # db が healthy になるのを確認
```

> `down -v` は `pgdata` ボリュームを削除する不可逆な操作です。本番で実データを保持したい場合は
> 実行前にチームに確認してください。

### 3.2 コンテナを止めたくない場合

`db` コンテナは起動したまま、変更後の SQL だけを流し込みます。`initdb.d` にマウントされている
ファイルは `docker compose up` 時にイメージへコピー済みなので、リポジトリを `git pull` した後は
コンテナ内の `/docker-entrypoint-initdb.d/` にも新しい内容が反映されています。

```bash
cd /opt/vegetask
git pull   # 新しい 01_create_table.sql / 02_add_vegetable.sql を取得済みである前提

# 1. 既存テーブルを DROP
docker compose exec db psql -U <DB_USER> -d <DB_NAME> -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 2. 編集後の SQL をコンテナ内のファイルから流し直す
docker compose exec db psql -U <DB_USER> -d <DB_NAME> -f /docker-entrypoint-initdb.d/01_create_table.sql
docker compose exec db psql -U <DB_USER> -d <DB_NAME> -f /docker-entrypoint-initdb.d/02_add_vegetable.sql
```

- `<DB_USER>` / `<DB_NAME>` は `./.env` の値（既定では `vegetask_user` / `vegetask_db`）に
  置き換えてください。
- `back-end` はコネクションプールを保持しているため、テーブル構造を大きく変えた場合は
  念のため `docker compose restart back-end` しておくと安全です。

---

## 4. 反映後の確認

- `docker compose ps` で全サービスが `running` / `healthy` であること。
- `docker compose logs back-end` に SQL エラー（存在しないカラムなど）が出ていないこと。
- ブラウザ（または `curl http://<VPS-IP>/api/tasks`）で API が想定どおり応答すること
  （未認証なら 401、DB 起因の 500 が出ていないこと）。

---

## 5. 将来メモ：マイグレーションツールの再検討

実ユーザーのデータを保持したままスキーマを変更する必要が出てきた場合は、`goose` などの
マイグレーションツール導入を検討してください。

| | 現行方針（DROP→再作成） | `goose` 等の導入 |
|---|---|---|
| メリット | シンプル。SQL ファイルが常に最新のスキーマそのもの | 変更履歴が残る／本番データを保持したままロールバック可能 |
| デメリット | 適用のたびにデータが失われる | 差分マイグレーションの管理が必要になり、現行の運用より複雑になる |

導入する場合は、まずこの節の方針を更新してから着手してください。

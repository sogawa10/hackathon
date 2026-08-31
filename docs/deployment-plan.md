# VegeTASK デプロイ作業計画（さくら VPS / Docker）

このドキュメントは、VegeTASK をさくら VPS 上に Docker Compose でデプロイするための作業計画です。
チーム開発のため、作業を独立して着手・レビュー・マージできる粒度のタスクに分割しています。

次工程では **「このドキュメントの `T0X` を実装して」** という形で 1 タスクずつ依頼してください。

---

## 全体像（デプロイ後のアーキテクチャ）

### 登場人物

| 名前 | 正体 | ベースイメージ | 役割 | 待ち受けポート |
|---|---|---|---|---|
| **front** | Nginx + ビルド済みの静的ファイル | `nginx:1.27-alpine` | ① React の HTML/JS/CSS/画像を配る ② `/api/` を back-end へ中継 | `:80`（← 唯一ホストに公開） |
| **back-end** | Go/Gin の API サーバ | ビルド: `golang:1.26-alpine` / 実行: `alpine:3.20` | JWT 検証・SQL 発行・ビジネスロジック | `:3000`（内部のみ） |
| **db** | PostgreSQL | `postgres:17-alpine` | データ保存。初回だけ `DB/*.sql` で初期化 | `:5432`（内部のみ） |

この 3 つが 1 台のさくら VPS の中の Docker で動く。フロントエンドは「プロセス」ではなく、Nginx が配っている**ただのファイル**（Node は本番では動かない。ビルド時だけ使う）。

---

## 0. 前提・確定事項

コード調査（React 19 + Vite 8 SPA / Go + Gin + lib/pq / 初期化 SQL 2 本）を踏まえ、以下を前提に計画しています。
変更する場合は影響するタスクを併記しているので、そのタスクの内容を差し替えてください。

| # | 決定事項 | 採用案 | 変更時に影響するタスク |
|---|---|---|---|
| D1 | フロント配信と API プロキシ | **Nginx を 1 コンテナで同居**（静的配信 + `/api` を back-end へ proxy）。これにより CORS 設定に手を入れない | T04, T06, T07 |
| D2 | front-end イメージ | **マルチステージ**（`node:22-alpine` でビルド → `nginx:1.27-alpine` で配信） | T04 |
| D3 | back-end イメージ | **マルチステージ**（`golang:1.26-alpine` でビルド → `alpine:3.20` + `tzdata` + `ca-certificates`） | T03 |
| D4 | フロントの API ベース URL | ビルド時 `VITE_API_BASE_URL=""`（空 = 同一オリジン相対 `/api`）。`services/auth.ts` にフォールバックを追加 | T04, T05 |
| D5 | DB スキーマ管理 | マイグレーションツールは**入れない**。初期化 SQL + 手動 DROP→流し直し（チーム方針どおり）。実ユーザーデータ保持が必要になった時点で `goose` 等を再検討 | T02, T08 |
| D6 | 公開ポート | ホストは **80 番のみ**（Nginx）。back-end(3000) / db(5432) は Compose 内部ネットワークのみ | T06 |
| D7 | 環境変数 | サーバーは **リポジトリ直下の `./.env` 1 ファイル**に集約。キー一覧は README の表に載せる。 | T01, T06, T07 |
| D8 | `MOCK_TODAY` / `VITE_MOCK_TODAY` | 本番 env には**設定しない**（実日付を使う） | T04, T06 |
| D9 | 本番シークレット | `JWT_SECRET` / `DB_PASS` はハッカソン用の値を流用せず、本番用に新しい値を発行 | T07 |

---

## 1. タスク一覧（サマリ）

| ID | タスク | 主な成果物 | 依存 | 目安 |
|---|---|---|---|---|
| T01 | リポジトリ整備（.gitignore / .dockerignore / README 環境変数表） | `.gitignore`, `front-end/.dockerignore`, `back-end/.dockerignore`, `README.md` | なし | S |
| T02 | DB 初期化 SQL の順序整備 | `DB/01_create_table.sql`, `DB/02_add_vegetable.sql` | なし | S |
| T03 | back-end Dockerfile | `back-end/Dockerfile` | T01 | M |
| T04 | front-end Dockerfile + Nginx 設定 | `front-end/Dockerfile`, `front-end/nginx.conf` | T01 | M |
| T05 | front-end コード小修正（API ベース URL フォールバック） | `front-end/src/services/auth.ts` | なし | S |
| T06 | docker-compose.yml | `docker-compose.yml` | T02, T03, T04 | M |
| T07 | サーバー側デプロイ手順書 | `docs/server-setup.md` | T06 | M |
| T08 | DB スキーマ変更手順書 | `docs/db-operations.md` | T02 | S |
| T09 | ローカル結合テスト（Compose 一式） | 動作確認ログ / 修正 | T05, T06 | M |
| T10 | 本番デプロイ & 受け入れ確認 | チェックリスト消化 | T07, T09 | M |
| T11 | （任意）back-end の PORT / CORS を環境変数化 | `back-end/main.go` | なし | S |
| T12 | （任意）back-end に `/healthz` エンドポイント追加 | `back-end/main.go` ほか | なし | S |

目安: S = 30分〜1h / M = 半日程度

---

## 2. 依存グラフ

```
T01 ──┬─> T03 ──┐
      └─> T04 ──┼─> T06 ──> T07 ─┐
T02 ───────┘    │                ├─> T10
T05 ────────────┴──> T09 ────────┘
T02 ──> T08
```

## 3. タスク詳細

### T01. リポジトリ整備（.gitignore / .dockerignore / README 環境変数表）

- **目的**: Docker 化に向けて除外設定を整え、必要な環境変数を README に明文化する。`.env.example` ファイルは作らず（D7）、README の表を唯一の一覧とする。
- **対象ファイル**:
  - `.gitignore`（ルート、既存を整理）
  - `front-end/.dockerignore`（新規）
  - `back-end/.dockerignore`（新規）
  - `README.md`（「環境変数」節を追記）
- **作業内容**:
  - `.gitignore` に横断除外を追加: `**/node_modules`, `**/dist`, ルート `.env`。既存の `front-end/` 個別行と重複してよいが整理する。
  - `front-end/.dockerignore`: `node_modules`, `dist`, `.env`, `.env.*`, `*.log`, `.git`。
  - `back-end/.dockerignore`: `.env`, `.env.*`, `*_test.go` / `main_test.go`（イメージには不要なので除外推奨）、`TEST_CASES.md`, `.git`。
  - `README.md` に「環境変数」節を追加し、以下を書く。実際の秘密値は載せない。
    - **サーバーの `./.env`（リポジトリ直下・1 ファイル・手動作成・`chmod 600`）**
      `docker-compose.yml` が変数展開に自動で使い、`back-end` には `env_file: ./.env` で丸ごと注入、`db` は `POSTGRES_*: ${DB_*}` で流用する。

      | 変数 | 用途 | 例 / 既定 | 備考 |
      |---|---|---|---|
      | `DB_HOST` | 接続先 DB ホスト | `db` | Compose のサービス名 |
      | `DB_PORT` | DB ポート | `5432` | |
      | `DB_USER` | DB ユーザー | `vegetask_user` | `db` の `POSTGRES_USER` に流用 |
      | `DB_PASS` | DB パスワード | （本番用に新規発行） | 秘密。`db` の `POSTGRES_PASSWORD` に流用 |
      | `DB_NAME` | DB 名 | `vegetask_db` | `db` の `POSTGRES_DB` に流用 |
      | `JWT_SECRET` | JWT 署名鍵 | （本番用に新規発行） | 秘密 |
      | `MOCK_TODAY` | 「今日」を固定（開発用） | 未設定 | **本番では設定しない**。未設定だと実日付（Asia/Tokyo） |

    - **front-end（ビルド時 / `docker compose build` の引数で渡す。サーバーに `.env` は不要）**

      | 変数 | 用途 | 本番値 | 備考 |
      |---|---|---|---|
      | `VITE_API_BASE_URL` | API のベース URL | `""`（空） | 空 = 同一オリジンの相対 `/api`。JS に焼き込まれる |
      | `VITE_PROXY_TARGET` | dev サーバのプロキシ先 | — | `npm run dev` 専用。本番ビルドでは未使用 |
      | `VITE_MOCK_TODAY` | 「今日」を固定（開発用） | 未設定 | **本番では渡さない** |

    - **`back-end/.env`（ローカルで Docker を使わず `go run` / `go test` する人向け・各自作成・任意）**
      キーはサーバーの `./.env` と同じだが `DB_HOST=127.0.0.1` などローカル値。`.dockerignore` で除外されるためイメージにもサーバーにも入らない。
- **完了条件（DoD）**:
  - `git status` に `.env` 実体が出ない。
  - README の表だけを見て、サーバーで直下の `./.env` を手で作成できる。
  - README に実際の秘密値が載っていない。
- **担当**: _____ / **レビュー**: _____

---

### T02. DB 初期化 SQL の順序整備

- **目的**: `docker-entrypoint-initdb.d` はファイル名のアルファベット順で実行されるため、現状の `add_vegetable.sql`（a）が `create_table.sql`（c）より先に走り、テーブル未作成で失敗する。順序を固定する。
- **対象ファイル**:
  - `DB/create_table.sql` → `DB/01_create_table.sql` にリネーム
  - `DB/add_vegetable.sql` → `DB/02_add_vegetable.sql` にリネーム
  - （空の `DB/.env` は削除するか `.gitignore` 済みなので放置）
- **作業内容**:
  - `git mv` でリネーム（履歴を残す）。
  - SQL の中身は変更しない（チーム方針: 本体 SQL を編集して DROP→再作成。ここでは順序対応のみ）。
  - ファイル冒頭に、実行順序と「initdb.d は初回のみ実行」旨のコメントを 1〜2 行追加してもよい。
  - `README.md` / 手順書内で旧ファイル名を参照している箇所があれば更新（T07/T08 で拾う）。
- **完了条件（DoD）**:
  - `ls DB/` で `01_` → `02_` の順に並ぶ。
  - `psql -f DB/01_create_table.sql && psql -f DB/02_add_vegetable.sql` がクリーン DB で成功する。
- **担当**: _____ / **レビュー**: _____

---

### T03. back-end Dockerfile

- **目的**: Go/Gin サーバーをマルチステージでコンテナ化する。
- **対象ファイル**: `back-end/Dockerfile`（新規）
- **作業内容**:
  - Stage 1 `builder`: `golang:1.26-alpine`。`go.mod` / `go.sum` を先に COPY → `go mod download` → ソース COPY → `CGO_ENABLED=0 GOOS=linux go build -o /out/server .`（`lib/pq` は pure Go なので CGO 不要）。
  - Stage 2 `runtime`: `alpine:3.20`。`apk add --no-cache tzdata ca-certificates`（`time.LoadLocation("Asia/Tokyo")` 対策。無いと `/api/subtasks/today` 等が 500）。非 root ユーザーを作成して実行。
  - バイナリのみ COPY。`.env` は焼き込まない（Compose の env で注入）。
  - `EXPOSE 3000`（現状 `main.go` の `r.Run(":3000")` ハードコードに合わせる。T11 実施時は `${PORT:-3000}` に追随）。
  - `ENTRYPOINT ["/app/server"]`。作業ディレクトリに `.env` が無くても `godotenv.Load()` は警告ログのみで継続することを確認済み。
- **完了条件（DoD）**:
  - `docker build -t vegetask-back ./back-end` が成功。
  - `docker run --rm -e DB_HOST=... vegetask-back` が DB 未接続時に分かるエラーで落ちる（想定どおり）。
  - イメージサイズが概ね 30MB 台（scratch でない分の tzdata 込み）。
- **担当**: _____ / **レビュー**: _____

---

### T04. front-end Dockerfile + Nginx 設定

- **目的**: Vite SPA をビルドし、Nginx で静的配信 + `/api` プロキシを 1 コンテナにまとめる。
- **対象ファイル**:
  - `front-end/Dockerfile`（新規）
  - `front-end/nginx.conf`（新規、`/etc/nginx/conf.d/default.conf` へ配置）
- **作業内容**:
  - Stage 1 `build`: `node:22-alpine`（Vite 8 は Node ≥ 20.19 / 22.12 必須）。`package.json` / `package-lock.json` を先に COPY → `npm ci` → ソース COPY → `npm run build`（`dist/` 生成）。
  - ビルド時に `VITE_API_BASE_URL` を空にする（`ARG VITE_API_BASE_URL=""` → `ENV` で渡す）。`VITE_MOCK_TODAY` は渡さない。
  - Stage 2 `serve`: `nginx:1.27-alpine`。`dist/` を `/usr/share/nginx/html` に COPY、`nginx.conf` を配置。
  - `nginx.conf` の要点:
    - `charset utf-8;`（`public/野菜L/...` など日本語ファイル名の静的アセット対策）
    - `location /api/ { proxy_pass http://back-end:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }`
    - `location / { root /usr/share/nginx/html; try_files $uri $uri/ /index.html; }`（react-router の SPA フォールバック）
    - 静的アセットの `Cache-Control`（任意）
  - `EXPOSE 80`。
- **完了条件（DoD）**:
  - `docker build -t vegetask-front ./front-end` が成功。
  - 単体起動で `/` が index.html を返し、`/tasks` 直アクセスでも 200（index.html フォールバック）。
  - `/api/...` は back-end 未起動なら 502（プロキシ設定自体は正しい）。
- **担当**: _____ / **レビュー**: _____

---

### T05. front-end コード小修正（API ベース URL フォールバック）

- **目的**: `src/services/auth.ts` だけ `VITE_API_BASE_URL` のフォールバックが無く、空ビルド時に `fetch("undefined/api/login")` になる。他ファイル同様 `|| ''` に揃える。
- **対象ファイル**: `front-end/src/services/auth.ts`（18 行目付近）
- **作業内容**:
  - `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;` を `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';`（または `|| ''`）へ。
  - 他に `import.meta.env.VITE_API_BASE_URL` を直接使っている箇所が無いか grep して確認（現状 `pages/*` と `Layout.tsx` は `|| ''` 済み）。
- **完了条件（DoD）**:
  - `VITE_API_BASE_URL` 未設定でビルドしても login/signup が `/api/login`・`/api/signup`（相対）を叩く。
  - `npm run lint` が通る。
- **担当**: _____ / **レビュー**: _____

---

### T06. docker-compose.yml

- **目的**: nginx(front) / back-end / db の 3 サービスを 1 ファイルで起動できるようにする。
- **対象ファイル**: `docker-compose.yml`（ルート、新規）。参照する直下の `./.env` はサーバーで手動作成（README の表に基づく・1 ファイル）
- **作業内容**:
  - `services.db`: `postgres:17-alpine`。`environment` は `POSTGRES_USER: ${DB_USER}` / `POSTGRES_PASSWORD: ${DB_PASS}` / `POSTGRES_DB: ${DB_NAME}` と `./.env` の `DB_*` を流用（`POSTGRES_*` を別に定義しない）。`./DB` を `/docker-entrypoint-initdb.d` に **read-only** マウント。名前付きボリューム `pgdata` を `/var/lib/postgresql/data` に。`healthcheck` は `pg_isready -U $POSTGRES_USER`。`ports` は**書かない**。
  - `services.back-end`: `build: ./back-end`。`env_file: ./.env`（直下の 1 ファイルを丸ごと注入。`DB_HOST=db` などもここから）。`depends_on: db: condition: service_healthy`。`restart: unless-stopped`（DB ping 失敗で `log.Fatalf` するため）。`ports` は書かない。
  - `services.front`: `build: { context: ./front-end, args: { VITE_API_BASE_URL: "" } }`。`ports: ["80:80"]`。`depends_on: [back-end]`。`restart: unless-stopped`。
  - すべて同一 `networks`（デフォルトブリッジで可）。サービス名 `back-end` / `db` が Nginx・Go の接続先ホスト名になる。
  - `name:`（プロジェクト名 `vegetask`）を固定し、同居する他プロジェクトと衝突させない。
  - `MOCK_TODAY` / `VITE_MOCK_TODAY` は記載しない（D8）。
- **完了条件（DoD）**:
  - `docker compose config` がエラーなく展開される。
  - `docker compose up -d --build` で 3 コンテナが healthy / running になる。
  - ホストから `curl http://localhost/` で SPA、`curl http://localhost/api/tasks` で 401（認証エラー = 経路 OK）。
  - `docker compose ps` で 5432 / 3000 がホストに publish されていない。
- **担当**: _____ / **レビュー**: _____

---

### T07. サーバー側デプロイ手順書

- **目的**: さくら VPS（Debian、複数ユーザー）で誰でも同じ手順でデプロイ・更新できるようにする。
- **対象ファイル**: `docs/server-setup.md`（新規）
- **作業内容**: 以下を手順として記述。
  - 前提: Docker / Docker Compose 導入済み、`/opt/vegetask` に clone 済み。
  - グループ: 全メンバーを `docker`（compose 実行）と `vegetask-dev`（リポジトリ / `.env` 共有）に所属させる。
  - `/opt/vegetask` の共有ディレクトリ化（※現行 VPS では設定済み。サーバー再構築時に再現する手順として記載）:
    - `chgrp -R vegetask-dev /opt/vegetask` ＋ 全ディレクトリに setgid（`find /opt/vegetask -type d -exec chmod g+s {} +`）→ 新規ファイルが `vegetask-dev` 所有になる。
    - `apt-get install -y acl` して `setfacl -R -m g:vegetask-dev:rwX /opt/vegetask` と `setfacl -R -d -m g:vegetask-dev:rwX /opt/vegetask` → `git pull` で増えるファイルもグループ書き込み可になる（各自の umask に依存しない）。
  - `./.env` の作成:
    - README の「環境変数」表を見て、リポジトリ直下に `./.env` を **1 つだけ手で作成**（`DB_*` + `JWT_SECRET`）。本番用 `DB_PASS` / `JWT_SECRET` を新規発行（D9、`openssl rand -hex` など記号なし）。
    - 作成後: `chgrp vegetask-dev .env` → `setfacl -b .env`（継承したデフォルト ACL を除去）→ `chmod 660 .env`（others から隠す）。
    - `back-end/.env` はサーバーには作らない（ローカル非 Docker 開発専用）。
  - `docker compose up -d --build`。
  - 初期化 SQL は初回のみ自動実行される旨（データボリュームが空のとき）。
  - 通常の更新フロー: `git pull` → `docker compose up -d --build` → `docker compose ps` / ログ確認。
  - IP 直打ち・http のみアクセスであること、80 番のみ開放（`ufw` などの確認）。
  - ロールバック: 直前コミットへ `git checkout` して再 `up --build`。
  - 運用: `docker compose logs -f <svc>`、`docker system prune` の定期実行、ディスク監視。
  - トラブルシュート: back-end が起動直後に落ちる → DB healthy 待ちと `.env` を確認。日本語アセットが 404 → Nginx `charset` とビルド成果物を確認。
- **完了条件（DoD）**: 手順書だけを見て、関与していないメンバーがクリーン VPS 相当でデプロイを再現できる（レビューで読み合わせ）。
- **担当**: _____ / **レビュー**: _____

---

### T08. DB スキーマ変更手順書

- **目的**: チーム方針（差分マイグレーションを作らず、`01_create_table.sql` / `02_add_vegetable.sql` 本体を編集 → DROP → 流し直し）を明文化し、サーバー上での実行コマンドを含める。
- **対象ファイル**: `docs/db-operations.md`（新規）
- **作業内容**:
  - スキーマ変更の流れ: 本体 SQL を編集 → PR レビュー → マージ → サーバーで反映。
  - ローカル反映コマンド例（PostgreSQL 17、`psql` は `C:\Program Files\PostgreSQL\17\bin`）。
  - サーバー（コンテナ）での反映:
    - データ破棄可の場合: `docker compose down -v` → `docker compose up -d`（initdb.d が再実行）。
    - コンテナを止めたくない場合: `docker compose exec db psql -U <user> -d <db> -f /docker-entrypoint-initdb.d/01_create_table.sql`（必要な DROP を先に流す）。
  - 「initdb.d はデータディレクトリが空のときだけ自動実行」の注意。
  - シードデータ（野菜マスタ）は `ON CONFLICT DO NOTHING` なので再流ししても安全なこと。
  - 実ユーザーデータを保持したままの変更が必要になったら `goose` 等の導入を検討する、という将来メモ（メリット: 履歴/ロールバック明確、デメリット: 現行方針と運用が変わる）。
- **完了条件（DoD）**: 手順どおりにローカル & コンテナでスキーマ再作成が再現できる。
- **担当**: _____ / **レビュー**: _____

---

### T09. ローカル結合テスト（Compose 一式）

- **目的**: 本番相当構成をローカルで一通り検証し、想定違いを洗い出す。
- **対象**: 動作確認、必要なら T03〜T06 への修正 PR。
- **作業内容 / チェック項目**:
  - `docker compose up -d --build` で全サービス healthy。
  - サインアップ → ログイン → タスク作成 → 野菜割当 → 今日の ToDo 取得 → チェック → 収穫 → かご確認、を UI で通す。
  - ページ리로드・`/tasks` 直アクセスで 404 が出ない（SPA フォールバック）。
  - 日本語アセット（`/野菜L/...`、favicon）が 200。
  - `Asia/Tokyo` 依存の API（`/api/subtasks/today` など）が 500 にならない（tzdata 確認）。
  - `MOCK_TODAY` 未設定で「今日」が実日付になる。
  - back-end / db がホストポートに露出していない。
  - コンテナ再起動後もデータが残る（`pgdata` ボリューム）。
- **完了条件（DoD）**: 上記チェック項目がすべて green、または起票済み。
- **担当**: _____ / **レビュー**: _____

---

### T10. 本番デプロイ & 受け入れ確認

- **目的**: さくら VPS へ実際に配置し、IP 直打ちで動くことを確認する。
- **前提**: T07 手順書、T09 完了。
- **作業内容**:
  - `/opt/vegetask` で `git pull` → `./.env` の存在を確認 → `docker compose up -d --build`。
  - `http://<VPS-IP>/` で SPA 表示、主要フローを 1 周。
  - 別の Linux ユーザーでも更新フロー（`git pull` → `up --build`）が実行できることを確認。
  - ログ・再起動・ディスクを確認。
- **完了条件（DoD）**: 受け入れチェックリスト消化、手順書に実運用で気づいた差分を反映。
- **担当**: _____ / **レビュー**: _____

---

### T11.（任意）back-end の PORT / CORS を環境変数化

- **目的**: `main.go` の `r.Run(":3000")` と CORS `AllowOrigins: ["http://localhost:5173"]` がハードコード。Nginx 同居構成では必須ではないが、将来フロント/バックを別オリジンで公開する場合に備える。
- **対象ファイル**: `back-end/main.go`
- **作業内容**:
  - ポート: `port := os.Getenv("PORT"); if port == "" { port = "3000" }` → `r.Run(":" + port)`。T03 の `EXPOSE` と合わせる。
  - CORS: `os.Getenv("CORS_ALLOW_ORIGINS")`（カンマ区切り）を読み、空なら現行のローカル既定にフォールバック。
  - README の「環境変数」表に `PORT` / `CORS_ALLOW_ORIGINS` を追記（T01 と整合）。
- **完了条件（DoD）**: 環境変数未設定でも従来どおり動作。設定時に反映される。テスト（`main_test.go`）が通る。
- **担当**: _____ / **レビュー**: _____

---

### T12.（任意）back-end に `/healthz` エンドポイント追加

- **目的**: Compose / 監視から back-end の生存と DB 疎通を確認できるようにする。
- **対象ファイル**: `back-end/main.go`（`SetupRouter`）ほか
- **作業内容**:
  - `GET /healthz`: `db.Ping()` して OK なら 200、失敗なら 503。認証不要。
  - T06 の `back-end` サービスに `healthcheck`（`wget -qO- http://localhost:3000/healthz`）を追加できる。
- **完了条件（DoD）**: `curl /healthz` が 200 / 503 を返し分ける。`main_test.go` が通る。
- **担当**: _____ / **レビュー**: _____

---

## 4. 成果物一覧（このデプロイ作業で新規に増えるファイル）

```
新規追加 / 変更されるファイル
├── docker-compose.yml            (T06, 新規)
├── README.md                    (T01, 「環境変数」節を追記)
├── back-end/
│   ├── Dockerfile                (T03, 新規)
│   └── .dockerignore             (T01, 新規)
├── front-end/
│   ├── Dockerfile                (T04, 新規)
│   ├── nginx.conf                (T04, 新規)
│   └── .dockerignore             (T01, 新規)
├── DB/
│   ├── 01_create_table.sql       (T02, create_table.sql からリネーム)
│   └── 02_add_vegetable.sql      (T02, add_vegetable.sql からリネーム)
├── .gitignore                    (T01, 整理)
└── docs/
    ├── deployment-plan.md        (このファイル)
    ├── server-setup.md           (T07, 新規)
    └── db-operations.md          (T08, 新規)

```

## 5. 未決事項 / レビューで決めたいこと

- ~~ルート `.env` と `back-end/.env` を分けるか~~ → **決定: サーバーは直下の `./.env` 1 ファイルに集約**（D7 / T01 / T06 / T07 反映済み）。
- `back-end/.dockerignore` で `*_test.go` / `main_test.go` をイメージから除外してよいか（テストは CI で回す前提か）。
- T11 / T12 を今回スコープに含めるか、別 PR で後追いにするか。
- 本番 `JWT_SECRET` / `DB_PASS` の発行・共有方法（誰が発行し、どこで共有するか）。

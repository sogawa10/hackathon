# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> このリポジトリのドキュメント・コメント・PR 説明・チャットでの説明は**日本語**で書くこと。

## プロジェクト概要

**VegeTASK** — 勉強のタスク管理を「野菜を育てること」に見立てたアプリ。タスクを日ごとの
サブタスクに自動分割し、チェックを付けるたびに野菜が `growth_stage` 0→10 と成長し、収穫して
かごに溜めていく。製品仕様・スコア計算式・API の入出力 JSON（全エンドポイント）は
`README.md` に詳細がある。

1 つのリポジトリに 3 つの構成要素:

- `back-end/` — Go 1.26 + Gin の REST API。PostgreSQL に `database/sql` + `lib/pq` で接続
- `front-end/` — React 19 + Vite 8 の SPA（TypeScript、`react-router-dom` v6）
- `DB/` — Postgres コンテナの `docker-entrypoint-initdb.d` がファイル名順で実行する生 SQL

## コマンド

### バックエンド（`cd back-end`）

```bash
go run .                    # API を :3000 で起動（PostgreSQL への到達と環境変数が必要）
go build -o server .        # ビルド
go test -v                  # 統合テストを全実行
go test -run TestAuth -v    # 1 グループだけ実行（TestTaskCreate, TestHarvestAndBasket, ...）
go vet ./...
```

`go test` は**実際の PostgreSQL に対する End-to-End テスト**（`SetupRouter(db)` を呼び出して
`httptest` で叩く。サーバーの別起動は不要）。前提:

- PostgreSQL が起動し、`DB/01_create_table.sql` + `DB/02_add_vegetable.sql` を適用済み
  （`field_position` 列が必須）
- `back-end/.env` に `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME` / `JWT_SECRET`
- テストが作成・削除するのは `apitest_<ナノ秒>_<ラベル>` という名前のユーザーだけで、その他の
  データには触れない。`MOCK_TODAY` は実行中だけ上書きされ、終了時に元へ戻す。とはいえ CI では
  使い捨ての DB を使うこと。

### フロントエンド（`cd front-end`）

```bash
npm ci                      # インストール（Vite 8 は Node >= 20.19 / 22.12 が必要）
npm run dev                 # Vite 開発サーバーを :5173 で起動。/api を $VITE_PROXY_TARGET へプロキシ
npm run build               # tsc -b && vite build -> dist/
npm run lint                # eslint
npm run preview             # ビルド済み dist/ を配信
```

`front-end/.env` に開発用プロキシ先 `VITE_PROXY_TARGET`（例: `http://localhost:3000`）を置く。
必要に応じて `VITE_API_BASE_URL` / `VITE_MOCK_TODAY` も。

## アーキテクチャ

### バックエンド

- **`main.go`** に `SetupRouter(db *sql.DB) *gin.Engine` があり、全ルートの登録をここで行う。
  `main()` と `main_test.go` の両方がこれを共有する。公開: `POST /api/signup`、`POST /api/login`。
  それ以外は `handlers.AuthMiddleware()` で保護された認証グループ配下。
- **認証** — `AuthMiddleware` は `Authorization: Bearer <JWT>` を要求し、`JWT_SECRET` で HS256 を
  検証、`user_id`（UUID 文字列）を Gin コンテキストに入れる。ハンドラは `c.Get("user_id")` で
  参照する。パスワードは bcrypt ハッシュ。アクセストークン 1 時間、リフレッシュトークン 7 日
  （リフレッシュトークンは発行されるが、まだ再発行エンドポイントは無い）。
- **`handlers/` パッケージ** — `auth.go`、`auth_middleware.go`、`tasks.go`、`subtasks.go`。
  各ハンドラは `func(db *sql.DB) gin.HandlerFunc` のクロージャ。SQL は手書きで、テーブル名は
  ダブルクォート付きの大文字識別子（`"USERS"`、`"TASKS"`、`"SUB_TASKS"`、`"VEGETABLES"`、
  `"HARVESTS"`）。複数ステップの書き込みは明示的に `db.Begin()` / `defer tx.Rollback()` /
  `tx.Commit()` を使う。
- **タスク作成**（`CreateTaskHandler`）が一番重い処理: 期間を検証（最短 7 日）し、
  `buffer_days = ceil(実施日数 * 0.1)` を計算、難易度スコア + 期間スコアから野菜サイズ S/M/L を
  決定（計算式は `README.md`）、その後 1 日 1 行の `SUB_TASKS` を生成する。生成は「端数モード」
  （分量が日数より少ない → 1 単位が複数日にまたがり、最終日だけチェック可能）か通常モード
  （1 日あたりのノルマ）で、末尾に `予備日（調整期間）` の行が付く。
- **`growth_stage`** の意味: `-1` 枯れた、`0` 種（未開始）、`1..10` 成長中（`10` = 完了 =
  収穫可能）、`11` 収穫済み。`field_position` は 0〜24 の畑スロットで、野菜を最初に割り当てた
  ときに `fieldPlacementOrder`（中央寄せ）に従って決まる。収穫済み・枯れたタスクはスロットを
  解放する。
- **「今日」** = 環境変数 `MOCK_TODAY` があればそれ、無ければ `Asia/Tokyo` の `time.Now()`。
  予備日の消費・サブタスクの日付シフト・枯死のロジックは**`GET /api/subtasks/today` の中で
  遅延評価される**（`GET /api/tasks` の中には軽い `growth_stage 0→1` の更新だけがある）。
  cron やバックグラウンドジョブは無い。
- CORS の `AllowOrigins` と待ち受けポート `:3000` は `main.go` にハードコードされている。

### フロントエンド

- `src/App.tsx` がルートを定義。`*` は `/login` へリダイレクト。ページは `src/pages/`、
  共通のガワは `src/components/Layout.tsx`（+ `Header`、`TaskCreateModal`、`VegetableField`）。
- **状態管理ライブラリは無い。** JWT は `localStorage` の `access_token` に保持し、認証が必要な
  リクエストは毎回 `Authorization: Bearer ${localStorage.getItem('access_token')}` を送る。
- **API 呼び出しはほぼ各ページ/コンポーネント内のインライン `fetch`。** 切り出された
  サービスは `src/services/auth.ts`（login/signup）だけ。ベース URL は
  `import.meta.env.VITE_API_BASE_URL || ''` で、空文字は同一オリジンの相対 `/api` を意味する
  （本番の Nginx 構成）。新規に使うときも `|| ''` のフォールバックを残すこと。
- バックエンドは login/signup を**要素 1 個の配列**で返す。`auth.ts` は `json[0]` で取り出す。

### データベース

スキーマは `DB/01_create_table.sql`、野菜マスタのシードは `DB/02_add_vegetable.sql`
（冪等、`ON CONFLICT DO NOTHING`）。ファイル名の数字プレフィックスは、`initdb.d` が
アルファベット順に実行し、シードがテーブルに依存するために必要。`initdb.d` はデータ
ボリュームが空のときだけ実行されるので、再適用するには手動で DROP→再作成するか
`docker compose down -v` する。

## 規約

- **ユーザー向け文字列・エラーメッセージ・コードコメントはすべて日本語。** 編集時もそれに
  合わせる。
- タスク種別は `問題集` / `単語帳` / `過去問` / `その他` のいずれかのリテラル文字列。
  野菜名は `DB/02_add_vegetable.sql` にある 15 個の日本語名（S/M/L 各 5 個）。どちらも
  サーバー側でハードコードされた集合と照合して検証される。
- ルーティングの単一の情報源は `main.go` の `SetupRouter` に保つこと。他の場所でルートを
  登録すると、テストと本番サーバーが食い違う。

## デプロイ

`docs/deployment-plan.md` が計画の正本: 1 台の VPS 上で Docker Compose、Nginx（静的 SPA 配信 +
`/api` のリバースプロキシ）→ Go API → `postgres:17-alpine`。サーバー設定はリポジトリ直下の
`./.env` 1 ファイルに集約し `docker-compose.yml` が参照する。`back-end/.env` はローカルで
Docker を使わない `go run` / `go test` 専用。直近のコミットでこれらのタスク（`T0X`）の実装が
始まっている。`Dockerfile` 群や `docker-compose.yml` はまだ全部はコミットされていない可能性が
ある。

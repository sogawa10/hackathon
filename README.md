# VegeTASK

<img width="549" height="612" alt="Image" src="https://github.com/user-attachments/assets/690316de-9719-4d19-874e-2df2bdfee8c4" />

勉強を「**野菜を育てること**」に見立てたタスク管理アプリ。公開 URL: https://www.vegetask.net/

- タスクを**一日当たりの小タスク**に自動で分割する
- 小タスクをこなすと**野菜が成長**し，すべて終えると収穫できる
- サボると予備日が減り，使い切ると**野菜が枯れる**
- 収穫した野菜は**かご**に溜まり，達成の積み重ねが見える

## 利用の流れ

1. ユーザー名とパスワードで登録・ログインする
2. タスクを入力し，**野菜の種**をもらう（サイズ S / M / L は難易度と期間で決まる）
3. 開始日に種が植えられる
4. 毎日，小タスクをこなして**チェック**を付けると野菜が成長する
5. こなさなかった日は成長せず，**予備日**が 1 日消費される。使い切ると枯れる
6. 小タスクをすべて完了したら**収穫**し，かごに溜める

## 仕様

### タスク

| 種類 | 入力する分量 |
|---|---|
| 問題集 | 問題数 |
| 単語帳 | 単語数 × 周数 |
| 過去問 | 年数 |
| その他 | ページ数 |

どの種類も，タイトル・開始日・期日を合わせて入力する。

- 実施日数 = 期日 − 開始日 + 1（**7 日未満は登録不可**）
- 予備日 = ⌈ 実施日数 × 0.1 ⌉
- 有効日数 = 実施日数 − 予備日

### 野菜

| サイズ | 野菜 |
|---|---|
| S | プチトマト，オクラ，枝豆，シイタケ，ネギ |
| M | 赤パプリカ，ピーマン，なす，キュウリ，タケノコ |
| L | キャベツ，かぼちゃ，トウモロコシ，ブロッコリー，カリフラワー |

### 野菜サイズの決定

総合スコア S = 難易度スコア D + 期間スコア P で決める。

**D** = 種別スコア + 分量スコア

| 種類 | 種別スコア | 分量スコア |
|---|:---:|---|
| 問題集 | 1.5 | （問題数 ÷ 有効日数）× 0.7 |
| 単語帳 | 1.0 | （単語数 × 周数 ÷ 有効日数）× 0.01 |
| 過去問 | 2.5 | （年数 ÷ 有効日数）× 3.0 |
| その他 | 1.0 | （ページ数 ÷ 有効日数）× 0.3 |

**P**

| 実施日数 | 7〜16 | 17〜26 | 27〜36 | 37〜46 | 47〜56 | 57〜65 | 66〜 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| P | 0 | 0.4 | 0.8 | 1.2 | 1.6 | 2.0 | 2.4 |

**サイズ**

| S | サイズ |
|---|:---:|
| 2.8 未満 | S |
| 2.8 以上 5.0 未満 | M |
| 5.0 以上 | L |

### データ

<img width="679" height="581" alt="Image" src="https://github.com/user-attachments/assets/fe9728f5-4e77-400d-9633-a4079874e38e" />

**`growth_stage`**

| 値 | 状態 |
|:---:|---|
| -1 | 枯れた |
| 0 | 種（未開始） |
| 1〜10 | 成長中（10 で収穫可能） |
| 11 | 収穫済み |

**`field_position`**

- 5×5 の畑のスロット番号（`0`〜`24`）。`null` は未配置
- 野菜を初めて割り当てたときに，中央寄せの順で空きスロットに決まる。野菜を選び直しても変わらない
- 収穫済み・枯れたタスクはスロットを解放する

## API

`signup` と `login` 以外は `Authorization: Bearer <access_token>` が必要。

| メソッド | パス | 内容 |
|---|---|---|
| POST | `/api/signup` | ユーザー登録 |
| POST | `/api/login` | ログイン |
| POST | `/api/tasks` | タスク登録 |
| POST | `/api/vegetable/{task_id}` | 野菜をタスクに割り当てる |
| GET | `/api/tasks` | タスク一覧 |
| DELETE | `/api/tasks/{task_id}` | タスク削除 |
| GET | `/api/subtasks/today` | 今日の ToDo |
| PATCH | `/api/subtasks` | ToDo にチェックを付ける |
| POST | `/api/tasks/harvest` | 野菜の収穫 |
| GET | `/api/harvest_basket` | 収穫した野菜一覧 |

### `POST /api/signup`・`POST /api/login`

```jsonc
// リクエスト
{ "user_name": "user_name", "user_pass": "user_pass" }

// レスポンス
{ "user_id": "UUID", "access_token": "access_token" }
```

### `POST /api/tasks`

```jsonc
// リクエスト
{
  "task_type": "単語帳 | 問題集 | 過去問 | その他",
  "task_title": "task_title",
  "total_count": "分量",
  "lap_count": "周回数（省略時は 1）",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD"
}

// レスポンス
{ "task_id": "UUID", "size": "S | M | L" }
```

### `POST /api/vegetable/{task_id}`

```jsonc
// リクエスト
{ "vegetable_name": "vegetable_name" }

// レスポンス
{ "task_id": "UUID" }
```

### `GET /api/tasks`

```json
[
  {
    "task_id": "UUID",
    "task_type": "単語帳 | 問題集 | 過去問 | その他",
    "task_title": "task_title",
    "total_count": "分量",
    "lap_count": "周回数",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "buffer_days": "予備日数",
    "vegetable_name": "vegetable_name",
    "growth_stage": "-1〜11",
    "field_position": "0〜24 | null"
  }
]
```

### `DELETE /api/tasks/{task_id}`

```json
{ "message": "タスクを正常に削除しました" }
```

### `GET /api/subtasks/today`

```json
[
  {
    "sub_task_id": "UUID",
    "task_id": "UUID",
    "scheduled_date": "YYYY-MM-DD",
    "task_type": "単語帳 | 問題集 | 過去問 | その他",
    "task_title": "task_title",
    "task_content": "何問・何単語など",
    "is_completed": "Boolean",
    "vegetable_name": "vegetable_name",
    "growth_stage": "-1〜11",
    "field_position": "0〜24 | null"
  }
]
```

### `PATCH /api/subtasks`

```jsonc
// リクエスト
{ "sub_task_id": "UUID" }

// レスポンス
{ "growth_stage": "-1〜11" }
```

### `POST /api/tasks/harvest`

```jsonc
// リクエスト
{ "task_id": "UUID" }

// レスポンス
{ "harvest_id": "UUID", "vegetable_name": "vegetable_name", "size": "S | M | L" }
```

### `GET /api/harvest_basket`

```json
[
  {
    "harvest_id": "UUID",
    "task_id": "UUID",
    "vegetable_name": "vegetable_name",
    "vegetable_size": "S | M | L",
    "harvested_at": "YYYY-MM-DD"
  }
]
```

## 画面

| 画面 | パス | 内容 | 利用 API |
|---|---|---|---|
| 新規登録 | `/signup` | アカウントを作成する | `POST /api/signup` |
| ログイン | `/login` | ログインする | `POST /api/login` |
| ホーム | `/home` | 畑と今日の ToDo を見る。チェックと収穫を行う | `GET /api/subtasks/today`，`GET /api/tasks`，`PATCH /api/subtasks`，`POST /api/tasks/harvest` |
| タスク作成（モーダル） | — | タスクを登録し，野菜を選ぶ | `POST /api/tasks`，`POST /api/vegetable/{task_id}` |
| タスク一覧 | `/tasks` | 作成済みタスクを一覧で見る | `GET /api/tasks` |
| タスク詳細 | `/tasks/{task_id}` | タスクの内容を見る。削除する | `GET /api/tasks`，`DELETE /api/tasks/{task_id}` |
| 収穫かご | `/basket` | 収穫した野菜を見る | `GET /api/harvest_basket` |

## 環境変数

### サーバーの `./.env`（リポジトリ直下）

`docker-compose.yml` が参照する。front-end 用の `.env` はサーバーに置かない。

| 変数 | 用途 | 例 |
|---|---|---|
| `DB_HOST` | DB ホスト | `db`（Compose のサービス名） |
| `DB_PORT` | DB ポート | `5432` |
| `DB_USER` | DB ユーザー | `vegetask_user` |
| `DB_PASS` | DB パスワード（秘密） | — |
| `DB_NAME` | DB 名 | `vegetask_db` |
| `JWT_SECRET` | JWT 署名鍵（秘密） | — |
| `GIN_MODE` | Gin の実行モード | `release` |
| `MOCK_TODAY` | 「今日」を固定する（開発用。本番では設定しない） | `2026-01-01` |

### ローカル開発（Docker を使わない場合）

| ファイル | 内容 |
|---|---|
| `back-end/.env` | 上の表と同じキー。`DB_HOST=127.0.0.1` などローカルの値にする（`go run` / `go test` 用） |
| `front-end/.env` | `VITE_PROXY_TARGET=http://localhost:3000`（`npm run dev` の API プロキシ先） |

## テスト

```bash
cd back-end
go test -v
go test -run TestAuth -v
```

実際の PostgreSQL に対する統合テスト（サーバーの起動は不要）。2 行目は 1 グループだけ実行する例。

- `DB/01_create_table.sql` と `DB/02_add_vegetable.sql` を適用した DB と，`back-end/.env` が必要
- 作成・削除するのは `apitest_` で始まるユーザーとその関連データだけ

## デプロイ構成

さくら VPS 上で Docker Compose により 3 コンテナを稼働。公開ポートは 80 / 443 のみ。

| コンテナ | 内容 | 待ち受け |
|---|---|---|
| front | Nginx（TLS 終端・SPA 配信・`/api` を back-end へプロキシ） | `:443` / `:80`（80 は https へリダイレクト） |
| back-end | Go / Gin の API | `:3000`（内部のみ） |
| db | PostgreSQL 17 | `:5432`（内部のみ） |

- **HTTPS**: Let's Encrypt の証明書を certbot で自動更新する。`http://` と www なしは `https://www.vegetask.net/` へリダイレクトする
- **CI**: PR ごとに `go vet` / `go test` / `govulncheck` と `npm audit` / `npm run lint` / `npm run build` を実行する。`main` へのマージには CI の成功とレビュー 1 件が必要
- **CD**: `main` へマージすると，CI の成功後に VPS へ自動で反映する
- **セキュリティ**: Nginx でセキュリティヘッダーを付け，`/api/login` と `/api/signup` にレート制限（IP あたり 10 回/分）をかける

サーバーの構築・更新と DB スキーマ変更の手順は `サーバー運用手順.md` を参照。

# VegeTASK API テストケース一覧

バックエンド API の統合テスト。実DB（`back-end/.env` の接続先）に対して
gin ルーターを直接叩く End-to-End テスト。実体は `back-end/main_test.go`。

## 実行方法

```bash
cd back-end
go test -v
go test -run TestAuth -v
```

### 前提

- PostgreSQL が起動している
- `DB/01_create_table.sql` + `DB/02_add_vegetable.sql` 適用済み（`field_position` 列が必要）
- `back-end/.env` に DB 接続情報がある
- サーバー（`go run .`）を別途起動する必要は **ない**（`httptest` でハンドラを直接呼ぶ）

### 安全性

- テストユーザーは `apitest_<ナノ秒>_<ラベル>` という名前で作成される
- テストの前後で `user_name LIKE 'apitest\_%'` のユーザーとその関連データのみ削除する
- **それ以外のデータ（手動で作ったアカウント等）には一切触れない**
- 「今日」は `MOCK_TODAY=2026-07-02` に固定される

---

## カバー範囲（44 サブテスト / 9 グループ）

### 1. 認証 `TestAuth`

| ケース | 期待 |
|---|---|
| 新規ユーザー登録 | 200 / `access_token`・`user_id` が返る |
| 同名ユーザーの再登録 | 失敗（200 以外） |
| パラメータ欠落での登録 | 400 |
| 正しい資格情報でログイン | 200 / `access_token` が返る |
| パスワード誤りでログイン | 401 |
| 存在しないユーザーでログイン | 401 |
| 認証必須 API にトークン無しでアクセス | 401 |
| 不正な形式のトークンでアクセス | 401 |

### 2. タスク作成 `TestTaskCreate`

| ケース | 期待 |
|---|---|
| 問題集を正常作成 | 200 / `task_id` と `size`(S/M/L) が返る |
| 実施期間が 1 週間未満 | 400 |
| 定義外のタスク種別（例: 小説） | 400 |
| 単語帳で周回数を指定 | 分量 = 単語数 × 周数 で計算され、SUB_TASKS が実施日数ぶん生成される。末尾が予備日（調整期間） |
| 過去問・その他も作成できる | 200 |
| `buffer_days` = 実施日数 × 10% の切り上げ | 30 日間 → 3 |

### 3. 野菜割当 & 畑スロット `TestVegetableAssignAndFieldPosition`

| ケース | 期待 |
|---|---|
| 1 つ目の野菜を割り当て | `field_position` = 12（畑の中央） |
| 2 つ目・3 つ目 | それぞれ 8・16（中央寄せの `fieldPlacementOrder` 順） |
| 定義外の野菜名（例: スイカ） | 400 |
| 同じタスクで野菜を選び直す | `field_position` は変わらない（12 のまま） |
| 他人のタスクへ野菜を割り当て | 404（所有チェック） |
| 存在しない task_id へ割り当て | 404 |

### 4. タスク一覧 `TestTaskList`

| ケース | 期待 |
|---|---|
| 一覧取得 | 必須フィールド（`task_id` `task_type` `task_title` `start_date` `end_date` `buffer_days` `vegetable_name` `growth_stage` `field_position`）が揃う |
| 開始日が到達済みのタスク | `growth_stage` が 0 → 1 に自動更新される |
| 開始日が未来のタスク | `growth_stage` は 0 のまま |

### 5. 今日の ToDo `TestTodaySubtasks`

| ケース | 期待 |
|---|---|
| 今日のサブタスク取得 | 対象タスクのサブタスクが 1 件返り、`scheduled_date` = 今日、`field_position` = そのタスクのスロット |

### 6. サブタスク完了 & 成長 `TestCompleteSubtaskAndGrowth`

| ケース | 期待 |
|---|---|
| サブタスクにチェック | `growth_stage` が上がる（content 9 件中 1 件 → `1 + floor(1×9/9)` = 2） |
| 同じサブタスクを再チェック | 冪等（`growth_stage` 不変） |
| 存在しないサブタスク ID | 404 |
| 全 content 完了 | `growth_stage` = 10（収穫可能）。※未来日ぶんは直接 SQL で完了扱いにしてから最後の 1 件を API で完了 |

### 7. 収穫 & かご & スロット解放 `TestHarvestAndBasket`

| ケース | 期待 |
|---|---|
| `growth_stage` < 10 で収穫 | 400 |
| `growth_stage` = 10 で収穫 | 200 / `vegetable_name`・`size` が返り、`growth_stage` = 11 |
| 収穫かご取得 | 収穫済み野菜が `vegetable_size` 付きで入る |
| 今日の ToDo | 収穫済み（11）タスクは除外される |
| 収穫後に新タスクへ野菜割当 | 解放されたスロット（12）を再利用する |

### 8. タスク削除 `TestDeleteTask`

| ケース | 期待 |
|---|---|
| トークン無しで削除 | 401 |
| 削除成功 | 200 / 一覧から消え、SUB_TASKS もカスケード削除される |
| 存在しないタスクの削除 | 404 |

### 9. 予備日の消費・繰り越し・枯死 `TestBufferConsumptionAndWithering`

このグループだけ `MOCK_TODAY` を `os.Setenv` で日ごとに進めて複数日の経過を再現する
（`.env` は変更しない。`MOCK_TODAY` はテスト開始時の値を退避し、終了時にその値へ戻す）。予備日ロジックは
`GET /api/subtasks/today` の呼び出し時に評価される。

| ケース | 期待 |
|---|---|
| 期限内に完了すれば予備日は減らない | `buffer_days` 据え置き、`growth_stage` は進む |
| 1 日サボると予備日が 1 消費される | `buffer_days` -1、`予備日（消費済み）` マーカーが 1 件挿入、未完了サブタスクが +1 日シフトして翌日に「今日の分」が出る、枯死しない |
| 予備日を超えてサボると枯死する | `growth_stage` = -1、今日の ToDo から除外される |
| 複数日タスクは中間日をサボっても消費しない | `(1/2日目)` を過ぎた時点では `buffer_days` 据え置き。`(2/2日目)` まで過ぎて 1 単位ぶん未達成になった時点で `total` 日ぶん（=2）まとめて消費 |

---

## 注意

- `main_test.go` は `package main`。ルーティングは `main.go` の `SetupRouter(db)` を共有する
- テストは実DBを変更する（`apitest_` 以外は保護）。CI で使う場合は使い捨ての DB を用意すること
- Windows でタイムゾーン読み込み（`Asia/Tokyo`）は Go 同梱の zoneinfo にフォールバックするため追加設定は不要

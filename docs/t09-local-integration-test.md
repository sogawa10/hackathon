# T09 ローカル結合テスト結果

- 実施日: 2026-09-21
- ブランチ: `test/t09-compose-integration`
- 環境: Windows 10 / Docker Engine 29.8.0 / Docker Compose v5.5.1

## 結果

| チェック項目 | 結果 | 確認内容 |
|---|---|---|
| Compose ビルド・起動 | OK | `docker compose up -d --build` で front / back-end / db が起動し、db が healthy |
| サインアップ・ログイン | OK | UI からテストユーザーを登録し、ログアウト後に再ログイン |
| タスク作成・野菜割当 | OK | 問題集タスクを作成し、プチトマトを割り当て |
| 今日の ToDo・チェック | OK | 実日付 2026-09-21 の ToDo を取得し、UI から完了。`growth_stage` が 2 に更新 |
| 収穫・かご確認 | OK | 収穫可能状態のテストデータを用意し、UI から収穫。かごの合計収穫数が 1 |
| SPA フォールバック | OK | `/` と `/tasks` への直接アクセスが 200 |
| 日本語アセット | OK | 野菜画像、ロゴ、favicon が 200 |
| Asia/Tokyo 依存 API | OK | `GET /api/subtasks/today` が 200。`MOCK_TODAY` は未設定 |
| ポート公開範囲 | OK | front の 80 のみ公開。back-end の 3000 と db の 5432 は非公開 |
| データ永続化 | OK | 全コンテナ再起動後もログインでき、かごの合計収穫数 1 を維持 |

通常は当日分のサブタスクだけを完了できるため、同日中に収穫 UI まで確認する目的で、当日の
チェック完了後にテストタスクの残りのサブタスクと `growth_stage` を DB 上で収穫可能状態へ
変更した。サインアップ、ログイン、タスク作成、野菜割当、当日 ToDo 完了、収穫、かご表示の
各操作自体は UI から実施した。

## 検出・修正した問題

db の healthcheck が接続先 DB 名を指定していなかったため、`pg_isready` がユーザー名と同名の
存在しない DB へ接続し、5 秒ごとに PostgreSQL の FATAL ログを出していた。

`docker-compose.yml` の healthcheck に `-d $$POSTGRES_DB` を追加した。再作成後、db は healthy
となり、該当の FATAL ログが出ないことを確認した。

package main

// VegeTASK API 統合テスト
//
// 実DB（back-end/.env の接続先）に対して gin ルーターを直接叩く End-to-End テスト。
// サーバーを別プロセスで起動する必要はない（httptest でハンドラを呼ぶ）。
//
// 実行:
//   cd back-end
//   go test -v
//
// 前提:
//   - PostgreSQL が起動しており、DB/create_table.sql + DB/add_vegetable.sql 適用済み
//   - back-end/.env に DB 接続情報がある
//   - テスト内では "今日" を MOCK_TODAY=2026-07-02 に固定する
//
// テストデータは user_name が "apitest_" で始まるユーザーとして作られ、
// テスト前後に自動削除される（他のデータには触れない）。

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

const mockToday = "2026-07-02" // テスト中の「今日」

var (
	testDB     *sql.DB
	testRouter *gin.Engine
)

func TestMain(m *testing.M) {
	_ = godotenv.Load()

	// テスト開始時の MOCK_TODAY を退避し、終了時にその値へ戻す。
	// （テスト中は日付計算を決定的にするため mockToday に固定する）
	origMockToday, hadMockToday := os.LookupEnv("MOCK_TODAY")
	restoreMockToday := func() {
		if hadMockToday {
			os.Setenv("MOCK_TODAY", origMockToday)
		} else {
			os.Unsetenv("MOCK_TODAY")
		}
	}

	os.Setenv("MOCK_TODAY", mockToday)
	gin.SetMode(gin.TestMode)

	connStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_USER"),
		os.Getenv("DB_PASS"), os.Getenv("DB_NAME"),
	)
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		fmt.Println("DB接続設定エラー:", err)
		os.Exit(1)
	}
	if err := db.Ping(); err != nil {
		fmt.Println("DB接続エラー（PostgreSQLが起動しているか確認）:", err)
		os.Exit(1)
	}
	testDB = db
	testRouter = SetupRouter(db)

	cleanupTestData()
	code := m.Run()
	cleanupTestData()
	db.Close()
	restoreMockToday()
	os.Exit(code)
}

// ---- ヘルパー ----

func cleanupTestData() {
	testDB.Exec(`DELETE FROM "HARVESTS" WHERE user_id IN (SELECT user_id FROM "USERS" WHERE user_name LIKE 'apitest\_%' ESCAPE '\')`)
	testDB.Exec(`DELETE FROM "TASKS"    WHERE user_id IN (SELECT user_id FROM "USERS" WHERE user_name LIKE 'apitest\_%' ESCAPE '\')`)
	testDB.Exec(`DELETE FROM "USERS"    WHERE user_name LIKE 'apitest\_%' ESCAPE '\'`)
}

func req(t *testing.T, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var r *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	} else {
		r = bytes.NewReader(nil)
	}
	httpReq := httptest.NewRequest(method, path, r)
	httpReq.Header.Set("Content-Type", "application/json")
	if token != "" {
		httpReq.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	testRouter.ServeHTTP(rec, httpReq)
	return rec
}

func decodeArray(t *testing.T, rec *httptest.ResponseRecorder) []map[string]any {
	t.Helper()
	var out []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("配列JSONのデコード失敗: %v / body=%s", err, rec.Body.String())
	}
	return out
}

func decodeObj(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("オブジェクトJSONのデコード失敗: %v / body=%s", err, rec.Body.String())
	}
	return out
}

func mustStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("ステータス期待 %d, 実際 %d / body=%s", want, rec.Code, rec.Body.String())
	}
}

// テスト中の「今日」を差し替える（ハンドラは毎リクエスト os.Getenv("MOCK_TODAY") を読む）
func setToday(s string) { os.Setenv("MOCK_TODAY", s) }

// GET /api/tasks から指定タスクの1件を返す
func getTask(t *testing.T, token, taskID string) map[string]any {
	t.Helper()
	rec := req(t, "GET", "/api/tasks", token, nil)
	mustStatus(t, rec, 200)
	for _, o := range decodeArray(t, rec) {
		if o["task_id"] == taskID {
			return o
		}
	}
	t.Fatalf("タスク %s が一覧に無い", taskID)
	return nil
}

// GET /api/subtasks/today から指定タスクの sub_task_id を返す（無ければ ""）
func todaySubID(t *testing.T, token, taskID string) string {
	t.Helper()
	rec := req(t, "GET", "/api/subtasks/today", token, nil)
	mustStatus(t, rec, 200)
	for _, o := range decodeArray(t, rec) {
		if o["task_id"] == taskID {
			return o["sub_task_id"].(string)
		}
	}
	return ""
}

// テストユーザーを作成し access_token を返す
func newUser(t *testing.T, label string) (userID, token string) {
	t.Helper()
	name := fmt.Sprintf("apitest_%d_%s", time.Now().UnixNano(), label)
	rec := req(t, "POST", "/api/signup", "", map[string]string{"user_name": name, "user_pass": "pass1234"})
	mustStatus(t, rec, 200)
	arr := decodeArray(t, rec)
	if len(arr) == 0 {
		t.Fatalf("signup レスポンスが空: %s", rec.Body.String())
	}
	return arr[0]["user_id"].(string), arr[0]["access_token"].(string)
}

// タスク作成 → 野菜割当まで行い task_id を返す
func newTaskWithVeg(t *testing.T, token, taskType, title string, total, lap int, start, end, veg string) string {
	t.Helper()
	rec := req(t, "POST", "/api/tasks", token, map[string]any{
		"task_type": taskType, "task_title": title, "total_count": total,
		"lap_count": lap, "start_date": start, "end_date": end,
	})
	mustStatus(t, rec, 200)
	taskID := decodeObj(t, rec)["task_id"].(string)
	rec = req(t, "POST", "/api/vegetable/"+taskID, token, map[string]string{"vegetable_name": veg})
	mustStatus(t, rec, 200)
	return taskID
}

func dbFieldPosition(t *testing.T, taskID string) (int, bool) {
	t.Helper()
	var p sql.NullInt64
	if err := testDB.QueryRow(`SELECT field_position FROM "TASKS" WHERE task_id=$1`, taskID).Scan(&p); err != nil {
		t.Fatalf("field_position 取得失敗: %v", err)
	}
	return int(p.Int64), p.Valid
}

func dbGrowthStage(t *testing.T, taskID string) int {
	t.Helper()
	var g int
	if err := testDB.QueryRow(`SELECT growth_stage FROM "TASKS" WHERE task_id=$1`, taskID).Scan(&g); err != nil {
		t.Fatalf("growth_stage 取得失敗: %v", err)
	}
	return g
}

// 日付ヘルパー（mockToday からの相対日数）
func day(offset int) string {
	base, _ := time.Parse("2006-01-02", mockToday)
	return base.AddDate(0, 0, offset).Format("2006-01-02")
}

// ========================= 認証 =========================

func TestAuth(t *testing.T) {
	name := fmt.Sprintf("apitest_%d_auth", time.Now().UnixNano())

	t.Run("signup_成功", func(t *testing.T) {
		rec := req(t, "POST", "/api/signup", "", map[string]string{"user_name": name, "user_pass": "pass1234"})
		mustStatus(t, rec, 200)
		arr := decodeArray(t, rec)
		if arr[0]["access_token"] == "" || arr[0]["user_id"] == "" {
			t.Fatalf("token/user_id が空: %s", rec.Body.String())
		}
	})

	t.Run("signup_重複ユーザー名は失敗", func(t *testing.T) {
		rec := req(t, "POST", "/api/signup", "", map[string]string{"user_name": name, "user_pass": "pass1234"})
		if rec.Code == 200 {
			t.Fatalf("重複登録が成功してしまった")
		}
	})

	t.Run("signup_パラメータ欠落は400", func(t *testing.T) {
		rec := req(t, "POST", "/api/signup", "", map[string]string{"user_name": "onlyname"})
		mustStatus(t, rec, 400)
	})

	t.Run("login_成功", func(t *testing.T) {
		rec := req(t, "POST", "/api/login", "", map[string]string{"user_name": name, "user_pass": "pass1234"})
		mustStatus(t, rec, 200)
		if decodeArray(t, rec)[0]["access_token"] == "" {
			t.Fatalf("access_token が空")
		}
	})

	t.Run("login_パスワード誤りは401", func(t *testing.T) {
		rec := req(t, "POST", "/api/login", "", map[string]string{"user_name": name, "user_pass": "wrong"})
		mustStatus(t, rec, 401)
	})

	t.Run("login_存在しないユーザーは401", func(t *testing.T) {
		rec := req(t, "POST", "/api/login", "", map[string]string{"user_name": "no_such_user_xyz", "user_pass": "x"})
		mustStatus(t, rec, 401)
	})

	t.Run("認証必須APIへトークン無しは401", func(t *testing.T) {
		rec := req(t, "GET", "/api/tasks", "", nil)
		mustStatus(t, rec, 401)
	})

	t.Run("不正なトークンは401", func(t *testing.T) {
		rec := req(t, "GET", "/api/tasks", "garbage.token.value", nil)
		mustStatus(t, rec, 401)
	})
}

// ========================= タスク作成 =========================

func TestTaskCreate(t *testing.T) {
	_, token := newUser(t, "create")

	t.Run("問題集_正常作成", func(t *testing.T) {
		rec := req(t, "POST", "/api/tasks", token, map[string]any{
			"task_type": "問題集", "task_title": "青チャートIA", "total_count": 50,
			"lap_count": 1, "start_date": day(0), "end_date": day(6),
		})
		mustStatus(t, rec, 200)
		obj := decodeObj(t, rec)
		if obj["task_id"] == "" {
			t.Fatalf("task_id が空")
		}
		if s, _ := obj["size"].(string); s != "S" && s != "M" && s != "L" {
			t.Fatalf("size が不正: %v", obj["size"])
		}
	})

	t.Run("1週間未満は400", func(t *testing.T) {
		rec := req(t, "POST", "/api/tasks", token, map[string]any{
			"task_type": "問題集", "task_title": "短すぎ", "total_count": 10,
			"lap_count": 1, "start_date": day(0), "end_date": day(5), // 6日間
		})
		mustStatus(t, rec, 400)
	})

	t.Run("不正なタスク種別は400", func(t *testing.T) {
		rec := req(t, "POST", "/api/tasks", token, map[string]any{
			"task_type": "小説", "task_title": "x", "total_count": 10,
			"lap_count": 1, "start_date": day(0), "end_date": day(10),
		})
		mustStatus(t, rec, 400)
	})

	t.Run("単語帳_周回数が分量に反映される", func(t *testing.T) {
		rec := req(t, "POST", "/api/tasks", token, map[string]any{
			"task_type": "単語帳", "task_title": "シス単", "total_count": 100,
			"lap_count": 3, "start_date": day(0), "end_date": day(13),
		})
		mustStatus(t, rec, 200)
		taskID := decodeObj(t, rec)["task_id"].(string)
		// 実施14日, 予備日 ceil(1.4)=2, 有効12日。分量 300 >= 12 → ノルマモード。
		// SUB_TASKS は実施日数ぶん = 14 行。
		var cnt int
		testDB.QueryRow(`SELECT count(*) FROM "SUB_TASKS" WHERE task_id=$1`, taskID).Scan(&cnt)
		if cnt != 14 {
			t.Fatalf("SUB_TASKS 行数 期待14, 実際 %d", cnt)
		}
		// 予備日ぶん（末尾2日）が「予備日（調整期間）」になっているはず
		var buf int
		testDB.QueryRow(`SELECT count(*) FROM "SUB_TASKS" WHERE task_id=$1 AND task_content='予備日（調整期間）'`, taskID).Scan(&buf)
		if buf != 2 {
			t.Fatalf("予備日サブタスク 期待2, 実際 %d", buf)
		}
	})

	t.Run("過去問_その他も作成できる", func(t *testing.T) {
		for _, tt := range []string{"過去問", "その他"} {
			rec := req(t, "POST", "/api/tasks", token, map[string]any{
				"task_type": tt, "task_title": tt + "課題", "total_count": 5,
				"lap_count": 1, "start_date": day(0), "end_date": day(20),
			})
			mustStatus(t, rec, 200)
		}
	})

	t.Run("buffer_days_は実施日数の10%切り上げ", func(t *testing.T) {
		rec := req(t, "POST", "/api/tasks", token, map[string]any{
			"task_type": "問題集", "task_title": "予備日確認", "total_count": 30,
			"lap_count": 1, "start_date": day(0), "end_date": day(29), // 30日間 → ceil(3.0)=3
		})
		mustStatus(t, rec, 200)
		taskID := decodeObj(t, rec)["task_id"].(string)
		var buf int
		testDB.QueryRow(`SELECT buffer_days FROM "TASKS" WHERE task_id=$1`, taskID).Scan(&buf)
		if buf != 3 {
			t.Fatalf("buffer_days 期待3, 実際 %d", buf)
		}
	})
}

// ========================= 野菜割当 + field_position =========================

func TestVegetableAssignAndFieldPosition(t *testing.T) {
	_, token := newUser(t, "veg")

	mkTask := func(title string) string {
		rec := req(t, "POST", "/api/tasks", token, map[string]any{
			"task_type": "問題集", "task_title": title, "total_count": 40,
			"lap_count": 1, "start_date": day(0), "end_date": day(9),
		})
		mustStatus(t, rec, 200)
		return decodeObj(t, rec)["task_id"].(string)
	}

	t1 := mkTask("veg-1")
	t2 := mkTask("veg-2")
	t3 := mkTask("veg-3")

	t.Run("1つ目の野菜は中央スロット12", func(t *testing.T) {
		rec := req(t, "POST", "/api/vegetable/"+t1, token, map[string]string{"vegetable_name": "トマト不正"})
		_ = rec
		rec = req(t, "POST", "/api/vegetable/"+t1, token, map[string]string{"vegetable_name": "プチトマト"})
		mustStatus(t, rec, 200)
		if p, ok := dbFieldPosition(t, t1); !ok || p != 12 {
			t.Fatalf("field_position 期待12, 実際 %d (valid=%v)", p, ok)
		}
	})

	t.Run("2つ目は8_3つ目は16_中央寄せ順", func(t *testing.T) {
		rec := req(t, "POST", "/api/vegetable/"+t2, token, map[string]string{"vegetable_name": "オクラ"})
		mustStatus(t, rec, 200)
		rec = req(t, "POST", "/api/vegetable/"+t3, token, map[string]string{"vegetable_name": "ネギ"})
		mustStatus(t, rec, 200)
		if p, _ := dbFieldPosition(t, t2); p != 8 {
			t.Fatalf("2つ目 field_position 期待8, 実際 %d", p)
		}
		if p, _ := dbFieldPosition(t, t3); p != 16 {
			t.Fatalf("3つ目 field_position 期待16, 実際 %d", p)
		}
	})

	t.Run("不正な野菜名は400", func(t *testing.T) {
		rec := req(t, "POST", "/api/vegetable/"+t1, token, map[string]string{"vegetable_name": "スイカ"})
		mustStatus(t, rec, 400)
	})

	t.Run("野菜を選び直しても位置は変わらない", func(t *testing.T) {
		rec := req(t, "POST", "/api/vegetable/"+t1, token, map[string]string{"vegetable_name": "枝豆"})
		mustStatus(t, rec, 200)
		if p, _ := dbFieldPosition(t, t1); p != 12 {
			t.Fatalf("再割当後 field_position 期待12, 実際 %d", p)
		}
	})

	t.Run("他人のタスクへの割当は404", func(t *testing.T) {
		_, otherToken := newUser(t, "veg-other")
		rec := req(t, "POST", "/api/vegetable/"+t1, otherToken, map[string]string{"vegetable_name": "なす"})
		mustStatus(t, rec, 404)
	})

	t.Run("存在しないタスクIDは404", func(t *testing.T) {
		rec := req(t, "POST", "/api/vegetable/00000000-0000-0000-0000-000000000000", token, map[string]string{"vegetable_name": "なす"})
		mustStatus(t, rec, 404)
	})
}

// ========================= タスク一覧 =========================

func TestTaskList(t *testing.T) {
	_, token := newUser(t, "list")
	today := newTaskWithVeg(t, token, "問題集", "list-今日開始", 40, 1, day(0), day(9), "プチトマト")
	future := newTaskWithVeg(t, token, "問題集", "list-未来開始", 40, 1, day(3), day(12), "オクラ")

	rec := req(t, "GET", "/api/tasks", token, nil)
	mustStatus(t, rec, 200)
	arr := decodeArray(t, rec)
	if len(arr) != 2 {
		t.Fatalf("タスク数 期待2, 実際 %d", len(arr))
	}

	byID := map[string]map[string]any{}
	for _, o := range arr {
		byID[o["task_id"].(string)] = o
	}

	t.Run("必須フィールドが揃っている", func(t *testing.T) {
		o := byID[today]
		for _, k := range []string{"task_id", "task_type", "task_title", "start_date", "end_date", "buffer_days", "vegetable_name", "growth_stage", "field_position"} {
			if _, ok := o[k]; !ok {
				t.Fatalf("フィールド %s が無い: %v", k, o)
			}
		}
		if o["vegetable_name"] != "プチトマト" {
			t.Fatalf("vegetable_name 期待プチトマト, 実際 %v", o["vegetable_name"])
		}
		if o["field_position"].(float64) != 12 {
			t.Fatalf("field_position 期待12, 実際 %v", o["field_position"])
		}
	})

	t.Run("開始日到達タスクはgrowth_stageが1に自動更新", func(t *testing.T) {
		if byID[today]["growth_stage"].(float64) != 1 {
			t.Fatalf("今日開始タスクの growth_stage 期待1, 実際 %v", byID[today]["growth_stage"])
		}
	})

	t.Run("未来開始タスクはgrowth_stage0のまま", func(t *testing.T) {
		if byID[future]["growth_stage"].(float64) != 0 {
			t.Fatalf("未来開始タスクの growth_stage 期待0, 実際 %v", byID[future]["growth_stage"])
		}
	})
}

// ========================= 今日のToDo =========================

func TestTodaySubtasks(t *testing.T) {
	_, token := newUser(t, "today")
	taskID := newTaskWithVeg(t, token, "問題集", "today-task", 40, 1, day(0), day(9), "プチトマト")

	rec := req(t, "GET", "/api/subtasks/today", token, nil)
	mustStatus(t, rec, 200)
	arr := decodeArray(t, rec)

	t.Run("今日のサブタスクが1件返る", func(t *testing.T) {
		found := false
		for _, o := range arr {
			if o["task_id"] == taskID {
				found = true
				if o["scheduled_date"] != mockToday {
					t.Fatalf("scheduled_date 期待 %s, 実際 %v", mockToday, o["scheduled_date"])
				}
				if _, ok := o["field_position"]; !ok {
					t.Fatalf("field_position が無い: %v", o)
				}
				if o["field_position"].(float64) != 12 {
					t.Fatalf("field_position 期待12, 実際 %v", o["field_position"])
				}
			}
		}
		if !found {
			t.Fatalf("今日のサブタスクに task %s が含まれない: %s", taskID, rec.Body.String())
		}
	})
}

// ========================= サブタスク完了 & 成長 =========================

func TestCompleteSubtaskAndGrowth(t *testing.T) {
	_, token := newUser(t, "complete")
	// 実施10日, 予備日1, 有効9日。分量40>=9 → ノルマモード。content行9 + 予備日1。
	taskID := newTaskWithVeg(t, token, "問題集", "complete-task", 40, 1, day(0), day(9), "プチトマト")

	// 今日のサブタスク（day0）を取得
	rec := req(t, "GET", "/api/subtasks/today", token, nil)
	arr := decodeArray(t, rec)
	var subID string
	for _, o := range arr {
		if o["task_id"] == taskID {
			subID = o["sub_task_id"].(string)
		}
	}
	if subID == "" {
		t.Fatalf("今日のサブタスクが見つからない")
	}

	t.Run("チェックでgrowth_stageが上がる", func(t *testing.T) {
		rec := req(t, "PATCH", "/api/subtasks", token, map[string]string{"sub_task_id": subID})
		mustStatus(t, rec, 200)
		g := decodeObj(t, rec)["growth_stage"].(float64)
		// content 9件中1件完了 → 1 + floor(1*9/9) = 2
		if g != 2 {
			t.Fatalf("growth_stage 期待2, 実際 %v", g)
		}
	})

	t.Run("同じサブタスクの再チェックは冪等", func(t *testing.T) {
		rec := req(t, "PATCH", "/api/subtasks", token, map[string]string{"sub_task_id": subID})
		mustStatus(t, rec, 200)
		if decodeObj(t, rec)["growth_stage"].(float64) != 2 {
			t.Fatalf("再チェックで growth_stage が変化した")
		}
	})

	t.Run("存在しないサブタスクIDは404", func(t *testing.T) {
		rec := req(t, "PATCH", "/api/subtasks", token, map[string]string{"sub_task_id": "00000000-0000-0000-0000-000000000000"})
		mustStatus(t, rec, 404)
	})

	t.Run("全content完了でgrowth_stage10", func(t *testing.T) {
		// MOCK_TODAY 固定のため未来日のサブタスクは API では完了できない。
		// 「日数が経過した」状況を作るため、最後の1件を除いて直接完了にする。
		_, err := testDB.Exec(`
			UPDATE "SUB_TASKS" SET is_completed = true
			WHERE task_id = $1 AND task_content <> '予備日（調整期間）'
			  AND sub_task_id <> (
			      SELECT sub_task_id FROM "SUB_TASKS"
			      WHERE task_id = $1 AND task_content <> '予備日（調整期間）'
			      ORDER BY scheduled_date DESC LIMIT 1
			  )`, taskID)
		if err != nil {
			t.Fatalf("下準備の直接更新に失敗: %v", err)
		}
		var lastSub string
		testDB.QueryRow(`
			SELECT sub_task_id FROM "SUB_TASKS"
			WHERE task_id=$1 AND task_content <> '予備日（調整期間）' AND is_completed = false
			ORDER BY scheduled_date DESC LIMIT 1`, taskID).Scan(&lastSub)

		rec := req(t, "PATCH", "/api/subtasks", token, map[string]string{"sub_task_id": lastSub})
		mustStatus(t, rec, 200)
		if decodeObj(t, rec)["growth_stage"].(float64) != 10 {
			t.Fatalf("全完了時 growth_stage 期待10, 実際 %v", decodeObj(t, rec)["growth_stage"])
		}
	})
}

// ========================= 収穫 & かご & スロット解放 =========================

func TestHarvestAndBasket(t *testing.T) {
	_, token := newUser(t, "harvest")
	taskID := newTaskWithVeg(t, token, "問題集", "harvest-task", 40, 1, day(0), day(9), "プチトマト")

	t.Run("growth_stage10未満の収穫は400", func(t *testing.T) {
		rec := req(t, "POST", "/api/tasks/harvest", token, map[string]string{"task_id": taskID})
		mustStatus(t, rec, 400)
	})

	// 全完了させて growth_stage 10 にする
	testDB.Exec(`UPDATE "SUB_TASKS" SET is_completed=true WHERE task_id=$1 AND task_content<>'予備日（調整期間）'`, taskID)
	testDB.Exec(`UPDATE "TASKS" SET growth_stage=10 WHERE task_id=$1`, taskID)

	t.Run("growth_stage10なら収穫成功", func(t *testing.T) {
		rec := req(t, "POST", "/api/tasks/harvest", token, map[string]string{"task_id": taskID})
		mustStatus(t, rec, 200)
		obj := decodeObj(t, rec)
		if obj["vegetable_name"] != "プチトマト" || obj["size"] != "S" {
			t.Fatalf("収穫レスポンス不正: %v", obj)
		}
		if dbGrowthStage(t, taskID) != 11 {
			t.Fatalf("収穫後 growth_stage 期待11, 実際 %d", dbGrowthStage(t, taskID))
		}
	})

	t.Run("かごに収穫済みが入る", func(t *testing.T) {
		rec := req(t, "GET", "/api/harvest_basket", token, nil)
		mustStatus(t, rec, 200)
		arr := decodeArray(t, rec)
		if len(arr) != 1 || arr[0]["vegetable_name"] != "プチトマト" || arr[0]["vegetable_size"] != "S" {
			t.Fatalf("かご内容が不正: %s", rec.Body.String())
		}
	})

	t.Run("今日のToDoから収穫済みタスクは除外される", func(t *testing.T) {
		rec := req(t, "GET", "/api/subtasks/today", token, nil)
		for _, o := range decodeArray(t, rec) {
			if o["task_id"] == taskID {
				t.Fatalf("収穫済みタスクが今日のToDoに残っている")
			}
		}
	})

	t.Run("収穫でスロットが解放され次のタスクが再利用する", func(t *testing.T) {
		// harvest-task はスロット12。収穫で growth_stage=11 → 解放。
		newTask := newTaskWithVeg(t, token, "問題集", "harvest-after", 40, 1, day(0), day(9), "オクラ")
		if p, _ := dbFieldPosition(t, newTask); p != 12 {
			t.Fatalf("解放スロットの再利用 期待12, 実際 %d", p)
		}
	})
}

// ========================= タスク削除 =========================

func TestDeleteTask(t *testing.T) {
	_, token := newUser(t, "delete")
	taskID := newTaskWithVeg(t, token, "問題集", "delete-task", 40, 1, day(0), day(9), "プチトマト")

	t.Run("トークン無しの削除は401", func(t *testing.T) {
		rec := req(t, "DELETE", "/api/tasks/"+taskID, "", nil)
		mustStatus(t, rec, 401)
	})

	t.Run("削除成功しサブタスクもカスケード削除", func(t *testing.T) {
		rec := req(t, "DELETE", "/api/tasks/"+taskID, token, nil)
		mustStatus(t, rec, 200)

		rec = req(t, "GET", "/api/tasks", token, nil)
		for _, o := range decodeArray(t, rec) {
			if o["task_id"] == taskID {
				t.Fatalf("削除したタスクが一覧に残っている")
			}
		}
		var cnt int
		testDB.QueryRow(`SELECT count(*) FROM "SUB_TASKS" WHERE task_id=$1`, taskID).Scan(&cnt)
		if cnt != 0 {
			t.Fatalf("サブタスクがカスケード削除されていない: %d 件", cnt)
		}
	})

	t.Run("存在しないタスクの削除は404", func(t *testing.T) {
		rec := req(t, "DELETE", "/api/tasks/00000000-0000-0000-0000-000000000000", token, nil)
		mustStatus(t, rec, 404)
	})
}

// ========================= 予備日の消費・繰り越し・枯死 =========================
//
// このグループだけ MOCK_TODAY を日ごとに進めて複数日の経過を再現する。
// 予備日ロジックは GET /api/subtasks/today の呼び出し時に評価される。

func TestBufferConsumptionAndWithering(t *testing.T) {
	// このテストに入った時点の値へ戻す（他テストへ影響させない）
	savedToday := os.Getenv("MOCK_TODAY")
	defer setToday(savedToday)

	t.Run("期限内に完了すれば予備日は減らない", func(t *testing.T) {
		setToday("2026-07-02")
		_, token := newUser(t, "buf-ontime")
		// 実施7日, 予備日1, 有効6日。分量12>=6 → ノルマモード（"2問解く" × 6日 + 予備日1）
		taskID := newTaskWithVeg(t, token, "問題集", "buf-ontime", 12, 1, "2026-07-02", "2026-07-08", "プチトマト")

		// 7/2 の分をその日に完了
		sub := todaySubID(t, token, taskID)
		if sub == "" {
			t.Fatalf("7/2 のサブタスクが取得できない")
		}
		mustStatus(t, req(t, "PATCH", "/api/subtasks", token, map[string]string{"sub_task_id": sub}), 200)

		// 翌日
		setToday("2026-07-03")
		req(t, "GET", "/api/subtasks/today", token, nil) // 予備日ロジックを走らせる

		task := getTask(t, token, taskID)
		if task["buffer_days"].(float64) != 1 {
			t.Fatalf("buffer_days 期待1（未消費）, 実際 %v", task["buffer_days"])
		}
		if task["growth_stage"].(float64) != 2 {
			t.Fatalf("growth_stage 期待2, 実際 %v", task["growth_stage"])
		}
	})

	t.Run("1日サボると予備日が1消費されタスクが1日後ろへずれる", func(t *testing.T) {
		setToday("2026-07-02")
		_, token := newUser(t, "buf-miss1")
		taskID := newTaskWithVeg(t, token, "問題集", "buf-miss1", 12, 1, "2026-07-02", "2026-07-08", "オクラ")

		var before int
		testDB.QueryRow(`SELECT count(*) FROM "SUB_TASKS" WHERE task_id=$1 AND scheduled_date='2026-07-08'`, taskID).Scan(&before)

		// 7/2 を放置して翌日へ
		setToday("2026-07-03")
		req(t, "GET", "/api/subtasks/today", token, nil)

		task := getTask(t, token, taskID)
		if task["buffer_days"].(float64) != 0 {
			t.Fatalf("buffer_days 期待0（1消費）, 実際 %v", task["buffer_days"])
		}
		if task["growth_stage"].(float64) != 1 {
			t.Fatalf("growth_stage 期待1（枯れていない）, 実際 %v", task["growth_stage"])
		}
		// 消費済みマーカーが1件挿入されている
		var consumed int
		testDB.QueryRow(`SELECT count(*) FROM "SUB_TASKS" WHERE task_id=$1 AND task_content='予備日（消費済み）' AND is_completed=true`, taskID).Scan(&consumed)
		if consumed != 1 {
			t.Fatalf("予備日（消費済み）マーカー 期待1, 実際 %d", consumed)
		}
		// 未完了サブタスクが +1 日シフトし、7/3 に「今日の分」が現れる
		if todaySubID(t, token, taskID) == "" {
			t.Fatalf("シフト後、7/3 に今日のサブタスクが無い")
		}
	})

	t.Run("予備日を超えてサボると枯死しToDoから消える", func(t *testing.T) {
		setToday("2026-07-02")
		_, token := newUser(t, "buf-wither")
		taskID := newTaskWithVeg(t, token, "問題集", "buf-wither", 12, 1, "2026-07-02", "2026-07-08", "ネギ")

		// 1日目サボり → 予備日1消費（残0）
		setToday("2026-07-03")
		req(t, "GET", "/api/subtasks/today", token, nil)
		if getTask(t, token, taskID)["buffer_days"].(float64) != 0 {
			t.Fatalf("前提: buffer_days が0になっていない")
		}

		// さらにサボり → 予備日が無いので枯死
		setToday("2026-07-04")
		req(t, "GET", "/api/subtasks/today", token, nil)

		task := getTask(t, token, taskID)
		if task["growth_stage"].(float64) != -1 {
			t.Fatalf("growth_stage 期待-1（枯死）, 実際 %v", task["growth_stage"])
		}
		if todaySubID(t, token, taskID) != "" {
			t.Fatalf("枯死タスクが今日のToDoに残っている")
		}
	})

	t.Run("複数日タスクは中間日をサボっても最終日まで予備日を消費しない", func(t *testing.T) {
		setToday("2026-07-02")
		_, token := newUser(t, "buf-fraction")
		// 実施12日, 予備日2, 有効10日。分量5 < 10 → 分数モード。
		// 有効10日 ÷ 5問 = 1問あたり2日。content 例: "問題集1問解く(1/2日目)" "(2/2日目)"
		taskID := newTaskWithVeg(t, token, "問題集", "buf-fraction", 5, 1, "2026-07-02", "2026-07-13", "かぼちゃ")

		// (1/2日目) だけ過ぎた状態（中間日）
		setToday("2026-07-03")
		req(t, "GET", "/api/subtasks/today", token, nil)
		if getTask(t, token, taskID)["buffer_days"].(float64) != 2 {
			t.Fatalf("中間日サボりで buffer_days が減った: %v", getTask(t, token, taskID)["buffer_days"])
		}

		// (2/2日目) まで過ぎた = 1問ぶん(2日)まるごと未達成 → 予備日を2消費
		setToday("2026-07-04")
		req(t, "GET", "/api/subtasks/today", token, nil)
		task := getTask(t, token, taskID)
		if task["buffer_days"].(float64) != 0 {
			t.Fatalf("1単位ぶんサボりで buffer_days 期待0, 実際 %v", task["buffer_days"])
		}
		if task["growth_stage"].(float64) == -1 {
			t.Fatalf("予備日2に対し2消費なので枯死しないはず")
		}
		var consumed int
		testDB.QueryRow(`SELECT count(*) FROM "SUB_TASKS" WHERE task_id=$1 AND task_content='予備日（消費済み）'`, taskID).Scan(&consumed)
		if consumed != 2 {
			t.Fatalf("予備日（消費済み）マーカー 期待2, 実際 %d", consumed)
		}
	})
}

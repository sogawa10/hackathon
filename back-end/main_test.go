package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

const mockToday = "2026-07-01"

var (
	testDB     *sql.DB
	testRouter *gin.Engine
)

func TestMain(m *testing.M) {
	_ = godotenv.Load()

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

func setToday(s string) { os.Setenv("MOCK_TODAY", s) }

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

func newUser(t *testing.T, label string) (userID, token string) {
	t.Helper()
	name := fmt.Sprintf("apitest_%d_%s", time.Now().UnixNano(), label)
	rec := req(t, "POST", "/api/signup", "", map[string]string{"user_name": name, "user_pass": "pass1234"})
	mustStatus(t, rec, 200)
	obj := decodeObj(t, rec)
	return obj["user_id"].(string), obj["access_token"].(string)
}

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

func day(offset int) string {
	base, _ := time.Parse("2006-01-02", mockToday)
	return base.AddDate(0, 0, offset).Format("2006-01-02")
}

func reqRaw(t *testing.T, method, path, authHeader, body string) *httptest.ResponseRecorder {
	t.Helper()
	httpReq := httptest.NewRequest(method, path, strings.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	if authHeader != "" {
		httpReq.Header.Set("Authorization", authHeader)
	}
	rec := httptest.NewRecorder()
	testRouter.ServeHTTP(rec, httpReq)
	return rec
}

func signToken(t *testing.T, method jwt.SigningMethod, claims jwt.MapClaims, key any) string {
	t.Helper()
	s, err := jwt.NewWithClaims(method, claims).SignedString(key)
	if err != nil {
		t.Fatalf("テスト用トークンの署名に失敗: %v", err)
	}
	return s
}

func taskBody(taskType string, total, lap int, start, end string) map[string]any {
	return map[string]any{
		"task_type": taskType, "task_title": taskType + "テスト", "total_count": total,
		"lap_count": lap, "start_date": start, "end_date": end,
	}
}

func newTask(t *testing.T, token string, body map[string]any) string {
	t.Helper()
	rec := req(t, "POST", "/api/tasks", token, body)
	mustStatus(t, rec, 200)
	return decodeObj(t, rec)["task_id"].(string)
}

type subRow struct {
	ID      string
	Date    string
	Content string
	Done    bool
}

func dbSubtasks(t *testing.T, taskID string) []subRow {
	t.Helper()
	rows, err := testDB.Query(`SELECT sub_task_id, scheduled_date, task_content, is_completed FROM "SUB_TASKS" WHERE task_id=$1 ORDER BY scheduled_date, task_content`, taskID)
	if err != nil {
		t.Fatalf("SUB_TASKS 取得失敗: %v", err)
	}
	defer rows.Close()
	var out []subRow
	for rows.Next() {
		var r subRow
		var d time.Time
		if err := rows.Scan(&r.ID, &d, &r.Content, &r.Done); err != nil {
			t.Fatalf("SUB_TASKS scan 失敗: %v", err)
		}
		r.Date = d.Format("2006-01-02")
		out = append(out, r)
	}
	return out
}

func todayEntry(t *testing.T, token, taskID string) map[string]any {
	t.Helper()
	rec := req(t, "GET", "/api/subtasks/today", token, nil)
	mustStatus(t, rec, 200)
	for _, o := range decodeArray(t, rec) {
		if o["task_id"] == taskID {
			return o
		}
	}
	return nil
}

func taskListHas(t *testing.T, token, taskID string) bool {
	t.Helper()
	rec := req(t, "GET", "/api/tasks", token, nil)
	mustStatus(t, rec, 200)
	for _, o := range decodeArray(t, rec) {
		if o["task_id"] == taskID {
			return true
		}
	}
	return false
}

func TestAuth(t *testing.T) {
	name := fmt.Sprintf("apitest_%d_auth", time.Now().UnixNano())

	t.Run("signup_成功", func(t *testing.T) {
		rec := req(t, "POST", "/api/signup", "", map[string]string{"user_name": name, "user_pass": "pass1234"})
		mustStatus(t, rec, 200)
		obj := decodeObj(t, rec)
		if obj["access_token"] == "" || obj["user_id"] == "" {
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
		if decodeObj(t, rec)["access_token"] == "" {
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

	t.Run("signup_レスポンスはuser_idとaccess_tokenのみ", func(t *testing.T) {
		rec := req(t, "POST", "/api/signup", "", map[string]string{"user_name": name + "_fields", "user_pass": "pass1234"})
		mustStatus(t, rec, 200)
		obj := decodeObj(t, rec)
		for _, k := range []string{"user_id", "access_token"} {
			if s, _ := obj[k].(string); s == "" {
				t.Fatalf("%s が空: %s", k, rec.Body.String())
			}
		}
		if _, ok := obj["refresh_token"]; ok {
			t.Fatalf("refresh_token を発行してはいけない: %s", rec.Body.String())
		}
	})

	t.Run("signup_パスワードは平文で保存されない", func(t *testing.T) {
		var stored string
		testDB.QueryRow(`SELECT user_pass FROM "USERS" WHERE user_name=$1`, name).Scan(&stored)
		if stored == "" || stored == "pass1234" || !strings.HasPrefix(stored, "$2") {
			t.Fatalf("bcrypt ハッシュで保存されていない: %q", stored)
		}
	})

	t.Run("signup_JSONでないボディは400", func(t *testing.T) {
		mustStatus(t, reqRaw(t, "POST", "/api/signup", "", "not json"), 400)
	})

	t.Run("login_パラメータ欠落は400", func(t *testing.T) {
		mustStatus(t, req(t, "POST", "/api/login", "", map[string]string{"user_name": name}), 400)
		mustStatus(t, req(t, "POST", "/api/login", "", map[string]string{"user_pass": "pass1234"}), 400)
	})

	t.Run("login_signupと同じuser_idが返り_そのトークンで認証APIを使える", func(t *testing.T) {
		var dbID string
		testDB.QueryRow(`SELECT user_id FROM "USERS" WHERE user_name=$1`, name).Scan(&dbID)
		rec := req(t, "POST", "/api/login", "", map[string]string{"user_name": name, "user_pass": "pass1234"})
		mustStatus(t, rec, 200)
		obj := decodeObj(t, rec)
		if obj["user_id"] != dbID {
			t.Fatalf("user_id 期待 %s, 実際 %v", dbID, obj["user_id"])
		}
		if _, ok := obj["refresh_token"]; ok {
			t.Fatalf("login が refresh_token を返した: %s", rec.Body.String())
		}
		mustStatus(t, req(t, "GET", "/api/tasks", obj["access_token"].(string), nil), 200)
	})
}

func TestAuthMiddlewareToken(t *testing.T) {
	userID, token := newUser(t, "jwt")
	secret := []byte(os.Getenv("JWT_SECRET"))
	future := time.Now().Add(time.Hour).Unix()

	cases := []struct {
		name   string
		header string
		want   int
	}{
		{"正規トークンは200", "Bearer " + token, 200},
		{"同じ秘密鍵で自作した有効トークンは200", "Bearer " + signToken(t, jwt.SigningMethodHS256, jwt.MapClaims{"user_id": userID, "exp": future}, secret), 200},
		{"Bearer接頭辞なしは401", token, 401},
		{"Bearer以外のスキームは401", "Token " + token, 401},
		{"小文字bearerは401", "bearer " + token, 401},
		{"余分なスペース区切りは401", "Bearer " + token + " extra", 401},
		{"期限切れトークンは401", "Bearer " + signToken(t, jwt.SigningMethodHS256, jwt.MapClaims{"user_id": userID, "exp": time.Now().Add(-time.Minute).Unix()}, secret), 401},
		{"別の秘密鍵で署名したトークンは401", "Bearer " + signToken(t, jwt.SigningMethodHS256, jwt.MapClaims{"user_id": userID, "exp": future}, []byte("other-secret")), 401},
		{"alg_noneのトークンは401", "Bearer " + signToken(t, jwt.SigningMethodNone, jwt.MapClaims{"user_id": userID, "exp": future}, jwt.UnsafeAllowNoneSignatureType), 401},
		{"user_idクレームが無いトークンは401", "Bearer " + signToken(t, jwt.SigningMethodHS256, jwt.MapClaims{"exp": future}, secret), 401},
		{"user_idが文字列でないトークンは401", "Bearer " + signToken(t, jwt.SigningMethodHS256, jwt.MapClaims{"user_id": 123, "exp": future}, secret), 401},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mustStatus(t, reqRaw(t, "GET", "/api/tasks", tc.header, ""), tc.want)
		})
	}

	t.Run("全ての認証必須APIがトークン無しで401", func(t *testing.T) {
		for _, ep := range []struct{ method, path string }{
			{"GET", "/api/subtasks/today"},
			{"PATCH", "/api/subtasks"},
			{"POST", "/api/tasks"},
			{"POST", "/api/vegetable/00000000-0000-0000-0000-000000000000"},
			{"GET", "/api/tasks"},
			{"DELETE", "/api/tasks/00000000-0000-0000-0000-000000000000"},
			{"POST", "/api/tasks/harvest"},
			{"GET", "/api/harvest_basket"},
		} {
			if rec := reqRaw(t, ep.method, ep.path, "", "{}"); rec.Code != 401 {
				t.Errorf("%s %s: 期待401, 実際 %d", ep.method, ep.path, rec.Code)
			}
		}
	})
}

func TestCORS(t *testing.T) {
	preflight := func(origin string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("OPTIONS", "/api/login", nil)
		r.Header.Set("Origin", origin)
		r.Header.Set("Access-Control-Request-Method", "POST")
		r.Header.Set("Access-Control-Request-Headers", "Content-Type, Authorization")
		rec := httptest.NewRecorder()
		testRouter.ServeHTTP(rec, r)
		return rec
	}

	for _, origin := range []string{"https://www.vegetask.net", "http://localhost:5173"} {
		t.Run("許可オリジン_"+origin, func(t *testing.T) {
			rec := preflight(origin)
			mustStatus(t, rec, 204)
			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != origin {
				t.Fatalf("Access-Control-Allow-Origin 期待 %s, 実際 %q", origin, got)
			}
		})
	}

	for _, origin := range []string{"https://evil.example.com", "http://www.vegetask.net", "https://vegetask.net"} {
		t.Run("未許可オリジン_"+origin, func(t *testing.T) {
			rec := preflight(origin)
			mustStatus(t, rec, 403)
			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
				t.Fatalf("未許可オリジンに Access-Control-Allow-Origin が付いた: %q", got)
			}
		})
	}
}

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
			"lap_count": 1, "start_date": day(0), "end_date": day(5),
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
		var cnt int
		testDB.QueryRow(`SELECT count(*) FROM "SUB_TASKS" WHERE task_id=$1`, taskID).Scan(&cnt)
		if cnt != 14 {
			t.Fatalf("SUB_TASKS 行数 期待14, 実際 %d", cnt)
		}
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
			"lap_count": 1, "start_date": day(0), "end_date": day(29),
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

func TestTaskCreateValidation(t *testing.T) {
	_, token := newUser(t, "validate")

	with := func(mod func(b map[string]any)) map[string]any {
		b := taskBody("問題集", 10, 1, day(0), day(9))
		mod(b)
		return b
	}

	cases := []struct {
		name string
		body map[string]any
		want int
	}{
		{"ちょうど7日間は作成できる", taskBody("問題集", 10, 1, day(0), day(6)), 200},
		{"6日間は400", taskBody("問題集", 10, 1, day(0), day(5)), 400},
		{"終了日が開始日より前は400", taskBody("問題集", 10, 1, day(10), day(0)), 400},
		{"開始日と終了日が同じは400", taskBody("問題集", 10, 1, day(0), day(0)), 400},
		{"task_type欠落は400", with(func(b map[string]any) { delete(b, "task_type") }), 400},
		{"task_type空文字は400", with(func(b map[string]any) { b["task_type"] = "" }), 400},
		{"task_title欠落は400", with(func(b map[string]any) { delete(b, "task_title") }), 400},
		{"total_count欠落は400", with(func(b map[string]any) { delete(b, "total_count") }), 400},
		{"total_count0は400", with(func(b map[string]any) { b["total_count"] = 0 }), 400},
		{"total_count負数は400", with(func(b map[string]any) { b["total_count"] = -5 }), 400},
		{"total_countが文字列は400", with(func(b map[string]any) { b["total_count"] = "10" }), 400},
		{"start_date欠落は400", with(func(b map[string]any) { delete(b, "start_date") }), 400},
		{"end_date欠落は400", with(func(b map[string]any) { delete(b, "end_date") }), 400},
		{"start_dateがスラッシュ区切りは400", with(func(b map[string]any) { b["start_date"] = "2026/07/01" }), 400},
		{"end_dateが日本語表記は400", with(func(b map[string]any) { b["end_date"] = "7月10日" }), 400},
		{"存在しない日付は400", with(func(b map[string]any) { b["end_date"] = "2026-02-30" }), 400},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mustStatus(t, req(t, "POST", "/api/tasks", token, tc.body), tc.want)
		})
	}

	t.Run("JSONでないボディは400", func(t *testing.T) {
		mustStatus(t, reqRaw(t, "POST", "/api/tasks", "Bearer "+token, "not json"), 400)
	})

	t.Run("lap_count省略や0は1として保存される", func(t *testing.T) {
		for _, lap := range []any{nil, 0, -3} {
			b := taskBody("単語帳", 10, 1, day(0), day(9))
			if lap == nil {
				delete(b, "lap_count")
			} else {
				b["lap_count"] = lap
			}
			taskID := newTask(t, token, b)
			var got int
			testDB.QueryRow(`SELECT lap_count FROM "TASKS" WHERE task_id=$1`, taskID).Scan(&got)
			if got != 1 {
				t.Fatalf("lap_count=%v のとき 期待1, 実際 %d", lap, got)
			}
		}
	})

	t.Run("作成直後はgrowth_stage0_野菜未割当_スロット未確定", func(t *testing.T) {
		taskID := newTask(t, token, taskBody("問題集", 10, 1, day(0), day(9)))
		var g int
		var veg sql.NullString
		testDB.QueryRow(`SELECT growth_stage, vegetable_id FROM "TASKS" WHERE task_id=$1`, taskID).Scan(&g, &veg)
		if g != 0 || veg.Valid {
			t.Fatalf("growth_stage=%d vegetable_id=%v", g, veg)
		}
		if _, ok := dbFieldPosition(t, taskID); ok {
			t.Fatalf("野菜割当前に field_position が確定している")
		}
	})
}

func TestTaskSize(t *testing.T) {
	_, token := newUser(t, "size")

	cases := []struct {
		name     string
		taskType string
		total    int
		lap      int
		days     int
		want     string
	}{
		{"その他_少量_7日はS", "その他", 5, 1, 7, "S"},
		{"過去問_1年分_7日はM", "過去問", 1, 1, 7, "M"},
		{"問題集_50問_7日はL", "問題集", 50, 1, 7, "L"},
		{"単語帳_1000語1周_7日はS", "単語帳", 1000, 1, 7, "S"},
		{"単語帳_1000語2周_7日はM", "単語帳", 1000, 2, 7, "M"},
		{"その他_56日は期間スコア1.6でS", "その他", 5, 1, 56, "S"},
		{"その他_57日は期間スコア2.0でM", "その他", 5, 1, 57, "M"},
		{"その他_70日は期間スコア2.4でM", "その他", 5, 1, 70, "M"},
		{"問題集_40問_70日はM", "問題集", 40, 1, 70, "M"},
		{"問題集_60問_70日はM", "問題集", 60, 1, 70, "M"},
		{"問題集_100問_70日はL", "問題集", 100, 1, 70, "L"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := req(t, "POST", "/api/tasks", token, taskBody(tc.taskType, tc.total, tc.lap, day(0), day(tc.days-1)))
			mustStatus(t, rec, 200)
			if got := decodeObj(t, rec)["size"]; got != tc.want {
				t.Fatalf("size 期待 %s, 実際 %v", tc.want, got)
			}
		})
	}
}

func TestSubtaskGeneration(t *testing.T) {
	_, token := newUser(t, "gen")

	checkDates := func(t *testing.T, rows []subRow, start string, execDays int) {
		t.Helper()
		if len(rows) != execDays {
			t.Fatalf("SUB_TASKS 行数 期待 %d, 実際 %d", execDays, len(rows))
		}
		base, _ := time.Parse("2006-01-02", start)
		for i, r := range rows {
			if want := base.AddDate(0, 0, i).Format("2006-01-02"); r.Date != want {
				t.Fatalf("%d 行目の日付 期待 %s, 実際 %s", i, want, r.Date)
			}
			if r.Done {
				t.Fatalf("作成直後に完了済みのサブタスクがある: %+v", r)
			}
		}
	}

	t.Run("通常モード_種別ごとの文言と_ノルマ合計が分量と一致", func(t *testing.T) {
		cases := []struct {
			taskType string
			total    int
			lap      int
			days     int
			pattern  string
			sum      int
		}{
			{"問題集", 40, 1, 10, `^(\d+)問解く$`, 40},
			{"単語帳", 100, 3, 14, `^(\d+)単語覚える$`, 300},
			{"過去問", 20, 1, 7, `^(\d+)年分解く$`, 20},
			{"その他", 61, 1, 7, `^(\d+)ページする$`, 61},
		}
		for _, tc := range cases {
			taskID := newTask(t, token, taskBody(tc.taskType, tc.total, tc.lap, day(0), day(tc.days-1)))
			rows := dbSubtasks(t, taskID)
			checkDates(t, rows, day(0), tc.days)

			buffer := (tc.days + 9) / 10
			valid := tc.days - buffer
			re := regexp.MustCompile(tc.pattern)
			sum := 0
			base := tc.sum / valid
			for i, r := range rows {
				if i >= valid {
					if r.Content != "予備日（調整期間）" {
						t.Fatalf("%s: 末尾 %d 日は予備日のはず: %q", tc.taskType, buffer, r.Content)
					}
					continue
				}
				m := re.FindStringSubmatch(r.Content)
				if m == nil {
					t.Fatalf("%s: 文言が想定外: %q", tc.taskType, r.Content)
				}
				n, _ := strconv.Atoi(m[1])
				if n != base && n != base+1 {
					t.Fatalf("%s: 1日のノルマは %d か %d のはず: %d", tc.taskType, base, base+1, n)
				}
				sum += n
			}
			if sum != tc.sum {
				t.Fatalf("%s: ノルマ合計 期待 %d, 実際 %d", tc.taskType, tc.sum, sum)
			}
		}
	})

	t.Run("端数モード_1単位が複数日にまたがる", func(t *testing.T) {
		taskID := newTask(t, token, taskBody("問題集", 2, 1, day(0), day(6)))
		rows := dbSubtasks(t, taskID)
		checkDates(t, rows, day(0), 7)
		want := []string{
			"問題集1問解く(1/3日目)", "問題集1問解く(2/3日目)", "問題集1問解く(3/3日目)",
			"問題集1問解く(1/3日目)", "問題集1問解く(2/3日目)", "問題集1問解く(3/3日目)",
			"予備日（調整期間）",
		}
		for i, r := range rows {
			if r.Content != want[i] {
				t.Fatalf("%d 日目 期待 %q, 実際 %q", i+1, want[i], r.Content)
			}
		}
	})

	t.Run("端数モード_割り切れない日数は後ろの単位に配分される", func(t *testing.T) {
		taskID := newTask(t, token, taskBody("問題集", 5, 1, day(0), day(6)))
		rows := dbSubtasks(t, taskID)
		want := []string{
			"問題集1問解く(1/1日目)", "問題集1問解く(1/1日目)", "問題集1問解く(1/1日目)", "問題集1問解く(1/1日目)",
			"問題集1問解く(1/2日目)", "問題集1問解く(2/2日目)",
			"予備日（調整期間）",
		}
		for i, r := range rows {
			if r.Content != want[i] {
				t.Fatalf("%d 日目 期待 %q, 実際 %q", i+1, want[i], r.Content)
			}
		}
	})

	t.Run("端数モード_種別ごとの文言", func(t *testing.T) {
		for tt, prefix := range map[string]string{
			"単語帳": "単語帳1単語覚える(", "過去問": "過去問1年分解く(", "その他": "その他1ページする(",
		} {
			taskID := newTask(t, token, taskBody(tt, 2, 1, day(0), day(6)))
			if c := dbSubtasks(t, taskID)[0].Content; !strings.HasPrefix(c, prefix) {
				t.Fatalf("%s: 文言 期待 %q で始まる, 実際 %q", tt, prefix, c)
			}
		}
	})

	t.Run("分量と有効日数が同じなら1日1単位の通常モード", func(t *testing.T) {
		taskID := newTask(t, token, taskBody("問題集", 6, 1, day(0), day(6)))
		for i, r := range dbSubtasks(t, taskID)[:6] {
			if r.Content != "1問解く" {
				t.Fatalf("%d 日目 期待 %q, 実際 %q", i+1, "1問解く", r.Content)
			}
		}
	})
}

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

func TestVegetableSlots(t *testing.T) {
	t.Run("15種類すべての野菜を割り当てられる", func(t *testing.T) {
		_, token := newUser(t, "veg-all")
		for _, v := range []string{
			"プチトマト", "オクラ", "枝豆", "シイタケ", "ネギ",
			"赤パプリカ", "ピーマン", "なす", "キュウリ", "タケノコ",
			"キャベツ", "かぼちゃ", "トウモロコシ", "ブロッコリー", "カリフラワー",
		} {
			taskID := newTask(t, token, taskBody("問題集", 10, 1, day(0), day(6)))
			mustStatus(t, req(t, "POST", "/api/vegetable/"+taskID, token, map[string]string{"vegetable_name": v}), 200)
			if getTask(t, token, taskID)["vegetable_name"] != v {
				t.Fatalf("vegetable_name が %s になっていない", v)
			}
		}
	})

	t.Run("vegetable_name欠落は400", func(t *testing.T) {
		_, token := newUser(t, "veg-missing")
		taskID := newTask(t, token, taskBody("問題集", 10, 1, day(0), day(6)))
		mustStatus(t, req(t, "POST", "/api/vegetable/"+taskID, token, map[string]string{}), 400)
		mustStatus(t, reqRaw(t, "POST", "/api/vegetable/"+taskID, "Bearer "+token, "not json"), 400)
	})

	t.Run("25スロットを中央寄せ順に埋め_26個目はスロット無しで割り当てだけ成功", func(t *testing.T) {
		_, token := newUser(t, "veg-full")
		want := []int{12, 8, 16, 4, 20, 18, 14, 22, 24, 6, 2, 10, 0, 13, 17, 9, 21, 19, 23, 7, 11, 3, 15, 1, 5}
		for i, slot := range want {
			taskID := newTaskWithVeg(t, token, "問題集", fmt.Sprintf("full-%d", i), 10, 1, day(0), day(6), "オクラ")
			if p, ok := dbFieldPosition(t, taskID); !ok || p != slot {
				t.Fatalf("%d 個目 field_position 期待 %d, 実際 %d (valid=%v)", i+1, slot, p, ok)
			}
		}
		overflow := newTaskWithVeg(t, token, "問題集", "full-26", 10, 1, day(0), day(6), "オクラ")
		if _, ok := dbFieldPosition(t, overflow); ok {
			t.Fatalf("26 個目にスロットが割り当てられた")
		}
		if getTask(t, token, overflow)["field_position"] != nil {
			t.Fatalf("一覧の field_position は null のはず")
		}
	})

	t.Run("枯れたタスクのスロットは解放され再利用される", func(t *testing.T) {
		_, token := newUser(t, "veg-wither")
		first := newTaskWithVeg(t, token, "問題集", "wither-1", 10, 1, day(0), day(6), "オクラ")
		testDB.Exec(`UPDATE "TASKS" SET growth_stage=-1 WHERE task_id=$1`, first)
		second := newTaskWithVeg(t, token, "問題集", "wither-2", 10, 1, day(0), day(6), "オクラ")
		if p, _ := dbFieldPosition(t, second); p != 12 {
			t.Fatalf("枯死で解放されたスロット 期待12, 実際 %d", p)
		}
	})

	t.Run("削除したタスクのスロットは再利用される", func(t *testing.T) {
		_, token := newUser(t, "veg-delete")
		first := newTaskWithVeg(t, token, "問題集", "del-1", 10, 1, day(0), day(6), "オクラ")
		mustStatus(t, req(t, "DELETE", "/api/tasks/"+first, token, nil), 200)
		second := newTaskWithVeg(t, token, "問題集", "del-2", 10, 1, day(0), day(6), "オクラ")
		if p, _ := dbFieldPosition(t, second); p != 12 {
			t.Fatalf("削除で解放されたスロット 期待12, 実際 %d", p)
		}
	})

	t.Run("スロットはユーザーごとに独立", func(t *testing.T) {
		_, tokenA := newUser(t, "veg-userA")
		_, tokenB := newUser(t, "veg-userB")
		a := newTaskWithVeg(t, tokenA, "問題集", "a", 10, 1, day(0), day(6), "オクラ")
		b := newTaskWithVeg(t, tokenB, "問題集", "b", 10, 1, day(0), day(6), "オクラ")
		pa, _ := dbFieldPosition(t, a)
		pb, _ := dbFieldPosition(t, b)
		if pa != 12 || pb != 12 {
			t.Fatalf("どちらも中央(12)のはず: A=%d B=%d", pa, pb)
		}
	})
}

func TestTaskListAndTodayFilters(t *testing.T) {
	_, token := newUser(t, "filters")

	t.Run("タスクが無ければ一覧もToDoもかごも空配列", func(t *testing.T) {
		for _, path := range []string{"/api/tasks", "/api/subtasks/today", "/api/harvest_basket"} {
			rec := req(t, "GET", path, token, nil)
			mustStatus(t, rec, 200)
			if strings.TrimSpace(rec.Body.String()) != "[]" {
				t.Fatalf("%s: 期待 [], 実際 %s", path, rec.Body.String())
			}
		}
	})

	noVeg := newTask(t, token, taskBody("問題集", 10, 1, day(0), day(6)))
	active := newTaskWithVeg(t, token, "単語帳", "active", 100, 2, day(0), day(13), "なす")
	future := newTaskWithVeg(t, token, "問題集", "future", 10, 1, day(1), day(7), "オクラ")
	done := newTaskWithVeg(t, token, "問題集", "done", 10, 1, day(0), day(6), "ネギ")
	testDB.Exec(`UPDATE "TASKS" SET growth_stage=10 WHERE task_id=$1`, done)

	t.Run("野菜未割当のタスクは一覧にもToDoにも出ない", func(t *testing.T) {
		if taskListHas(t, token, noVeg) {
			t.Fatalf("野菜未割当タスクが一覧に出た")
		}
		if todayEntry(t, token, noVeg) != nil {
			t.Fatalf("野菜未割当タスクがToDoに出た")
		}
	})

	t.Run("一覧は入力値をそのまま返す", func(t *testing.T) {
		o := getTask(t, token, active)
		if o["task_type"] != "単語帳" || o["task_title"] != "active" ||
			o["total_count"].(float64) != 100 || o["lap_count"].(float64) != 2 ||
			o["start_date"] != day(0) || o["end_date"] != day(13) || o["buffer_days"].(float64) != 2 {
			t.Fatalf("一覧の値が不正: %v", o)
		}
	})

	t.Run("一覧は開始日の新しい順", func(t *testing.T) {
		rec := req(t, "GET", "/api/tasks", token, nil)
		arr := decodeArray(t, rec)
		if len(arr) != 3 || arr[0]["task_id"] != future {
			t.Fatalf("先頭は開始日が最も新しい future のはず: %s", rec.Body.String())
		}
	})

	t.Run("今日のToDoのレスポンス形式", func(t *testing.T) {
		o := todayEntry(t, token, active)
		if o == nil {
			t.Fatalf("進行中タスクがToDoに無い")
		}
		for _, k := range []string{"sub_task_id", "task_id", "scheduled_date", "task_type", "task_title", "task_content", "is_completed", "vegetable_name", "growth_stage", "field_position", "is_checkable"} {
			if _, ok := o[k]; !ok {
				t.Fatalf("フィールド %s が無い: %v", k, o)
			}
		}
		if o["task_content"] != "16単語覚える" || o["is_checkable"] != true || o["is_completed"] != false || o["vegetable_name"] != "なす" {
			t.Fatalf("ToDo の値が不正: %v", o)
		}
	})

	t.Run("開始前のタスクは今日のToDoに出ない", func(t *testing.T) {
		if todayEntry(t, token, future) != nil {
			t.Fatalf("未来開始のタスクが今日のToDoに出た")
		}
	})

	t.Run("収穫可能(growth_stage10)のタスクは今日のToDoに出ない", func(t *testing.T) {
		if todayEntry(t, token, done) != nil {
			t.Fatalf("growth_stage 10 のタスクが今日のToDoに出た")
		}
	})
}

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

func TestCompleteSubtaskAndGrowth(t *testing.T) {
	_, token := newUser(t, "complete")
	taskID := newTaskWithVeg(t, token, "問題集", "complete-task", 40, 1, day(0), day(9), "プチトマト")

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

func TestCompleteSubtaskEdgeCases(t *testing.T) {
	savedToday := os.Getenv("MOCK_TODAY")
	defer setToday(savedToday)

	_, token := newUser(t, "complete-edge")

	t.Run("sub_task_id欠落は400", func(t *testing.T) {
		mustStatus(t, req(t, "PATCH", "/api/subtasks", token, map[string]string{}), 400)
		mustStatus(t, reqRaw(t, "PATCH", "/api/subtasks", "Bearer "+token, "not json"), 400)
	})

	t.Run("予備日のサブタスクをチェックしても成長しない", func(t *testing.T) {
		taskID := newTaskWithVeg(t, token, "問題集", "buffer-check", 12, 1, day(0), day(6), "オクラ")
		req(t, "GET", "/api/tasks", token, nil)
		var bufID string
		testDB.QueryRow(`SELECT sub_task_id FROM "SUB_TASKS" WHERE task_id=$1 AND task_content='予備日（調整期間）'`, taskID).Scan(&bufID)
		rec := req(t, "PATCH", "/api/subtasks", token, map[string]string{"sub_task_id": bufID})
		mustStatus(t, rec, 200)
		if g := decodeObj(t, rec)["growth_stage"].(float64); g != 1 {
			t.Fatalf("growth_stage 期待1, 実際 %v", g)
		}
	})

	t.Run("growth_stageは完了数に比例して1から10まで上がる", func(t *testing.T) {
		taskID := newTaskWithVeg(t, token, "問題集", "growth", 12, 1, day(0), day(6), "オクラ")
		want := []float64{2, 4, 5, 7, 8, 10}
		for i, r := range dbSubtasks(t, taskID)[:6] {
			rec := req(t, "PATCH", "/api/subtasks", token, map[string]string{"sub_task_id": r.ID})
			mustStatus(t, rec, 200)
			if g := decodeObj(t, rec)["growth_stage"].(float64); g != want[i] {
				t.Fatalf("%d 件完了時 growth_stage 期待 %v, 実際 %v", i+1, want[i], g)
			}
		}
		if dbGrowthStage(t, taskID) != 10 {
			t.Fatalf("DB の growth_stage が10になっていない")
		}
		if todayEntry(t, token, taskID) != nil {
			t.Fatalf("収穫可能になったタスクが今日のToDoに残っている")
		}
	})

	t.Run("端数モード_途中日はチェック不可_最終日のチェックで単位全体が完了", func(t *testing.T) {
		setToday(day(0))
		taskID := newTaskWithVeg(t, token, "問題集", "fraction", 2, 1, day(0), day(6), "オクラ")

		first := todayEntry(t, token, taskID)
		if first == nil || first["task_content"] != "問題集1問解く(1/3日目)" || first["is_checkable"] != false {
			t.Fatalf("1日目は is_checkable=false のはず: %v", first)
		}
		mustStatus(t, req(t, "PATCH", "/api/subtasks", token, map[string]string{"sub_task_id": first["sub_task_id"].(string)}), 400)

		setToday(day(2))
		last := todayEntry(t, token, taskID)
		if last == nil || last["task_content"] != "問題集1問解く(3/3日目)" || last["is_checkable"] != true {
			t.Fatalf("3日目は is_checkable=true のはず: %v", last)
		}
		if getTask(t, token, taskID)["buffer_days"].(float64) != 1 {
			t.Fatalf("途中日を跨いだだけで予備日が消費された")
		}

		rec := req(t, "PATCH", "/api/subtasks", token, map[string]string{"sub_task_id": last["sub_task_id"].(string)})
		mustStatus(t, rec, 200)
		if g := decodeObj(t, rec)["growth_stage"].(float64); g != 5 {
			t.Fatalf("growth_stage 期待5, 実際 %v", g)
		}
		for i, r := range dbSubtasks(t, taskID)[:6] {
			if wantDone := i < 3; r.Done != wantDone {
				t.Fatalf("%d 日目 is_completed 期待 %v, 実際 %v", i+1, wantDone, r.Done)
			}
		}
	})
}

func TestUserIsolation(t *testing.T) {
	_, ownerToken := newUser(t, "owner")
	_, otherToken := newUser(t, "intruder")

	taskID := newTaskWithVeg(t, ownerToken, "問題集", "owner-task", 12, 1, day(0), day(6), "オクラ")
	subID := todaySubID(t, ownerToken, taskID)
	if subID == "" {
		t.Fatalf("前提: 所有者の今日のサブタスクが無い")
	}

	t.Run("他人のタスクは一覧に出ない", func(t *testing.T) {
		if taskListHas(t, otherToken, taskID) {
			t.Fatalf("他人のタスクが一覧に出た")
		}
	})

	t.Run("他人のサブタスクは今日のToDoに出ない", func(t *testing.T) {
		if todayEntry(t, otherToken, taskID) != nil {
			t.Fatalf("他人のサブタスクがToDoに出た")
		}
	})

	t.Run("他人のサブタスクは完了できない", func(t *testing.T) {
		mustStatus(t, req(t, "PATCH", "/api/subtasks", otherToken, map[string]string{"sub_task_id": subID}), 404)
		for _, r := range dbSubtasks(t, taskID) {
			if r.ID == subID && r.Done {
				t.Fatalf("他人の操作でサブタスクが完了になった")
			}
		}
	})

	t.Run("他人のタスクは削除できない", func(t *testing.T) {
		mustStatus(t, req(t, "DELETE", "/api/tasks/"+taskID, otherToken, nil), 404)
		if !taskListHas(t, ownerToken, taskID) {
			t.Fatalf("他人の操作でタスクが削除された")
		}
	})

	t.Run("他人のタスクは収穫できず_かごにも入らない", func(t *testing.T) {
		testDB.Exec(`UPDATE "TASKS" SET growth_stage=10 WHERE task_id=$1`, taskID)
		mustStatus(t, req(t, "POST", "/api/tasks/harvest", otherToken, map[string]string{"task_id": taskID}), 400)
		if dbGrowthStage(t, taskID) != 10 {
			t.Fatalf("他人の操作で収穫された")
		}
		mustStatus(t, req(t, "POST", "/api/tasks/harvest", ownerToken, map[string]string{"task_id": taskID}), 200)
		rec := req(t, "GET", "/api/harvest_basket", otherToken, nil)
		mustStatus(t, rec, 200)
		if len(decodeArray(t, rec)) != 0 {
			t.Fatalf("他人の収穫物がかごに入っている: %s", rec.Body.String())
		}
	})
}

func TestHarvestAndBasket(t *testing.T) {
	_, token := newUser(t, "harvest")
	taskID := newTaskWithVeg(t, token, "問題集", "harvest-task", 40, 1, day(0), day(9), "プチトマト")

	t.Run("growth_stage10未満の収穫は400", func(t *testing.T) {
		rec := req(t, "POST", "/api/tasks/harvest", token, map[string]string{"task_id": taskID})
		mustStatus(t, rec, 400)
	})

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
		newTask := newTaskWithVeg(t, token, "問題集", "harvest-after", 40, 1, day(0), day(9), "オクラ")
		if p, _ := dbFieldPosition(t, newTask); p != 12 {
			t.Fatalf("解放スロットの再利用 期待12, 実際 %d", p)
		}
	})
}

func TestHarvestEdgeCases(t *testing.T) {
	_, token := newUser(t, "harvest-edge")

	t.Run("task_id欠落は400", func(t *testing.T) {
		mustStatus(t, req(t, "POST", "/api/tasks/harvest", token, map[string]string{}), 400)
		mustStatus(t, reqRaw(t, "POST", "/api/tasks/harvest", "Bearer "+token, "not json"), 400)
	})

	t.Run("存在しないタスクの収穫は400", func(t *testing.T) {
		mustStatus(t, req(t, "POST", "/api/tasks/harvest", token, map[string]string{"task_id": "00000000-0000-0000-0000-000000000000"}), 400)
	})

	t.Run("枯れたタスクは収穫できない", func(t *testing.T) {
		taskID := newTaskWithVeg(t, token, "問題集", "withered", 10, 1, day(0), day(6), "オクラ")
		testDB.Exec(`UPDATE "TASKS" SET growth_stage=-1 WHERE task_id=$1`, taskID)
		mustStatus(t, req(t, "POST", "/api/tasks/harvest", token, map[string]string{"task_id": taskID}), 400)
	})

	t.Run("収穫済みタスクの二重収穫は400で_かごには1つだけ", func(t *testing.T) {
		taskID := newTaskWithVeg(t, token, "問題集", "twice", 10, 1, day(0), day(6), "キャベツ")
		testDB.Exec(`UPDATE "TASKS" SET growth_stage=10 WHERE task_id=$1`, taskID)
		rec := req(t, "POST", "/api/tasks/harvest", token, map[string]string{"task_id": taskID})
		mustStatus(t, rec, 200)
		obj := decodeObj(t, rec)
		if obj["harvest_id"] != taskID || obj["size"] != "L" {
			t.Fatalf("収穫レスポンス不正: %v", obj)
		}
		mustStatus(t, req(t, "POST", "/api/tasks/harvest", token, map[string]string{"task_id": taskID}), 400)

		rec = req(t, "GET", "/api/harvest_basket", token, nil)
		count := 0
		for _, o := range decodeArray(t, rec) {
			if o["task_id"] == taskID {
				count++
				if o["harvest_id"] != taskID || o["vegetable_size"] != "L" || o["harvested_at"] != day(6) {
					t.Fatalf("かごの内容が不正: %v", o)
				}
			}
		}
		if count != 1 {
			t.Fatalf("かごの件数 期待1, 実際 %d", count)
		}
	})

	t.Run("かごは終了日の新しい順_枯れたタスクは入らない", func(t *testing.T) {
		_, token := newUser(t, "basket-order")
		older := newTaskWithVeg(t, token, "問題集", "older", 10, 1, day(0), day(6), "プチトマト")
		newer := newTaskWithVeg(t, token, "問題集", "newer", 10, 1, day(0), day(20), "なす")
		dead := newTaskWithVeg(t, token, "問題集", "dead", 10, 1, day(0), day(30), "ネギ")
		testDB.Exec(`UPDATE "TASKS" SET growth_stage=11 WHERE task_id IN ($1, $2)`, older, newer)
		testDB.Exec(`UPDATE "TASKS" SET growth_stage=-1 WHERE task_id=$1`, dead)

		rec := req(t, "GET", "/api/harvest_basket", token, nil)
		arr := decodeArray(t, rec)
		if len(arr) != 2 || arr[0]["task_id"] != newer || arr[1]["task_id"] != older {
			t.Fatalf("かごの並び・件数が不正: %s", rec.Body.String())
		}
		if arr[0]["vegetable_size"] != "M" || arr[1]["vegetable_size"] != "S" {
			t.Fatalf("vegetable_size が不正: %s", rec.Body.String())
		}
	})
}

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

func TestBufferConsumptionAndWithering(t *testing.T) {
	savedToday := os.Getenv("MOCK_TODAY")
	defer setToday(savedToday)

	t.Run("期限内に完了すれば予備日は減らない", func(t *testing.T) {
		setToday("2026-07-02")
		_, token := newUser(t, "buf-ontime")
		taskID := newTaskWithVeg(t, token, "問題集", "buf-ontime", 12, 1, "2026-07-02", "2026-07-08", "プチトマト")

		sub := todaySubID(t, token, taskID)
		if sub == "" {
			t.Fatalf("7/2 のサブタスクが取得できない")
		}
		mustStatus(t, req(t, "PATCH", "/api/subtasks", token, map[string]string{"sub_task_id": sub}), 200)

		setToday("2026-07-03")
		req(t, "GET", "/api/subtasks/today", token, nil)

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

		setToday("2026-07-03")
		req(t, "GET", "/api/subtasks/today", token, nil)

		task := getTask(t, token, taskID)
		if task["buffer_days"].(float64) != 0 {
			t.Fatalf("buffer_days 期待0（1消費）, 実際 %v", task["buffer_days"])
		}
		if task["growth_stage"].(float64) != 1 {
			t.Fatalf("growth_stage 期待1（枯れていない）, 実際 %v", task["growth_stage"])
		}
		var consumed int
		testDB.QueryRow(`SELECT count(*) FROM "SUB_TASKS" WHERE task_id=$1 AND task_content='予備日（消費済み）' AND is_completed=true`, taskID).Scan(&consumed)
		if consumed != 1 {
			t.Fatalf("予備日（消費済み）マーカー 期待1, 実際 %d", consumed)
		}
		if todaySubID(t, token, taskID) == "" {
			t.Fatalf("シフト後、7/3 に今日のサブタスクが無い")
		}
	})

	t.Run("予備日を超えてサボると枯死しToDoから消える", func(t *testing.T) {
		setToday("2026-07-02")
		_, token := newUser(t, "buf-wither")
		taskID := newTaskWithVeg(t, token, "問題集", "buf-wither", 12, 1, "2026-07-02", "2026-07-08", "ネギ")

		setToday("2026-07-03")
		req(t, "GET", "/api/subtasks/today", token, nil)
		if getTask(t, token, taskID)["buffer_days"].(float64) != 0 {
			t.Fatalf("前提: buffer_days が0になっていない")
		}

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

		taskID := newTaskWithVeg(t, token, "問題集", "buf-fraction", 5, 1, "2026-07-02", "2026-07-13", "かぼちゃ")

		setToday("2026-07-03")
		req(t, "GET", "/api/subtasks/today", token, nil)
		if getTask(t, token, taskID)["buffer_days"].(float64) != 2 {
			t.Fatalf("中間日サボりで buffer_days が減った: %v", getTask(t, token, taskID)["buffer_days"])
		}

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

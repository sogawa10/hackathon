package handlers

import (
	"database/sql"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TaskCreateRequest struct {
	TaskType   string `json:"task_type" binding:"required"`
	TaskTitle  string `json:"task_title" binding:"required"`
	TotalCount int    `json:"total_count" binding:"required"`
	LapCount   int    `json:"lap_count"`
	StartDate  string `json:"start_date" binding:"required"`
	EndDate    string `json:"end_date" binding:"required"`
}

type TaskCreateResponse struct {
	TaskID string `json:"task_id"`
	Size   string `json:"size"`
}

func CreateTaskHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctxUserID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "認証情報が見つかりません。再ログインしてください"})
			return
		}

		userID, ok := ctxUserID.(string)
		if !ok || userID == "" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ユーザーIDの解析に失敗しました"})
			return
		}

		var req TaskCreateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "リクエストの形式が不正です"})
			return
		}

		if req.LapCount <= 0 {
			req.LapCount = 1
		}

		const layout = "2006-01-02"
		start, err := time.Parse(layout, req.StartDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "開始日の形式が不正です"})
			return
		}
		end, err := time.Parse(layout, req.EndDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "終了日の形式が不正です"})
			return
		}

		execDays := int(end.Sub(start).Hours()/24) + 1

		if execDays < 7 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "1週間未満のタスクは入力不可です"})
			return
		}

		bufferDays := int(math.Ceil(float64(execDays) * 0.1))
		validDays := execDays - bufferDays

		if validDays <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "有効日数の計算に失敗しました"})
			return
		}

		var typeScore float64
		var dailyScore float64

		switch req.TaskType {
		case "問題集":
			typeScore = 1.5
			dailyScore = (float64(req.TotalCount) / float64(validDays)) * 0.7
		case "単語帳":
			typeScore = 1.0
			dailyScore = (float64(req.TotalCount*req.LapCount) / float64(validDays)) * 0.01
		case "過去問":
			typeScore = 2.5
			dailyScore = (float64(req.TotalCount) / float64(validDays)) * 3.0
		case "その他":
			typeScore = 1.0
			dailyScore = (float64(req.TotalCount) / float64(validDays)) * 0.3
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "不正なタスクタイプです"})
			return
		}

		D := typeScore + dailyScore

		var P float64
		switch {
		case execDays >= 7 && execDays <= 16:
			P = 0.0
		case execDays >= 17 && execDays <= 26:
			P = 0.4
		case execDays >= 27 && execDays <= 36:
			P = 0.8
		case execDays >= 37 && execDays <= 46:
			P = 1.2
		case execDays >= 47 && execDays <= 56:
			P = 1.6
		case execDays >= 57 && execDays <= 65:
			P = 2.0
		case execDays > 65:
			P = 2.4
		}

		S := D + P

		var size string
		if S < 2.8 {
			size = "S"
		} else if S >= 2.8 && S < 5.0 {
			size = "M"
		} else {
			size = "L"
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラー"})
			return
		}
		defer tx.Rollback()

		taskID := uuid.New().String()

		queryInsertTask := `
			INSERT INTO "TASKS" (
				"task_id", "user_id", "task_type", "task_title", 
				"start_date", "end_date", "total_count", "lap_count", "buffer_days", "growth_stage"
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`

		_, err = tx.Exec(queryInsertTask, taskID, userID, req.TaskType, req.TaskTitle, req.StartDate, req.EndDate, req.TotalCount, req.LapCount, bufferDays, 0)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "タスクの登録に失敗しました: " + err.Error()})
			return
		}

		var totalAmount int
		if req.TaskType == "単語帳" {
			totalAmount = req.TotalCount * req.LapCount
		} else {
			totalAmount = req.TotalCount
		}

		queryInsertSubTask := `
			INSERT INTO "SUB_TASKS" ("sub_task_id", "task_id", "scheduled_date", "task_content", "is_completed") 
			VALUES ($1, $2, $3, $4, $5)`

		isFractionMode := totalAmount < validDays

		if isFractionMode {
			baseDaysPerTask := validDays / totalAmount
			remainderDays := validDays % totalAmount
			errorAccumulator := 0

			currentDateIndex := 0

			for taskCounter := 1; taskCounter <= totalAmount; taskCounter++ {
				daysForThisTask := baseDaysPerTask
				errorAccumulator += remainderDays
				if errorAccumulator >= totalAmount {
					daysForThisTask += 1
					errorAccumulator -= totalAmount
				}

				for day := 1; day <= daysForThisTask; day++ {
					currentDate := start.AddDate(0, 0, currentDateIndex)
					var taskContent string

					switch req.TaskType {
					case "問題集":
						taskContent = fmt.Sprintf("問題集%d問解く(%d/%d日目)", taskCounter, day, daysForThisTask)
					case "単語帳":
						taskContent = fmt.Sprintf("単語帳%d単語覚える(%d/%d日目)", taskCounter, day, daysForThisTask)
					case "過去問":
						taskContent = fmt.Sprintf("過去問%d年分解く(%d/%d日目)", taskCounter, day, daysForThisTask)
					case "その他":
						taskContent = fmt.Sprintf("その他%dページする(%d/%d日目)", taskCounter, day, daysForThisTask)
					}

					subTaskID := uuid.New().String()
					_, err = tx.Exec(queryInsertSubTask, subTaskID, taskID, currentDate.Format(layout), taskContent, false)
					if err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"error": "日々のToDo生成に失敗しました"})
						return
					}
					currentDateIndex++
				}
			}

			for i := currentDateIndex; i < execDays; i++ {
				currentDate := start.AddDate(0, 0, i)
				subTaskID := uuid.New().String()
				_, err = tx.Exec(queryInsertSubTask, subTaskID, taskID, currentDate.Format(layout), "予備日（調整期間）", false)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "日々のToDo生成に失敗しました"})
					return
				}
			}

		} else {
			baseNorma := totalAmount / validDays
			remainder := totalAmount % validDays
			errorAccumulator := 0

			for i := 0; i < execDays; i++ {
				currentDate := start.AddDate(0, 0, i)
				var taskContent string

				if i < validDays {
					currentNorma := baseNorma
					errorAccumulator += remainder
					if errorAccumulator >= validDays {
						currentNorma += 1
						errorAccumulator -= validDays
					}

					switch req.TaskType {
					case "問題集":
						taskContent = fmt.Sprintf("%d問解く", currentNorma)
					case "単語帳":
						taskContent = fmt.Sprintf("%d単語覚える", currentNorma)
					case "過去問":
						taskContent = fmt.Sprintf("%d年分解く", currentNorma)
					case "その他":
						taskContent = fmt.Sprintf("%dページする", currentNorma)
					}
				} else {
					taskContent = "予備日（調整期間）"
				}

				subTaskID := uuid.New().String()
				_, err = tx.Exec(queryInsertSubTask, subTaskID, taskID, currentDate.Format(layout), taskContent, false)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "日々のToDo生成に失敗しました"})
					return
				}
			}
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データの確定に失敗しました"})
			return
		}

		c.JSON(http.StatusOK, TaskCreateResponse{
			TaskID: taskID,
			Size:   size,
		})
	}
}

type AssignVegetableRequest struct {
	VegetableName string `json:"vegetable_name" binding:"required"`
}

func AssignVegetableHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := c.Param("task_id")
		if taskID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "タスクIDが指定されていません"})
			return
		}

		var req AssignVegetableRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "リクエストの形式が不正です"})
			return
		}

		validVegetables := map[string]bool{
			"プチトマト": true, "オクラ": true, "枝豆": true, "シイタケ": true, "ネギ": true,
			"赤パプリカ": true, "ピーマン": true, "なす": true, "キュウリ": true, "タケノコ": true,
			"キャベツ": true, "かぼちゃ": true, "トウモロコシ": true, "ブロッコリー": true, "カリフラワー": true,
		}

		if !validVegetables[req.VegetableName] {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("「%s」はアプリの仕様に存在しない野菜です。正しい野菜名を入力してください。", req.VegetableName),
			})
			return
		}

		queryUpdateVegetable := `
			UPDATE "TASKS" 
			SET "vegetable_name" = $1 
			WHERE "task_id" = $2`

		result, err := db.Exec(queryUpdateVegetable, req.VegetableName, taskID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "野菜の割り当てに失敗しました: " + err.Error()})
			return
		}

		rowsAffected, err := result.RowsAffected()
		if err != nil || rowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "該当するタスクが見つかりませんでした"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"task_id": taskID,
		})
	}
}

// ==========================================
// [GET] タスク一覧取得用レスポンス
// ==========================================
type TaskResponse struct {
	TaskID        string `json:"task_id"`
	TaskType      string `json:"task_type"`
	TaskTitle     string `json:"task_title"`
	TotalCount    int    `json:"total_count"`
	LapCount      int    `json:"lap_count"`
	StartDate     string `json:"start_date"`  // YYYY-MM-DD
	EndDate       string `json:"end_date"`    // YYYY-MM-DD
	BufferDays    int    `json:"buffer_days"` // 残り予備日
	VegetableName string `json:"vegetable_name"`
	GrowthStage   int    `json:"growth_stage"` // -1なら枯れている
	ImageURL      string `json:"image_url"`
}

// タスク一覧取得（GET /api/tasks）
func GetTasksHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctxUserID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "認証情報が見つかりません"})
			return
		}
		userID := ctxUserID.(string)

		// タスク情報と一緒に「過去の日付で未完了の小タスク数（＝サボり日数）」も取得
		query := `
			SELECT 
				t.task_id, t.task_type, t.task_title, t.total_count, t.lap_count, 
				t.start_date, t.end_date, t.vegetable_name, t.growth_stage,
				(SELECT COUNT(*) FROM "SUB_TASKS" s WHERE s.task_id = t.task_id AND s.scheduled_date < CURRENT_DATE AND s.is_completed = false) AS missed_days
			FROM "TASKS" t
			WHERE t.user_id = $1
			ORDER BY t.start_date DESC
		`
		rows, err := db.Query(query, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラーが発生しました"})
			return
		}
		defer rows.Close()

		var tasks []TaskResponse = []TaskResponse{}

		for rows.Next() {
			var t TaskResponse
			var startDate, endDate time.Time
			var vegName sql.NullString
			var missedDays int // サボった日数

			if err := rows.Scan(
				&t.TaskID, &t.TaskType, &t.TaskTitle, &t.TotalCount, &t.LapCount,
				&startDate, &endDate, &vegName, &t.GrowthStage, &missedDays,
			); err != nil {
				continue
			}

			if vegName.Valid {
				t.VegetableName = vegName.String
			}

			duration := endDate.Sub(startDate)
			days := int(duration.Hours()/24) + 1
			originalBufferDays := int(math.Ceil(float64(days) * 0.1))

			// 残り予備日の計算（元の予備日 - サボった日数）
			t.BufferDays = originalBufferDays - missedDays

			// 枯死判定（予備日を使い切ってマイナスになったら枯れる！）
			if t.BufferDays < 0 {
				t.GrowthStage = -1 // フロントエンドで枯れた画像を出す合図
				t.BufferDays = 0   // 残り日数は0として表示
			}

			t.StartDate = startDate.Format("2006-01-02")
			t.EndDate = endDate.Format("2006-01-02")

			tasks = append(tasks, t)
		}

		c.JSON(http.StatusOK, tasks)
	}
}

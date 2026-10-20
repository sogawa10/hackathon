package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var fieldPlacementOrder = []int{
	12, 8, 16, 4, 20, 18, 14, 22, 24, 6, 2, 10, 0, 13, 17, 9, 21, 19, 23, 7, 11, 3, 15, 1, 5,
}

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

		if req.TotalCount <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "分量は1以上で入力してください"})
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
						taskContent = fmt.Sprintf("問題集1問解く(%d/%d日目)", day, daysForThisTask)
					case "単語帳":
						taskContent = fmt.Sprintf("単語帳1単語覚える(%d/%d日目)", day, daysForThisTask)
					case "過去問":
						taskContent = fmt.Sprintf("過去問1年分解く(%d/%d日目)", day, daysForThisTask)
					case "その他":
						taskContent = fmt.Sprintf("その他1ページする(%d/%d日目)", day, daysForThisTask)
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

		ctxUserID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "認証情報が見つかりません"})
			return
		}
		userID, ok := ctxUserID.(string)
		if !ok || userID == "" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ユーザーIDの解析に失敗しました"})
			return
		}

		var req AssignVegetableRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "リクエストの形式が不正です"})
			return
		}

		var vegetableID string
		err := db.QueryRow(
			`SELECT "vegetable_id" FROM "VEGETABLES" WHERE "vegetable_name" = $1`,
			req.VegetableName,
		).Scan(&vegetableID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("「%s」はアプリの仕様に存在しない野菜です。正しい野菜名を入力してください。", req.VegetableName),
			})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "野菜の取得に失敗しました"})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラー"})
			return
		}
		defer tx.Rollback()

		queryUpdateVegetable := `
            UPDATE "TASKS"
            SET "vegetable_id" = $1
            WHERE "task_id" = $2 AND "user_id" = $3
        `
		result, err := tx.Exec(queryUpdateVegetable, vegetableID, taskID, userID)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "野菜の割り当てに失敗しました: " + err.Error()})
			return
		}

		rowsAffected, err := result.RowsAffected()
		if err != nil || rowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "該当するタスクが見つかりませんでした"})
			return
		}

		var currentPos sql.NullInt64
		if err := tx.QueryRow(
			`SELECT "field_position" FROM "TASKS" WHERE "task_id" = $1 AND "user_id" = $2 FOR UPDATE`,
			taskID, userID,
		).Scan(&currentPos); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "配置情報の取得に失敗しました"})
			return
		}

		if !currentPos.Valid {
			occupiedRows, err := tx.Query(`
                SELECT "field_position"
                FROM "TASKS"
                WHERE "user_id" = $1
                  AND "field_position" IS NOT NULL
                  AND "growth_stage" NOT IN (-1, 11)
            `, userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "配置情報の取得に失敗しました"})
				return
			}

			occupied := make(map[int]bool)
			for occupiedRows.Next() {
				var p int
				if err := occupiedRows.Scan(&p); err == nil {
					occupied[p] = true
				}
			}
			occupiedRows.Close()

			slot := -1
			for _, s := range fieldPlacementOrder {
				if !occupied[s] {
					slot = s
					break
				}
			}

			if slot >= 0 {
				if _, err := tx.Exec(
					`UPDATE "TASKS" SET "field_position" = $1 WHERE "task_id" = $2 AND "user_id" = $3`,
					slot, taskID, userID,
				); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "配置の確定に失敗しました"})
					return
				}
			}
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データの確定に失敗しました"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"task_id": taskID,
		})
	}
}

type TaskResponse struct {
	TaskID        string `json:"task_id"`
	TaskType      string `json:"task_type"`
	TaskTitle     string `json:"task_title"`
	TotalCount    int    `json:"total_count"`
	LapCount      int    `json:"lap_count"`
	StartDate     string `json:"start_date"`
	EndDate       string `json:"end_date"`
	BufferDays    int    `json:"buffer_days"`
	VegetableName string `json:"vegetable_name"`
	VegetableSize string `json:"vegetable_size"`
	GrowthStage   int    `json:"growth_stage"`
	FieldPosition *int   `json:"field_position"`
	ImageURL      string `json:"image_url"`
}

func GetTasksHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctxUserID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "認証情報が見つかりません"})
			return
		}
		userID := ctxUserID.(string)

		jst, err := time.LoadLocation("Asia/Tokyo")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "タイムゾーンの読み込みに失敗しました"})
			return
		}
		todayStr := os.Getenv("MOCK_TODAY")
		if todayStr == "" {
			todayStr = time.Now().In(jst).Format("2006-01-02")
		}

		updateQuery := `
			UPDATE "TASKS" 
			SET growth_stage = 1 
			WHERE user_id = $1 AND growth_stage = 0 AND start_date <= $2
		`
		if _, err := db.Exec(updateQuery, userID, todayStr); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "タスク状態の自動更新に失敗しました"})
			return
		}

		query := `
			SELECT
				t.task_id,
				t.task_type,
				t.task_title,
				t.total_count,
				t.lap_count,
				t.start_date,
				t.end_date,
				v.vegetable_name,
				v.size,
				t.growth_stage,
				t.field_position,
				(
					SELECT COUNT(*)
					FROM "SUB_TASKS" s
					WHERE s.task_id = t.task_id
					AND s.task_content = '予備日（消費済み）'
					AND s.is_completed = true
				) AS missed_days
			FROM "TASKS" t
			JOIN "VEGETABLES" v
				ON v.vegetable_id = t.vegetable_id
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
			var fieldPos sql.NullInt64
			var missedDays int

			if err := rows.Scan(
				&t.TaskID, &t.TaskType, &t.TaskTitle, &t.TotalCount, &t.LapCount,
				&startDate, &endDate, &t.VegetableName, &t.VegetableSize, &t.GrowthStage, &fieldPos, &missedDays,
			); err != nil {
				continue
			}

			if fieldPos.Valid {
				p := int(fieldPos.Int64)
				t.FieldPosition = &p
			}

			duration := endDate.Sub(startDate)
			days := int(duration.Hours()/24) + 1
			originalBufferDays := int(math.Ceil(float64(days) * 0.1))

			t.BufferDays = originalBufferDays - missedDays

			if t.BufferDays < 0 {
				t.GrowthStage = -1
				t.BufferDays = 0
			}

			t.StartDate = startDate.Format("2006-01-02")
			t.EndDate = endDate.Format("2006-01-02")

			tasks = append(tasks, t)
		}

		c.JSON(http.StatusOK, tasks)
	}
}

func DeleteTaskHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := c.Param("task_id")
		if taskID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "task_id が指定されていません"})
			return
		}

		ctxUserID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "認証情報が見つかりません"})
			return
		}
		userID := ctxUserID.(string)

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラーが発生しました"})
			return
		}
		defer tx.Rollback()

		if _, err := tx.Exec(`DELETE FROM "HARVESTS" WHERE task_id = $1 AND user_id = $2`, taskID, userID); err != nil {
			log.Printf("収穫記録の削除エラー: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラーが発生しました"})
			return
		}

		query := `DELETE FROM "TASKS" WHERE task_id = $1 AND user_id = $2`
		result, err := tx.Exec(query, taskID, userID)
		if err != nil {
			log.Printf("タスク削除エラー: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラーが発生しました"})
			return
		}

		rowsAffected, err := result.RowsAffected()
		if err != nil {
			log.Printf("RowsAffected エラー: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "サーバー内部エラー"})
			return
		}

		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "指定されたタスクが見つかりません"})
			return
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データの確定に失敗しました"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "タスクを正常に削除しました"})
	}
}

type HarvestRequest struct {
	TaskID string `json:"task_id" binding:"required"`
}

type HarvestResponse struct {
	HarvestID     string `json:"harvest_id"`
	VegetableName string `json:"vegetable_name"`
	Size          string `json:"size"`
}

func HarvestTaskHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctxUserID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "認証情報が見つかりません"})
			return
		}
		userID := ctxUserID.(string)

		var req HarvestRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "リクエストの形式が不正です"})
			return
		}

		jst, err := time.LoadLocation("Asia/Tokyo")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "タイムゾーンの読み込みに失敗しました"})
			return
		}
		todayStr := os.Getenv("MOCK_TODAY")
		if todayStr == "" {
			todayStr = time.Now().In(jst).Format("2006-01-02")
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラー"})
			return
		}
		defer tx.Rollback()

		var vegetableID, vegetableName, vegetableSize string
		queryHarvest := `
			UPDATE "TASKS" t
			SET growth_stage = 11
			FROM "VEGETABLES" v
			WHERE t.vegetable_id = v.vegetable_id
			  AND t.task_id = $1 AND t.user_id = $2 AND t.growth_stage = 10
			RETURNING v.vegetable_id, v.vegetable_name, v.size
		`
		err = tx.QueryRow(queryHarvest, req.TaskID, userID).Scan(&vegetableID, &vegetableName, &vegetableSize)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusBadRequest, gin.H{"error": "収穫できるタスクが見つからないか、まだ収穫できる状態ではありません"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "収穫処理に失敗しました"})
			}
			return
		}

		harvestID := uuid.New().String()
		queryInsert := `
			INSERT INTO "HARVESTS" (harvest_id, user_id, task_id, vegetable_id, harvested_at)
			VALUES ($1, $2, $3, $4, $5)
		`
		if _, err := tx.Exec(queryInsert, harvestID, userID, req.TaskID, vegetableID, todayStr); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "収穫の記録に失敗しました"})
			return
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データの確定に失敗しました"})
			return
		}

		c.JSON(http.StatusOK, HarvestResponse{
			HarvestID:     harvestID,
			VegetableName: vegetableName,
			Size:          vegetableSize,
		})
	}
}

type HarvestBasketResponse struct {
	HarvestID     string `json:"harvest_id"`
	TaskID        string `json:"task_id"`
	VegetableName string `json:"vegetable_name"`
	VegetableSize string `json:"vegetable_size"`
	HarvestedAt   string `json:"harvested_at"`
}

func GetHarvestBasketHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctxUserID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "認証情報が見つかりません"})
			return
		}
		userID := ctxUserID.(string)

		query := `
			SELECT h.harvest_id, h.task_id, v.vegetable_name, v.size, h.harvested_at
			FROM "HARVESTS" h
			JOIN "VEGETABLES" v ON h.vegetable_id = v.vegetable_id
			WHERE h.user_id = $1
			ORDER BY h.harvested_at DESC, h.harvest_id
		`
		rows, err := db.Query(query, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "収穫済み野菜の取得に失敗しました"})
			return
		}
		defer rows.Close()

		basket := []HarvestBasketResponse{}
		for rows.Next() {
			var h HarvestBasketResponse
			var harvestedAt time.Time

			if err := rows.Scan(&h.HarvestID, &h.TaskID, &h.VegetableName, &h.VegetableSize, &harvestedAt); err != nil {
				continue
			}

			h.HarvestedAt = harvestedAt.Format("2006-01-02")
			basket = append(basket, h)
		}

		c.JSON(http.StatusOK, basket)
	}
}

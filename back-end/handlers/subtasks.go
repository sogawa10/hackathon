package handlers

import (
	"database/sql"
	"math"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// [GET] 今日のToDo取得用レスポンス
type TodaySubtaskResponse struct {
	SubTaskID     string `json:"sub_task_id"`
	ScheduledDate string `json:"scheduled_date"`
	TaskType      string `json:"task_type"`
	TaskTitle     string `json:"task_title"`
	TaskContent   string `json:"task_content"`
	IsCompleted   bool   `json:"is_completed"`
	VegetableName string `json:"vegetable_name"`
	GrowthStage   int    `json:"growth_stage"`
}

// [PATCH] ToDo完了用リクエスト
type CompleteSubTaskRequest struct {
	SubTaskID string `json:"sub_task_id" binding:"required"`
}

// [PATCH] ToDo完了用レスポンス
type CompleteSubTaskResponse struct {
	HasGrown bool `json:"has_grown"`
}

// ==========================================
// APIハンドラー
// ==========================================

// 今日のToDo取得（GET /api/subtasks/today）
func GetTodaySubtasksHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctxUserID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "認証情報が見つかりません"})
			return
		}
		userID := ctxUserID.(string)

		query := `
      SELECT
        s.sub_task_id,
        s.scheduled_date,
        t.task_type,
        t.task_title,
        s.task_content,
        s.is_completed,
        v.vegetable_name,
        t.growth_stage,
        t.start_date,
        t.end_date,
        (
          SELECT COUNT(*)
          FROM "SUB_TASKS" past
          WHERE past.task_id = t.task_id
            AND past.scheduled_date < CURRENT_DATE
            AND past.is_completed = false
        ) AS missed_days
			FROM "SUB_TASKS" s
			INNER JOIN "TASKS" t ON s.task_id = t.task_id
			INNER JOIN "VEGETABLES" v ON t.vegetable_id = v.vegetable_id
			WHERE t.user_id = $1 AND s.scheduled_date = CURRENT_DATE
		`
		rows, err := db.Query(query, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラーが発生しました"})
			return
		}
		defer rows.Close()

		subtasks := []TodaySubtaskResponse{}

		for rows.Next() {
			var s TodaySubtaskResponse
			var vegName sql.NullString
			var startDate, endDate time.Time
			var missedDays int

			if err := rows.Scan(
				&s.SubTaskID, &s.ScheduledDate, &s.TaskType, &s.TaskTitle,
				&s.TaskContent, &s.IsCompleted, &vegName, &s.GrowthStage,
				&startDate, &endDate, &missedDays,
			); err != nil {
				continue
			}

			// 枯死判定ロジック
			duration := endDate.Sub(startDate)
			days := int(duration.Hours()/24) + 1
			originalBufferDays := int(math.Ceil(float64(days) * 0.1))

			// 予備日を使い切ってマイナスになっているなら、今日のToDoには出さない
			if originalBufferDays-missedDays < 0 {
				continue
			}

			if vegName.Valid {
				s.VegetableName = vegName.String
			}

			subtasks = append(subtasks, s)
		}

		c.JSON(http.StatusOK, subtasks)
	}
}

// ToDoにチェックをつける
func CompleteSubTaskHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. ログイン中のユーザーIDを取得
		ctxUserID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "認証情報が見つかりません"})
			return
		}
		userID := ctxUserID.(string)

		// 2. リクエストを受け取る
		var req CompleteSubTaskRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "リクエストの形式が不正です"})
			return
		}

		// トランザクション開始
		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラー"})
			return
		}
		defer tx.Rollback()

		// 3. サブタスクと、その親タスクの情報を取得
		var taskID string
		var isAlreadyCompleted bool
		var currentGrowthStage int

		queryGetInfo := `
			SELECT s.task_id, s.is_completed, t.growth_stage 
			FROM "SUB_TASKS" s
			JOIN "TASKS" t ON s.task_id = t.task_id
			WHERE s.sub_task_id = $1 AND t.user_id = $2
		`
		err = tx.QueryRow(queryGetInfo, req.SubTaskID, userID).Scan(&taskID, &isAlreadyCompleted, &currentGrowthStage)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "指定されたサブタスクが見つからないか、権限がありません"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "データ取得に失敗しました"})
			}
			return
		}

		// 既に完了済みの場合は、何もせず成長もなし(false)で返す
		if isAlreadyCompleted {
			c.JSON(http.StatusOK, CompleteSubTaskResponse{HasGrown: false})
			return
		}

		// 4. サブタスクを完了状態に更新する
		queryUpdateSub := `UPDATE "SUB_TASKS" SET is_completed = true WHERE sub_task_id = $1`
		_, err = tx.Exec(queryUpdateSub, req.SubTaskID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "タスクの更新に失敗しました"})
			return
		}

		// 5. タスク全体の進捗を取得
		var totalSubtasks, completedSubtasks int
		queryProgress := `
			SELECT 
				COUNT(*),
				COUNT(CASE WHEN is_completed = true THEN 1 END)
			FROM "SUB_TASKS"
			WHERE task_id = $1
		`
		err = tx.QueryRow(queryProgress, taskID).Scan(&totalSubtasks, &completedSubtasks)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "タスク進捗の確認に失敗しました"})
			return
		}

		// 6. 進捗割合から新しい成長段階（0〜9）を計算する
		newGrowthStage := 0
		if totalSubtasks > 0 {
			newGrowthStage = (completedSubtasks * 9) / totalSubtasks
		}

		hasGrown := false

		// 計算した新しい成長段階が、今の成長段階より大きければアップデート
		if newGrowthStage > currentGrowthStage {
			queryGrow := `UPDATE "TASKS" SET growth_stage = $1 WHERE task_id = $2`
			_, err = tx.Exec(queryGrow, newGrowthStage, taskID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "野菜の成長更新に失敗しました"})
				return
			}
			hasGrown = true
		}

		// トランザクション確定
		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データの確定に失敗しました"})
			return
		}

		// 7. 成長したかどうかを返す
		c.JSON(http.StatusOK, CompleteSubTaskResponse{
			HasGrown: hasGrown,
		})
	}
}

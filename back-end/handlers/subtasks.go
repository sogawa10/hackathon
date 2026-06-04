package handlers

import (
	"database/sql"
	"net/http"
	"os"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"
)

type TodaySubtaskResponse struct {
	SubTaskID     string `json:"sub_task_id"`
	TaskID        string `json:"task_id"`
	ScheduledDate string `json:"scheduled_date"`
	TaskType      string `json:"task_type"`
	TaskTitle     string `json:"task_title"`
	TaskContent   string `json:"task_content"`
	IsCompleted   bool   `json:"is_completed"`
	VegetableName string `json:"vegetable_name"`
	GrowthStage   int    `json:"growth_stage"`
	IsCheckable   bool   `json:"is_checkable"`
}

type CompleteSubTaskRequest struct {
	SubTaskID string `json:"sub_task_id" binding:"required"`
}

type CompleteSubTaskResponse struct {
	GrowthStage int `json:"growth_stage"`
}

func GetTodaySubtasksHandler(db *sql.DB) gin.HandlerFunc {
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
		// 現在時刻の取得
		todayStr := os.Getenv("MOCK_TODAY")
		if todayStr == "" {
			todayStr = time.Now().In(jst).Format("2006-01-02")
		}

		reCheckable := regexp.MustCompile(`\((\d+)/(\d+)日目\)$`)

		updateQuery := `
			UPDATE "TASKS" 
			SET growth_stage = 1 
			WHERE user_id = $1 AND growth_stage = 0 AND start_date <= $2
		`
		if _, err := db.Exec(updateQuery, userID, todayStr); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "タスク状態の自動更新に失敗しました"})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "トランザクションの開始に失敗しました"})
			return
		}

		activeTasksQuery := `SELECT task_id FROM "TASKS" WHERE user_id = $1 AND growth_stage NOT IN (-1, 11)`
		taskRows, err := tx.Query(activeTasksQuery, userID)
		if err == nil {
			var activeTaskIDs []string
			for taskRows.Next() {
				var tid string
				if err := taskRows.Scan(&tid); err == nil {
					activeTaskIDs = append(activeTaskIDs, tid)
				}
			}
			taskRows.Close()

			for _, taskID := range activeTaskIDs {
				missedSubQuery := `
					SELECT scheduled_date, task_content
					FROM "SUB_TASKS" 
					WHERE task_id = $1 AND is_completed = false AND scheduled_date < $2
					ORDER BY scheduled_date ASC
				`
				missedRows, err := tx.Query(missedSubQuery, taskID, todayStr)
				if err != nil {
					continue
				}

				var firstMissedDate time.Time
				missedCount := 0

				for missedRows.Next() {
					var sDate time.Time
					var tContent string
					if err := missedRows.Scan(&sDate, &tContent); err == nil {
						isCheckable := true
						matches := reCheckable.FindStringSubmatch(tContent)
						if len(matches) == 3 {
							if matches[1] != matches[2] {
								isCheckable = false
							}
						}

						if isCheckable {
							if missedCount == 0 {
								firstMissedDate = sDate
							}
							missedCount++
						}
					}
				}
				missedRows.Close()

				if missedCount == 0 {
					continue
				}

				var remainingBuffers int
				tx.QueryRow(`SELECT COUNT(*) FROM "SUB_TASKS" WHERE task_id = $1 AND task_content LIKE '予備日%' AND is_completed = false`, taskID).Scan(&remainingBuffers)

				newBufferCount := remainingBuffers - missedCount
				if newBufferCount < 0 {
					tx.Exec(`UPDATE "TASKS" SET growth_stage = -1 WHERE task_id = $1`, taskID)
					continue
				}

				deleteBufferQuery := `
					DELETE FROM "SUB_TASKS"
					WHERE sub_task_id IN (
						SELECT sub_task_id FROM "SUB_TASKS"
						WHERE task_id = $1 AND task_content LIKE '予備日%' AND is_completed = false
						ORDER BY scheduled_date DESC
						LIMIT $2
					)
				`
				tx.Exec(deleteBufferQuery, taskID, missedCount)

				shiftQuery := `
					UPDATE "SUB_TASKS"
					SET scheduled_date = scheduled_date + ($1 * INTERVAL '1 day')
					WHERE task_id = $2 AND is_completed = false
				`
				tx.Exec(shiftQuery, missedCount, taskID)

				insertQuery := `
					INSERT INTO "SUB_TASKS" (sub_task_id, task_id, scheduled_date, task_content, is_completed)
					VALUES (gen_random_uuid(), $1, $2, '予備日（消費済み）', true)
				`
				for i := 0; i < missedCount; i++ {
					insertDate := firstMissedDate.AddDate(0, 0, i).Format("2006-01-02")
					tx.Exec(insertQuery, taskID, insertDate)
				}
			}
		}
		tx.Commit()

		query := `
			SELECT
				s.sub_task_id, t.task_id, s.scheduled_date, t.task_type, t.task_title, 
				s.task_content, s.is_completed, v.vegetable_name, t.growth_stage
			FROM "SUB_TASKS" s
			INNER JOIN "TASKS" t ON s.task_id = t.task_id
			INNER JOIN "VEGETABLES" v ON t.vegetable_id = v.vegetable_id
			WHERE t.user_id = $1 AND s.scheduled_date = $2 AND t.growth_stage != -1
		`
		rows, err := db.Query(query, userID, todayStr)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラーが発生しました"})
			return
		}
		defer rows.Close()

		subtasks := []TodaySubtaskResponse{}

		for rows.Next() {
			var s TodaySubtaskResponse
			var vegName sql.NullString
			var scDate time.Time

			if err := rows.Scan(
				&s.SubTaskID, &s.TaskID, &scDate, &s.TaskType, &s.TaskTitle,
				&s.TaskContent, &s.IsCompleted, &vegName, &s.GrowthStage,
			); err != nil {
				continue
			}

			s.ScheduledDate = scDate.Format("2006-01-02")
			if vegName.Valid {
				s.VegetableName = vegName.String
			}
			s.IsCheckable = true
			matches := reCheckable.FindStringSubmatch(s.TaskContent)
			if len(matches) == 3 {
				if matches[1] != matches[2] {
					s.IsCheckable = false
				}
			}
			subtasks = append(subtasks, s)
		}
		c.JSON(http.StatusOK, subtasks)
	}
}

func CompleteSubTaskHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctxUserID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "認証情報が見つかりません"})
			return
		}
		userID := ctxUserID.(string)

		var req CompleteSubTaskRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "リクエストの形式が不正です"})
			return
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラー"})
			return
		}
		defer tx.Rollback()

		var taskID string
		var isAlreadyCompleted bool
		var currentGrowthStage int
		var targetDate, startDate, endDate time.Time
		var taskContent string

		queryGetInfo := `
            SELECT s.task_id, s.is_completed, t.growth_stage, s.scheduled_date, t.start_date, t.end_date, s.task_content
            FROM "SUB_TASKS" s
            JOIN "TASKS" t ON s.task_id = t.task_id
            WHERE s.sub_task_id = $1 AND t.user_id = $2
        `
		err = tx.QueryRow(queryGetInfo, req.SubTaskID, userID).Scan(&taskID, &isAlreadyCompleted, &currentGrowthStage, &targetDate, &startDate, &endDate, &taskContent)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "指定されたサブタスクが見つからないか、権限がありません"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "データ取得に失敗しました"})
			}
			return
		}

		if isAlreadyCompleted {
			c.JSON(http.StatusOK, CompleteSubTaskResponse{
				GrowthStage: currentGrowthStage,
			})
			return
		}

		re := regexp.MustCompile(`\((\d+)/(\d+)日目\)$`)
		matches := re.FindStringSubmatch(taskContent)

		if len(matches) == 3 {
			if matches[1] != matches[2] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "このタスクは最終日にしか完了チェックできません"})
				return
			}

			baseContent := taskContent[:len(taskContent)-len(matches[0])]
			queryUpdateSub := `UPDATE "SUB_TASKS" SET is_completed = true WHERE task_id = $1 AND task_content LIKE $2 AND scheduled_date <= $3`
			_, err = tx.Exec(queryUpdateSub, taskID, baseContent+"%", targetDate)
		} else {
			queryUpdateSub := `UPDATE "SUB_TASKS" SET is_completed = true WHERE sub_task_id = $1`
			_, err = tx.Exec(queryUpdateSub, req.SubTaskID)
		}

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "タスクの更新に失敗しました"})
			return
		}

		var totalSubtasks, completedSubtasks int
		queryProgress := `
			SELECT 
				COUNT(*) FILTER (
					WHERE task_content <> '予備日（調整期間）'
				),
				COUNT(*) FILTER (
					WHERE is_completed = true
					AND task_content <> '予備日（調整期間）'
				)
			FROM "SUB_TASKS"
			WHERE task_id = $1
		`
		err = tx.QueryRow(queryProgress, taskID).Scan(&totalSubtasks, &completedSubtasks)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "タスク進捗の確認に失敗しました"})
			return
		}

		newGrowthStage := currentGrowthStage
		if totalSubtasks > 0 {
			if completedSubtasks == totalSubtasks {
				newGrowthStage = 10
			} else if completedSubtasks > 0 {
				newGrowthStage = 1 + int(
					float64(completedSubtasks)*9/float64(totalSubtasks),
				)
			} else {
				newGrowthStage = 1
			}
		}

		if newGrowthStage > currentGrowthStage {
			queryGrow := `UPDATE "TASKS" SET growth_stage = $1 WHERE task_id = $2`
			_, err = tx.Exec(queryGrow, newGrowthStage, taskID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "野菜の成長更新に失敗しました"})
				return
			}
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データの確定に失敗しました"})
			return
		}

		c.JSON(http.StatusOK, CompleteSubTaskResponse{
			GrowthStage: newGrowthStage,
		})
	}
}

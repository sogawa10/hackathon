package handlers

import (
	"database/sql"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// 仕様書通りのレスポンス構造体
type TodaySubtaskResponse struct {
	SubTaskID     string `json:"sub_task_id"`
	ScheduledDate string `json:"scheduled_date"` // YYYY-MM-DD
	TaskType      string `json:"task_type"`      // 単語帳 | 問題集 | 過去問 | その他
	TaskTitle     string `json:"task_title"`
	TaskContent   string `json:"task_content"`
	IsCompleted   bool   `json:"is_completed"`
	VegetableName string `json:"vegetable_name"`
	GrowthStage   int    `json:"growth_stage"` // 0〜9
}

// 今日のToDo取得（GET /api/subtasks/today）
func GetTodaySubtasksHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// ==========================================
		// 1. パスポート（JWT）の検証とユーザー特定
		// ==========================================
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "認証トークンがありません"})
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(os.Getenv("JWT_SECRET")), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "無効なトークンです"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "トークン情報が読み取れません"})
			return
		}
		userID := claims["user_id"].(string)

		// ==========================================
		// 2. DBから3つのテーブルを結合して取得
		// ==========================================
		query := `
			SELECT 
				s.sub_task_id, 
				s.scheduled_date, 
				t.task_type, 
				t.task_title, 
				s.task_content, 
				s.is_completed, 
				v.vegetable_name, 
				t.growth_stage
			FROM "SUB_TASKS" s
			INNER JOIN "TASKS" t ON s.task_id = t.task_id
			INNER JOIN "VEGETABLE" v ON t.vegetable_id = v.vegetable_id
			WHERE t.user_id = $1 AND s.scheduled_date = CURRENT_DATE
		`
		rows, err := db.Query(query, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラーが発生しました"})
			return
		}
		defer rows.Close()

		// ==========================================
		// 3. データを配列に詰めて返却
		// ==========================================
		var subtasks []TodaySubtaskResponse = []TodaySubtaskResponse{}

		for rows.Next() {
			var s TodaySubtaskResponse
			if err := rows.Scan(
				&s.SubTaskID,
				&s.ScheduledDate,
				&s.TaskType,
				&s.TaskTitle,
				&s.TaskContent,
				&s.IsCompleted,
				&s.VegetableName,
				&s.GrowthStage,
			); err != nil {
				continue
			}
			subtasks = append(subtasks, s)
		}

		c.JSON(http.StatusOK, subtasks)
	}
}

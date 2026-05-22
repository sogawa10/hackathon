package handlers

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// リクエスト用（フロントから送られてくるJSON）
type SignupRequest struct {
	UserName string `json:"user_name" binding:"required"`
	UserPass string `json:"user_pass" binding:"required"`
}

// レスポンス用（仕様書通りのJSON構造）
type SignupResponse struct {
	UserID       string `json:"user_id"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// ユーザー登録（POST /api/signup）
func SignupHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req SignupRequest

		// 1. 送られてきたJSONを受け取る
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ユーザー名とパスワードは必須です"})
			return
		}

		// 2. パスワードのハッシュ化（★ここがポイント！）
		// bcryptは内部で自動的にランダムなソルトを生成して混ぜるため、同じパスワードでも毎回出力が変わります。
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.UserPass), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "パスワードの暗号化に失敗しました"})
			return
		}

		// 3. ユーザーIDの生成
		newUserID := uuid.New().String()

		// （※トークン機能は後で作るため、今はモックとしてUUIDを返します）
		mockAccessToken := "mock_access_" + uuid.New().String()
		mockRefreshToken := "mock_refresh_" + uuid.New().String()

		// 4. データベース（USERSテーブル）に保存
		query := `INSERT INTO "USERS" (user_id, user_name, user_pass) VALUES ($1, $2, $3)`
		_, err = db.Exec(query, newUserID, req.UserName, string(hashedPassword))
		if err != nil {
			// UNIQUE制約などによるエラー（既に同じ名前が登録されている等）
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ユーザー登録に失敗しました。既に存在するユーザー名の可能性があります。"})
			return
		}

		// 5. 仕様書通りのJSONを返却（配列の中にオブジェクト）
		response := []SignupResponse{
			{
				UserID:       newUserID,
				AccessToken:  mockAccessToken,
				RefreshToken: mockRefreshToken,
			},
		}

		c.JSON(http.StatusOK, response)
	}
}

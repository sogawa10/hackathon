package handlers

import (
	"database/sql"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
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

		// ★ モックを消して、本物のトークンを発行する
		accessToken, refreshToken, err := generateTokens(newUserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "トークンの発行に失敗しました"})
			return
		}

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
				AccessToken:  accessToken,
				RefreshToken: refreshToken,
			},
		}

		c.JSON(http.StatusOK, response)
	}
}

// ログイン用のリクエスト構造体
type LoginRequest struct {
	UserName string `json:"user_name" binding:"required"`
	UserPass string `json:"user_pass" binding:"required"`
}

// ログイン用のレスポンス構造体（仕様書通り）
type LoginResponse struct {
	UserID       string `json:"user_id"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// ログイン（POST /api/login）
func LoginHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req LoginRequest

		// 1. リクエストのJSONを受け取る
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ユーザー名とパスワードは必須です"})
			return
		}

		var userID, hashedPassword string

		// 2. データベースから該当するユーザー名を探す
		query := `SELECT user_id, user_pass FROM "USERS" WHERE user_name = $1`
		err := db.QueryRow(query, req.UserName).Scan(&userID, &hashedPassword)
		if err != nil {
			if err == sql.ErrNoRows {
				// ユーザーが見つからなかった場合（セキュリティ上、IDとPWどちらが違うかは教えない）
				c.JSON(http.StatusUnauthorized, gin.H{"error": "ユーザー名またはパスワードが間違っています"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラーが発生しました"})
			}
			return
		}

		// 3. パスワードの答え合わせ（入力されたパスワードと、DBのハッシュを比較）
		err = bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(req.UserPass))
		if err != nil {
			// パスワードが一致しない場合
			c.JSON(http.StatusUnauthorized, gin.H{"error": "ユーザー名またはパスワードが間違っています"})
			return
		}

		// 4. 認証成功！トークンを発行
		accessToken, refreshToken, err := generateTokens(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "トークンの発行に失敗しました"})
			return
		}

		// 5. 仕様書通りのJSONを返却（配列の中にオブジェクト）
		response := []LoginResponse{
			{
				UserID:       userID,
				AccessToken:  accessToken,
				RefreshToken: refreshToken,
			},
		}

		c.JSON(http.StatusOK, response)
	}
}

// トークンを生成するヘルパー関数
func generateTokens(userID string) (string, string, error) {
	// .envから秘密の鍵を読み込む
	secret := []byte(os.Getenv("JWT_SECRET"))

	// 1. アクセストークンの作成（有効期限：1時間）
	accessTokenClaims := jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(time.Hour * 1).Unix(),
	}
	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessTokenClaims)
	accessTokenString, err := accessToken.SignedString(secret)
	if err != nil {
		return "", "", err
	}

	// 2. リフレッシュトークンの作成（有効期限：7日）
	refreshTokenClaims := jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(time.Hour * 24 * 7).Unix(),
	}
	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshTokenClaims)
	refreshTokenString, err := refreshToken.SignedString(secret)
	if err != nil {
		return "", "", err
	}

	return accessTokenString, refreshTokenString, nil
}

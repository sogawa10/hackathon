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

type SignupRequest struct {
	UserName string `json:"user_name" binding:"required"`
	UserPass string `json:"user_pass" binding:"required"`
}

type SignupResponse struct {
	UserID       string `json:"user_id"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

func SignupHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req SignupRequest

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ユーザー名とパスワードは必須です"})
			return
		}

		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.UserPass), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "パスワードの暗号化に失敗しました"})
			return
		}

		newUserID := uuid.New().String()

		accessToken, refreshToken, err := generateTokens(newUserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "トークンの発行に失敗しました"})
			return
		}

		query := `INSERT INTO "USERS" (user_id, user_name, user_pass) VALUES ($1, $2, $3)`
		_, err = db.Exec(query, newUserID, req.UserName, string(hashedPassword))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ユーザー登録に失敗しました。既に存在するユーザー名の可能性があります。"})
			return
		}

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

type LoginRequest struct {
	UserName string `json:"user_name" binding:"required"`
	UserPass string `json:"user_pass" binding:"required"`
}

type LoginResponse struct {
	UserID       string `json:"user_id"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

func LoginHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req LoginRequest

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ユーザー名とパスワードは必須です"})
			return
		}

		var userID, hashedPassword string

		query := `SELECT user_id, user_pass FROM "USERS" WHERE user_name = $1`
		err := db.QueryRow(query, req.UserName).Scan(&userID, &hashedPassword)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "ユーザー名またはパスワードが間違っています"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラーが発生しました"})
			}
			return
		}

		err = bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(req.UserPass))
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "ユーザー名またはパスワードが間違っています"})
			return
		}

		accessToken, refreshToken, err := generateTokens(userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "トークンの発行に失敗しました"})
			return
		}

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

func generateTokens(userID string) (string, string, error) {
	secret := []byte(os.Getenv("JWT_SECRET"))
	accessTokenClaims := jwt.MapClaims{
		"user_id": userID,
		// 現在時刻の取得
		"exp": time.Now().Add(time.Hour * 1).Unix(),
	}
	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessTokenClaims)
	accessTokenString, err := accessToken.SignedString(secret)
	if err != nil {
		return "", "", err
	}
	refreshTokenClaims := jwt.MapClaims{
		"user_id": userID,
		// 現在時刻の取得
		"exp": time.Now().Add(time.Hour * 24 * 7).Unix(),
	}
	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshTokenClaims)
	refreshTokenString, err := refreshToken.SignedString(secret)
	if err != nil {
		return "", "", err
	}
	return accessTokenString, refreshTokenString, nil
}

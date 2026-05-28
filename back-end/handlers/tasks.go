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

// TaskCreateRequest はフロントエンドから受け取るタスク作成のデータ構造です
type TaskCreateRequest struct {
	TaskType   string `json:"task_type" binding:"required"` // 単語帳 | 問題集 | 過去問 | その他
	TaskTitle  string `json:"task_title" binding:"required"`
	TotalCount int    `json:"total_count" binding:"required"` // 総問題量（年数、ページ数など）
	LapCount   int    `json:"lap_count"`                      // 周回数（デフォルト1）
	StartDate  string `json:"start_date" binding:"required"`  // YYYY-MM-DD
	EndDate    string `json:"end_date" binding:"required"`    // YYYY-MM-DD
}

// TaskCreateResponse はフロントエンドへ返すレスポンス構造体です
type TaskCreateResponse struct {
	TaskID string `json:"task_id"`
	Size   string `json:"size"` // S | M | L
}

// CreateTaskHandler は仕様書のアルゴリズムに基づき、野菜サイズを判定して日々のToDoを自動生成します
func CreateTaskHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// ※開発中の仮UserID（テスト用ID）
		userID := "f2aacbf1-92b8-4fd3-b5e0-4beac04b117d"

		var req TaskCreateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "リクエストの形式が不正です"})
			return
		}

		// 周回数のデフォルト値設定 (仕様書: デフォルトは1)
		if req.LapCount <= 0 {
			req.LapCount = 1
		}

		// 1. 日付のパースと期間チェック
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

		// 実施日数 = 期日 - 開始日 + 1
		execDays := int(end.Sub(start).Hours()/24) + 1

		// ⚠️ バリデーション: 1週間（7日）未満のタスクは入力不可
		if execDays < 7 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "1週間未満のタスクは入力不可です"})
			return
		}

		// 予備日（切り上げ） = ⌈ 実施日数 × 0.1 ⌉
		bufferDays := int(math.Ceil(float64(execDays) * 0.1))
		// 有効日数 = 実施日数 - 予備日
		validDays := execDays - bufferDays

		if validDays <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "有効日数の計算に失敗しました"})
			return
		}

		// ==========================================
		// 🧮 野菜サイズ判定アルゴリズム (仕様書ロジック)
		// ==========================================
		var typeScore float64  // ⓵ タスク種別のスコア
		var dailyScore float64 // ⓶ 1日あたりの分量に応じたスコア

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

		// 難易度スコア D = タスク種別のスコア + 1日あたりの分量に応じたスコア
		D := typeScore + dailyScore

		// 期間スコア P の計算
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

		// 総合スコア S = D + P
		S := D + P

		// 野菜サイズの決定
		var size string
		if S < 2.8 {
			size = "S"
		} else if S >= 2.8 && S < 5.0 {
			size = "M"
		} else {
			size = "L"
		}

		// ==========================================
		// 💾 データベースへの登録 (トランザクション)
		// ==========================================
		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラー"})
			return
		}
		defer tx.Rollback()

		taskID := uuid.New().String()

		// 1. TASKSテーブルへの挿入
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

		// 総タスク量の算出
		var totalAmount int
		if req.TaskType == "単語帳" {
			totalAmount = req.TotalCount * req.LapCount
		} else {
			totalAmount = req.TotalCount
		}

		// SUB_TASKS用の一括生成クエリ
		queryInsertSubTask := `
			INSERT INTO "SUB_TASKS" ("sub_task_id", "task_id", "scheduled_date", "task_content", "is_completed") 
			VALUES ($1, $2, $3, $4, $5)`

		// モード判定：1日の平均が1未満になるなら「分数モード」、1以上なら「通常モード」
		isFractionMode := totalAmount < validDays

		if isFractionMode {
			// 💡 【自動分数モード】 有効日数を無駄なく使い切るように、1タスクあたりにかける日数を自動拡張
			baseDaysPerTask := validDays / totalAmount // 1つあたりにかける基本日数（分母のベース）
			remainderDays := validDays % totalAmount   // 分母を+1日して格上げする残余日数
			errorAccumulator := 0

			currentDateIndex := 0 // カレンダーの日付を進めるためのインデックス

			for taskCounter := 1; taskCounter <= totalAmount; taskCounter++ {
				// このタスクに何日間（分母）かけるかをブレンド計算
				daysForThisTask := baseDaysPerTask
				errorAccumulator += remainderDays
				if errorAccumulator >= totalAmount {
					daysForThisTask += 1
					errorAccumulator -= totalAmount
				}

				// 決定した分母（daysForThisTask）を使って、(1/N日目) から (N/N日目) まで連続生成
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

			// 有効日数をぴったり消費しきった後、末尾に「絶対死守する10%分の予備日」を生成
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
			// 💡 【通常モード】 分量が日数を上回る場合、余りを毎日綺麗にばら散らすロジック
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
					// 末尾10%を予備日として生成
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

		// トランザクションをコミットしてDBに反映
		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データの確定に失敗しました"})
			return
		}

		// 成功レスポンス
		c.JSON(http.StatusOK, TaskCreateResponse{
			TaskID: taskID,
			Size:   size,
		})
	}
}

// 💡 この構造体の定義が抜けていたためエラーになっていました！ここを追加します
type AssignVegetableRequest struct {
	VegetableName string `json:"vegetable_name" binding:"required"`
}

// AssignVegetableHandler は指定されたタスクにユーザーが選んだ野菜の名前を割り当てます
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

		// 💡 仕様書にある15種類の野菜のホワイトリスト（バリデーション）
		validVegetables := map[string]bool{
			// 野菜S
			"プチトマト": true, "オクラ": true, "枝豆": true, "シイタケ": true, "ネギ": true,
			// 野菜M
			"赤パプリカ": true, "ピーマン": true, "なす": true, "キュウリ": true, "タケノコ": true,
			// 野菜L
			"キャベツ": true, "かぼちゃ": true, "トウモロコシ": true, "ブロッコリー": true, "カリフラワー": true,
		}

		// 送られてきた野菜名がリストに存在するかチェック
		if !validVegetables[req.VegetableName] {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("「%s」はアプリの仕様に存在しない野菜です。正しい野菜名を入力してください。", req.VegetableName),
			})
			return
		}

		// データベースの更新処理
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

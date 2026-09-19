
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type CreatePollRequest struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
}

type VoteRequest struct {
	Option string `json:"option"`
}

type Poll struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Question  string        `bson:"question" json:"question"`
	Options   []string      `bson:"options" json:"options"`
	Votes     map[string]int `bson:"votes" json:"votes"`
	CreatedAt time.Time     `bson:"createdAt" json:"createdAt"`
}

func main() {

	// =========================
	// LOAD ENVIRONMENT
	// =========================

	err := godotenv.Load()

	if err != nil {
		fmt.Println("Warning: .env file not found")
	}

	mongoURI := os.Getenv("MONGODB_URI")

	if mongoURI == "" {
		fmt.Println("ERROR: MONGODB_URI is not set")
		return
	}

	// =========================
	// CONNECT MONGODB
	// =========================

	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)
	defer cancel()

	client, err := mongo.Connect(
		options.Client().ApplyURI(mongoURI),
	)

	if err != nil {
		fmt.Println("MongoDB connection error:", err)
		return
	}

	err = client.Ping(ctx, nil)

	if err != nil {
		fmt.Println("MongoDB ping failed:", err)
		return
	}

	fmt.Println("MongoDB connected successfully!")

	// =========================
	// COLLECTION
	// =========================

	collection := client.
		Database("livepolling").
		Collection("polls")

	// =========================
	// GIN ROUTER
	// =========================

	router := gin.Default()

	// =========================
	// CORS
	// =========================

	router.Use(func(c *gin.Context) {

		c.Header(
			"Access-Control-Allow-Origin",
			"http://localhost:5173",
		)

		c.Header(
			"Access-Control-Allow-Methods",
			"GET, POST, DELETE, OPTIONS",
		)

		c.Header(
			"Access-Control-Allow-Headers",
			"Content-Type",
		)

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	})

	// =========================
	// HOME
	// =========================

	router.GET("/", func(c *gin.Context) {

		c.JSON(http.StatusOK, gin.H{
			"message": "Live Polling API is running",
		})
	})

	// =========================
	// GET ALL POLLS
	// =========================

	router.GET("/polls", func(c *gin.Context) {

		cursor, err := collection.Find(
			c.Request.Context(),
			bson.M{},
		)

		if err != nil {

			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch polls",
			})

			return
		}

		defer cursor.Close(c.Request.Context())

		var polls []Poll

		err = cursor.All(
			c.Request.Context(),
			&polls,
		)

		if err != nil {

			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to read polls",
			})

			return
		}

		// If no polls exist, return an empty array instead of null
		if polls == nil {
			polls = []Poll{}
		}

		c.JSON(http.StatusOK, polls)
	})

	// =========================
	// CREATE POLL
	// =========================

	router.POST("/polls", func(c *gin.Context) {

		var req CreatePollRequest

		err := c.ShouldBindJSON(&req)

		if err != nil {

			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid request",
			})

			return
		}

		// Clean question
		req.Question = strings.TrimSpace(req.Question)

		if req.Question == "" {

			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Question is required",
			})

			return
		}

		// =========================
		// CLEAN OPTIONS
		// =========================

		cleanOptions := make([]string, 0)

		for _, option := range req.Options {

			option = strings.TrimSpace(option)

			if option != "" {
				cleanOptions = append(cleanOptions, option)
			}
		}

		if len(cleanOptions) < 2 {

			c.JSON(http.StatusBadRequest, gin.H{
				"error": "At least 2 options are required",
			})

			return
		}

		// =========================
		// REMOVE DUPLICATE OPTIONS
		// =========================

		uniqueOptions := make([]string, 0)
		seenOptions := make(map[string]bool)

		for _, option := range cleanOptions {

			if !seenOptions[option] {
				seenOptions[option] = true
				uniqueOptions = append(uniqueOptions, option)
			}
		}

		if len(uniqueOptions) < 2 {

			c.JSON(http.StatusBadRequest, gin.H{
				"error": "At least 2 different options are required",
			})

			return
		}

		// =========================
		// CREATE VOTE MAP
		// =========================

		votes := make(map[string]int)

		for _, option := range uniqueOptions {
			votes[option] = 0
		}

		// =========================
		// CREATE POLL
		// =========================

		poll := Poll{
			Question:  req.Question,
			Options:   uniqueOptions,
			Votes:     votes,
			CreatedAt: time.Now(),
		}

		// =========================
		// INSERT POLL
		// =========================

		result, err := collection.InsertOne(
			c.Request.Context(),
			poll,
		)

		if err != nil {

			fmt.Println("Insert error:", err)

			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to create poll",
			})

			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"message": "Poll created successfully",
			"id":      result.InsertedID,
		})
	})

	// =========================
	// VOTE
	// =========================

	router.POST("/polls/:id/vote", func(c *gin.Context) {

		pollID := c.Param("id")

		var req VoteRequest

		err := c.ShouldBindJSON(&req)

		if err != nil {

			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid request",
			})

			return
		}

		req.Option = strings.TrimSpace(req.Option)

		if req.Option == "" {

			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Option is required",
			})

			return
		}

		// =========================
		// CONVERT ID
		// =========================

		objectID, err := bson.ObjectIDFromHex(pollID)

		if err != nil {

			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid poll ID",
			})

			return
		}

		// =========================
		// CHECK POLL + OPTION
		// =========================

		var poll Poll

		err = collection.FindOne(
			c.Request.Context(),
			bson.M{
				"_id": objectID,
			},
		).Decode(&poll)

		if err != nil {

			if err == mongo.ErrNoDocuments {

				c.JSON(http.StatusNotFound, gin.H{
					"error": "Poll not found",
				})

				return
			}

			fmt.Println("Find poll error:", err)

			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to find poll",
			})

			return
		}

		// =========================
		// CHECK OPTION EXISTS
		// =========================

		optionExists := false

		for _, option := range poll.Options {

			if option == req.Option {
				optionExists = true
				break
			}
		}

		if !optionExists {

			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Selected option does not exist",
			})

			return
		}

		// =========================
		// INCREMENT VOTE
		// =========================

		voteField := "votes." + req.Option

		update := bson.M{
			"$inc": bson.M{
				voteField: 1,
			},
		}

		result, err := collection.UpdateOne(
			c.Request.Context(),
			bson.M{
				"_id": objectID,
			},
			update,
		)

		if err != nil {

			fmt.Println("Vote update error:", err)

			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to save vote",
			})

			return
		}

		if result.ModifiedCount == 0 {

			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Vote was not updated",
			})

			return
		}

		// =========================
		// GET UPDATED POLL
		// =========================

		var updatedPoll Poll

		err = collection.FindOne(
			c.Request.Context(),
			bson.M{
				"_id": objectID,
			},
		).Decode(&updatedPoll)

		if err != nil {

			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Vote saved but failed to load updated poll",
			})

			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Vote recorded successfully!",
			"option":  req.Option,
			"votes":   updatedPoll.Votes,
		})
	})

	// =========================
	// DELETE POLL
	// =========================

	router.DELETE("/polls/:id", func(c *gin.Context) {

		pollID := c.Param("id")

		objectID, err := bson.ObjectIDFromHex(pollID)

		if err != nil {

			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid poll ID",
			})

			return
		}

		result, err := collection.DeleteOne(
			c.Request.Context(),
			bson.M{
				"_id": objectID,
			},
		)

		if err != nil {

			fmt.Println("Delete poll error:", err)

			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to delete poll",
			})

			return
		}

		if result.DeletedCount == 0 {

			c.JSON(http.StatusNotFound, gin.H{
				"error": "Poll not found",
			})

			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Poll deleted successfully",
		})
	})

	// =========================
	// START SERVER
	// =========================

	fmt.Println("===================================")
	fmt.Println("Live Polling API")
	fmt.Println("Server: http://localhost:8080")
	fmt.Println("===================================")

	err = router.Run(":8080")

	if err != nil {
		fmt.Println("Server error:", err)
	}
}


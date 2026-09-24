package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Poll struct {
	ID        bson.ObjectID   `bson:"_id,omitempty" json:"id"`
	Question  string          `bson:"question" json:"question"`
	Options   []string        `bson:"options" json:"options"`
	Votes     map[string]int  `bson:"votes" json:"votes"`
	Voters    map[string]bool `bson:"voters,omitempty" json:"-"`
	CreatedAt time.Time       `bson:"createdAt" json:"createdAt"`
}

type CreatePollRequest struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
}

type VoteRequest struct {
	Option      string `json:"option"`
	OptionIndex *int   `json:"optionIndex"`
	VoterID     string `json:"voterId"`
}

var collection *mongo.Collection

func main() {

	// Load .env for local development
	_ = godotenv.Load()

	// MongoDB connection
	mongoURI := os.Getenv("MONGODB_URI")

	if mongoURI == "" {
		log.Fatal("MONGODB_URI is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	client, err := mongo.Connect(options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatal("MongoDB connection error:", err)
	}

	if err := client.Ping(ctx, nil); err != nil {
		log.Fatal("MongoDB ping failed:", err)
	}

	fmt.Println("MongoDB connected successfully!")

	collection = client.Database("livepolling").Collection("polls")

	// Gin router
	r := gin.Default()

	// CORS
	r.Use(func(c *gin.Context) {

		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set(
			"Access-Control-Allow-Methods",
			"GET, POST, DELETE, OPTIONS",
		)
		c.Writer.Header().Set(
			"Access-Control-Allow-Headers",
			"Content-Type",
		)

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Routes
	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "Live Polling Backend is running",
		})
	})

	r.GET("/polls", getPolls)

	r.POST("/polls", createPoll)

	r.POST("/polls/:id/vote", votePoll)

	r.DELETE("/polls/:id", deletePoll)

	// Render PORT
	port := os.Getenv("PORT")

	if port == "" {
		port = "8080"
	}

	fmt.Println("Server running on port:", port)

	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

// ===============================
// GET ALL POLLS
// ===============================

func getPolls(c *gin.Context) {

	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)
	defer cancel()

	cursor, err := collection.Find(ctx, bson.M{})

	if err != nil {
		c.JSON(500, gin.H{
			"error": "Failed to fetch polls",
		})
		return
	}

	defer cursor.Close(ctx)

	var polls []Poll

	if err := cursor.All(ctx, &polls); err != nil {
		c.JSON(500, gin.H{
			"error": "Failed to decode polls",
		})
		return
	}

	if polls == nil {
		polls = []Poll{}
	}

	c.JSON(200, polls)
}

// ===============================
// CREATE POLL
// ===============================

func createPoll(c *gin.Context) {

	var req CreatePollRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{
			"error": "Invalid request body",
		})
		return
	}

	req.Question = strings.TrimSpace(req.Question)

	if req.Question == "" {
		c.JSON(400, gin.H{
			"error": "Question is required",
		})
		return
	}

	if len(req.Options) < 2 {
		c.JSON(400, gin.H{
			"error": "At least 2 options are required",
		})
		return
	}

	options := make([]string, 0, len(req.Options))

	for _, option := range req.Options {

		option = strings.TrimSpace(option)

		if option == "" {
			c.JSON(400, gin.H{
				"error": "Options cannot be empty",
			})
			return
		}

		options = append(options, option)
	}

	poll := Poll{
		ID:        bson.NewObjectID(),
		Question:  req.Question,
		Options:   options,
		Votes:     make(map[string]int),
		Voters:    make(map[string]bool),
		CreatedAt: time.Now(),
	}

	// Initialize vote count
	for _, option := range options {
		poll.Votes[option] = 0
	}

	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)
	defer cancel()

	_, err := collection.InsertOne(ctx, poll)

	if err != nil {
		c.JSON(500, gin.H{
			"error": "Failed to create poll",
		})
		return
	}

	c.JSON(201, poll)
}

// ===============================
// VOTE POLL
// ONE IP = ONE VOTE PER POLL
// ===============================

func votePoll(c *gin.Context) {

	id := c.Param("id")

	objectID, err := bson.ObjectIDFromHex(id)

	if err != nil {
		c.JSON(400, gin.H{
			"error": "Invalid poll ID",
		})
		return
	}

	var req VoteRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{
			"error": "Invalid request body",
		})
		return
	}

	selectedOption := strings.TrimSpace(req.Option)

	// If frontend sends optionIndex
	if req.OptionIndex != nil {

		ctx, cancel := context.WithTimeout(
			context.Background(),
			10*time.Second,
		)
		defer cancel()

		var poll Poll

		err := collection.FindOne(
			ctx,
			bson.M{
				"_id": objectID,
			},
		).Decode(&poll)

		if err != nil {

			if err == mongo.ErrNoDocuments {
				c.JSON(404, gin.H{
					"error": "Poll not found",
				})
				return
			}

			c.JSON(500, gin.H{
				"error": "Failed to find poll",
			})
			return
		}

		index := *req.OptionIndex

		if index < 0 || index >= len(poll.Options) {
			c.JSON(400, gin.H{
				"error": "Invalid option",
			})
			return
		}

		selectedOption = poll.Options[index]
	}

	if selectedOption == "" {
		c.JSON(400, gin.H{
			"error": "Option is required",
		})
		return
	}

	// ===============================
	// GET USER IP
	// ===============================

	ipAddress := c.GetHeader("X-Forwarded-For")

	if ipAddress != "" {
		ipAddress = strings.TrimSpace(
			strings.Split(ipAddress, ",")[0],
		)
	}

	if ipAddress == "" {
		ipAddress = c.GetHeader("X-Real-IP")
	}

	if ipAddress == "" {
		ipAddress = c.ClientIP()
	}

	if ipAddress == "" {
		c.JSON(400, gin.H{
			"error": "Unable to identify IP address",
		})
		return
	}

	// Debug log
	fmt.Println("CLIENT IP:", ipAddress)

	// ===============================
	// HASH IP
	// ===============================

	hash := sha256.Sum256([]byte(ipAddress))

	ipHash := hex.EncodeToString(hash[:])

	// MongoDB fields
	voterField := "voters." + ipHash

	voteField := "votes." + selectedOption

	// ===============================
	// ATOMIC UPDATE
	// SAME IP CANNOT VOTE AGAIN
	// ===============================

	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)
	defer cancel()

	filter := bson.M{
		"_id": objectID,

		// Vote only if this IP has NOT voted
		voterField: bson.M{
			"$ne": true,
		},
	}

	update := bson.M{
		"$inc": bson.M{
			voteField: 1,
		},

		"$set": bson.M{
			voterField: true,
		},
	}

	result, err := collection.UpdateOne(
		ctx,
		filter,
		update,
	)

	if err != nil {

		fmt.Println("VOTE UPDATE ERROR:", err)

		c.JSON(500, gin.H{
			"error": "Failed to submit vote",
		})

		return
	}

	// ===============================
	// ALREADY VOTED
	// ===============================

	if result.MatchedCount == 0 {

		// Check whether poll exists
		var poll Poll

		findErr := collection.FindOne(
			ctx,
			bson.M{
				"_id": objectID,
			},
		).Decode(&poll)

		if findErr == mongo.ErrNoDocuments {

			c.JSON(404, gin.H{
				"error": "Poll not found",
			})

			return
		}

		c.JSON(409, gin.H{
			"error": "You have already voted in this poll",
		})

		return
	}

	fmt.Println(
		"VOTE SUCCESS:",
		ipAddress,
		"->",
		selectedOption,
	)

	c.JSON(200, gin.H{
		"message": "Vote submitted successfully",
	})
}

// ===============================
// DELETE POLL
// ===============================

func deletePoll(c *gin.Context) {

	id := c.Param("id")

	objectID, err := bson.ObjectIDFromHex(id)

	if err != nil {
		c.JSON(400, gin.H{
			"error": "Invalid poll ID",
		})
		return
	}

	ctx, cancel := context.WithTimeout(
		context.Background(),
		10*time.Second,
	)
	defer cancel()

	result, err := collection.DeleteOne(
		ctx,
		bson.M{
			"_id": objectID,
		},
	)

	if err != nil {
		c.JSON(500, gin.H{
			"error": "Failed to delete poll",
		})
		return
	}

	if result.DeletedCount == 0 {
		c.JSON(404, gin.H{
			"error": "Poll not found",
		})
		return
	}

	c.JSON(200, gin.H{
		"message": "Poll deleted successfully",
	})
}
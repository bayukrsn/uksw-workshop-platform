package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	goredis "github.com/go-redis/redis/v8"
)

const aiSuggestionCacheKey = "ai:suggestions:cache"
const aiSuggestionCacheTTL = 7 * 24 * time.Hour // 1 week

// FeedbackEntry holds a single feedback record
type FeedbackEntry struct {
	WorkshopName string `json:"workshopName"`
	WorkshopCode string `json:"workshopCode"`
	Rating       int    `json:"rating"`
	Review       string `json:"review"`
	RatedAt      string `json:"ratedAt"`
}

// LastDoneFeedbackData holds feedback from the last N completed workshops
type LastDoneFeedbackData struct {
	WorkshopCount int             `json:"workshopCount"`
	WorkshopNames []string        `json:"workshopNames"`
	TotalEntries  int             `json:"totalEntries"`
	Entries       []FeedbackEntry `json:"entries"`
}

// AISuggestion holds a single AI-generated workshop suggestion
type AISuggestion struct {
	Name         string `json:"name"`
	Rationale    string `json:"rationale"`
	WorkshopType string `json:"workshopType"`
	Credits      int    `json:"credits"`
	Quota        int    `json:"quota"`
	InspiredBy   string `json:"inspiredBy"`
}

// AISuggestionCache is what we store in Redis
type AISuggestionCache struct {
	Suggestions []AISuggestion       `json:"suggestions"`
	Feedback    LastDoneFeedbackData `json:"feedback"`
	CachedAt    time.Time            `json:"cachedAt"`
	ExpiresAt   time.Time            `json:"expiresAt"`
}

// GetLastDoneWorkshopsFeedback fetches ratings from the last 5 completed workshops
func GetLastDoneWorkshopsFeedback(ctx context.Context) (*LastDoneFeedbackData, error) {
	ctx, span := tracer.Start(ctx, "GetLastDoneWorkshopsFeedback")
	defer span.End()

	// Find the last 5 done workshop sessions ordered by date
	sessionQuery := `
		SELECT ws.id, w.name
		FROM workshop_sessions ws
		JOIN workshops w ON ws.workshop_id = w.id
		WHERE ws.status = 'done'
		ORDER BY ws.date DESC
		LIMIT 5
	`

	rows, err := db.QueryContext(ctx, sessionQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to query done sessions: %w", err)
	}
	defer rows.Close()

	var sessionIDs []string
	var workshopNames []string
	for rows.Next() {
		var sid, wname string
		if err := rows.Scan(&sid, &wname); err != nil {
			continue
		}
		sessionIDs = append(sessionIDs, sid)
		workshopNames = append(workshopNames, wname)
	}

	if len(sessionIDs) == 0 {
		return &LastDoneFeedbackData{
			WorkshopCount: 0,
			WorkshopNames: []string{},
			TotalEntries:  0,
			Entries:       []FeedbackEntry{},
		}, nil
	}

	// Build a parameterized IN clause for the session IDs
	placeholders := make([]string, len(sessionIDs))
	args := make([]interface{}, len(sessionIDs))
	for i, id := range sessionIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	feedbackQuery := fmt.Sprintf(`
		SELECT
			w.name as workshop_name,
			w.code as workshop_code,
			e.rating,
			COALESCE(e.review, '') as review,
			COALESCE(to_char(e.rated_at, 'YYYY-MM-DD HH24:MI'), '') as rated_at
		FROM enrollments e
		JOIN workshop_sessions ws ON e.class_id = ws.id
		JOIN workshops w ON ws.workshop_id = w.id
		WHERE e.rating IS NOT NULL
		  AND e.class_id IN (%s)
		  AND e.status = 'ACTIVE'
		ORDER BY ws.date DESC, e.rated_at DESC
	`, strings.Join(placeholders, ", "))

	feedbackRows, err := db.QueryContext(ctx, feedbackQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query feedback: %w", err)
	}
	defer feedbackRows.Close()

	var entries []FeedbackEntry
	for feedbackRows.Next() {
		var entry FeedbackEntry
		if err := feedbackRows.Scan(
			&entry.WorkshopName,
			&entry.WorkshopCode,
			&entry.Rating,
			&entry.Review,
			&entry.RatedAt,
		); err != nil {
			continue
		}
		entries = append(entries, entry)
	}

	return &LastDoneFeedbackData{
		WorkshopCount: len(sessionIDs),
		WorkshopNames: workshopNames,
		TotalEntries:  len(entries),
		Entries:       entries,
	}, nil
}

// buildLastDonePrompt creates the prompt from the last N done workshops
func buildLastDonePrompt(data *LastDoneFeedbackData) string {
	if data.WorkshopCount == 0 || data.TotalEntries == 0 {
		return `You are an academic workshop advisor. There is no student feedback data yet.
Based on general trends in university education and STEM learning, suggest 3 engaging workshop ideas.

Respond ONLY with a valid JSON array (no markdown, no explanation) in this exact format:
[
  {"name": "Workshop Name", "rationale": "Why this is needed", "workshopType": "Technical|Creative|Business|Leadership|General", "credits": 2, "quota": 30, "inspiredBy": "General trends"},
  ...
]`
	}

	var sb strings.Builder
	sb.WriteString("You are an academic workshop advisor for a university platform.\n")
	sb.WriteString(fmt.Sprintf("Here is student feedback from the %d most recently completed workshops:\n", data.WorkshopCount))
	sb.WriteString(fmt.Sprintf("Workshops covered: %s\n\n", strings.Join(data.WorkshopNames, ", ")))

	for i, e := range data.Entries {
		if i >= 20 {
			sb.WriteString(fmt.Sprintf("\n... and %d more feedback entries.\n", data.TotalEntries-20))
			break
		}
		sb.WriteString(fmt.Sprintf("- Workshop: \"%s\" | Rating: %d/5 | Review: \"%s\"\n", e.WorkshopName, e.Rating, e.Review))
	}

	sb.WriteString(`
Based on this feedback analysis, suggest exactly 3 NEW workshop ideas that students would love.
Consider: what topics are students excited about, what gaps exist, what themes appear in reviews.

Respond ONLY with a valid JSON array (no markdown, no explanation outside the JSON) in this exact format:
[
  {"name": "Workshop Name", "rationale": "2-3 sentence explanation", "workshopType": "Technical|Creative|Business|Leadership|General", "credits": 2, "quota": 30, "inspiredBy": "Short phrase"},
  ...
]`)

	return sb.String()
}

// GetCachedAISuggestions checks Redis for cached suggestions; calls HuggingFace on cache miss
func GetCachedAISuggestions(ctx context.Context) (*AISuggestionCache, error) {
	ctx, span := tracer.Start(ctx, "GetCachedAISuggestions")
	defer span.End()

	// Try Redis cache first
	cached, err := redisClient.Get(ctx, aiSuggestionCacheKey).Result()
	if err == nil {
		// Cache hit — deserialize and return
		var cacheData AISuggestionCache
		if jsonErr := json.Unmarshal([]byte(cached), &cacheData); jsonErr == nil {
			log.Printf("[AI] Cache hit — returning cached suggestions (expires %s)", cacheData.ExpiresAt.Format(time.RFC3339))
			return &cacheData, nil
		}
		log.Printf("[AI] Cache hit but failed to deserialize, regenerating")
	} else if err != goredis.Nil {
		log.Printf("[AI] Redis GET error (non-fatal, will regenerate): %v", err)
	} else {
		log.Printf("[AI] Cache miss — calling HuggingFace API")
	}

	// Cache miss — generate fresh suggestions
	return generateAndCacheSuggestions(ctx)
}

// RefreshAISuggestionsCache forces a new HuggingFace call, deletes old cache, stores new
func RefreshAISuggestionsCache(ctx context.Context) (*AISuggestionCache, error) {
	ctx, span := tracer.Start(ctx, "RefreshAISuggestionsCache")
	defer span.End()

	log.Printf("[AI] Force refresh — deleting cache key and calling HuggingFace API")

	// Delete existing cache unconditionally
	redisClient.Del(ctx, aiSuggestionCacheKey)

	return generateAndCacheSuggestions(ctx)
}

// generateAndCacheSuggestions fetches feedback, calls HF, and stores result in Redis
func generateAndCacheSuggestions(ctx context.Context) (*AISuggestionCache, error) {
	feedbackData, err := GetLastDoneWorkshopsFeedback(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch feedback: %w", err)
	}

	suggestions, err := GenerateWorkshopSuggestions(ctx, feedbackData)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	cacheData := &AISuggestionCache{
		Suggestions: suggestions,
		Feedback:    *feedbackData,
		CachedAt:    now,
		ExpiresAt:   now.Add(aiSuggestionCacheTTL),
	}

	// Store in Redis with TTL
	serialized, err := json.Marshal(cacheData)
	if err == nil {
		if setErr := redisClient.Set(ctx, aiSuggestionCacheKey, serialized, aiSuggestionCacheTTL).Err(); setErr != nil {
			log.Printf("[AI] Failed to write suggestion cache to Redis: %v", setErr)
		} else {
			log.Printf("[AI] Suggestions cached in Redis (TTL: %s)", aiSuggestionCacheTTL)
		}
	}

	return cacheData, nil
}

// GenerateWorkshopSuggestions calls HuggingFace Inference API and parses suggestions
func GenerateWorkshopSuggestions(ctx context.Context, data *LastDoneFeedbackData) ([]AISuggestion, error) {
	ctx, span := tracer.Start(ctx, "GenerateWorkshopSuggestions")
	defer span.End()

	apiKey := os.Getenv("HUGGINGFACE_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("HUGGINGFACE_API_KEY environment variable is not set")
	}

	prompt := buildLastDonePrompt(data)

	model := "meta-llama/Llama-3.1-8B-Instruct"
	url := "https://router.huggingface.co/v1/chat/completions"

	// router.huggingface.co uses OpenAI-compatible chat completions format
	hfPayload := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"max_tokens":  800,
		"temperature": 0.7,
	}

	payloadBytes, err := json.Marshal(hfPayload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal HF payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create HF request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HuggingFace API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read HF response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("[AI] HuggingFace API error %d: %s", resp.StatusCode, string(body))
		return nil, fmt.Errorf("HuggingFace API returned status %d: %s", resp.StatusCode, string(body))
	}

	log.Printf("[AI] HuggingFace raw response: %s", string(body))

	// router.huggingface.co returns OpenAI-compatible: {choices:[{message:{content:"..."}}]}
	var hfResponse struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &hfResponse); err != nil {
		return nil, fmt.Errorf("failed to parse HF response: %w", err)
	}

	if len(hfResponse.Choices) == 0 {
		return nil, fmt.Errorf("empty response from HuggingFace")
	}

	generatedText := hfResponse.Choices[0].Message.Content

	// Extract JSON array from the response text
	suggestions, err := extractSuggestionsFromText(generatedText)
	if err != nil {
		log.Printf("[AI] Failed to parse suggestions from: %s, error: %v", generatedText, err)
		return nil, fmt.Errorf("failed to extract suggestions from AI response: %w", err)
	}

	return suggestions, nil
}

// extractSuggestionsFromText finds and parses the JSON array from the AI's text output
func extractSuggestionsFromText(text string) ([]AISuggestion, error) {
	start := strings.Index(text, "[")
	end := strings.LastIndex(text, "]")

	if start == -1 || end == -1 || end <= start {
		return nil, fmt.Errorf("no JSON array found in response")
	}

	jsonStr := text[start : end+1]

	var suggestions []AISuggestion
	if err := json.Unmarshal([]byte(jsonStr), &suggestions); err != nil {
		return nil, fmt.Errorf("failed to unmarshal suggestions JSON: %w", err)
	}

	// Validate and set defaults
	validTypes := map[string]bool{
		"Technical": true, "Creative": true, "Business": true, "Leadership": true, "General": true,
	}
	for i := range suggestions {
		if !validTypes[suggestions[i].WorkshopType] {
			suggestions[i].WorkshopType = "General"
		}
		if suggestions[i].Credits < 1 || suggestions[i].Credits > 6 {
			suggestions[i].Credits = 2
		}
		if suggestions[i].Quota < 10 || suggestions[i].Quota > 100 {
			suggestions[i].Quota = 30
		}
	}

	return suggestions, nil
}

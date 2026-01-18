// js/ai-mediator.js
import { state, authState, roomState, lastPickedMovieId } from "./state.js";
import { toast } from "./ui.js";

// === CONFIGURATION ===
// Replace this with your actual Cloudflare Worker URL
const BRAIN_API_URL = "https://ai-mediator.idrisshakir445.workers.dev/";

// Extensible context builder
export function buildAIContext() {
    const context = {
        timestamp: new Date().toISOString(),
        factors: {}
    };

    // Factor 1: Time context
    context.factors.time = getTimeContext();

    // Factor 2: Pool analysis
    context.factors.pool = getPoolContext();

    // Factor 3: Group dynamics
    context.factors.group = getGroupContext();

    // Factor 4: Chat Sentiment (NEW)
    context.factors.chat = getChatContext();
    context.factors.ratings = getRatingsContext();
    context.factors.watchHistory = getWatchHistoryContext();
    context.factors.chatSentiment = getChatSentimentContext();
    return context;
}

function getWatchHistoryContext() {
    const watched = Array.from(state.watched || []);
    const watchedCount = watched.length;
    const lastPickedId = lastPickedMovieId || null;

    const pool = state.pool || [];
    const freshCount = pool.filter(m => !watched.includes(String(m.id))).length;

    return {
        watchedCount,
        lastPickedId,
        freshCount,
        preferFresh: watchedCount > 0 && freshCount > 0,
    };
}

function getChatSentimentContext() {
    const msgs = roomState.messages || [];
    if (!msgs.length) {
        return {
            hasChat: false,
            mood: "neutral",
            sample: [],
        };
    }

    const recent = msgs.slice(-15);
    const text = recent.map(m => (m.text || "").toLowerCase()).join(" ");

    const positiveWords = ["lol", "funny", "hype", "excited", "party", "wild"];
    const calmWords = ["tired", "chill", "cozy", "sleepy", "relax"];
    const intenseWords = ["scary", "thriller", "dark", "intense", "serious"];

    let mood = "neutral";
    let score = 0;

    positiveWords.forEach(w => { if (text.includes(w)) score += 1; });
    calmWords.forEach(w => { if (text.includes(w)) score -= 1; });
    intenseWords.forEach(w => { if (text.includes(w)) score += 0.5; });

    if (score >= 2) mood = "high-energy";
    else if (score <= -1) mood = "low-key";

    return {
        hasChat: true,
        mood,
        sample: recent.slice(-5).map(m => ({
            user: m.user,
            text: m.text,
            type: m.type,
        })),
    };
}


// Time-based context
function getTimeContext() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' });

    let timeOfDay = 'evening';
    if (hour < 12) timeOfDay = 'morning';
    else if (hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 22) timeOfDay = 'late night';

    return {
        hour,
        day,
        timeOfDay,
        isWeekend: day === 'Saturday' || day === 'Sunday'
    };
}

// Pool composition
function getPoolContext() {
    const pool = state.pool || [];
    return {
        totalMovies: pool.length,
        movies: pool.slice(0, 15).map(m => ({
            title: m.title,
            year: m.releaseDate?.slice(0, 4),
            rating: m.voteAverage,
            // Add genre IDs if available to help AI
            genres: m.genre_ids ? m.genre_ids.join(',') : ''
        })),
        averageRating: pool.length > 0
            ? (pool.reduce((sum, m) => sum + (m.voteAverage || 0), 0) / pool.length).toFixed(1)
            : 0,
        hasHighRated: pool.some(m => (m.voteAverage || 0) > 8)
    };
}

// Group dynamics
function getGroupContext() {
    const members = roomState.members || [];
    const onlineCount = members.filter(m => m.online).length;

    return {
        totalMembers: members.length,
        onlineMembers: onlineCount,
        isGroup: members.length >= 3,
        isPair: members.length === 2,
        isSolo: members.length <= 1
    };
}

// Chat Context (New Logic)
function getChatContext() {
    const msgs = roomState.messages || [];
    if (msgs.length === 0) return { vibe: "Quiet", recentHistory: "No recent chat." };

    // Filter for text messages only and grab the last 15
    const recentText = msgs
        .filter(m => m.type === 'text')
        .slice(-15)
        .map(m => `${m.user}: ${m.text}`)
        .join('\n');

    return {
        messageCount: msgs.length,
        recentHistory: recentText || "No recent text chat."
    };
}

export function generatePrompt(context) {
    const {
        time,
        pool,
        group,
        activity,
        ratings,
        watchHistory,
        chatSentiment,
    } = context.factors;


    const moviesList = pool.movies
        .map(m => `- ${m.title} (${m.year || "?"}) — rating ${m.rating || "?"}/10`)
        .join("\n");

    const chatSample = (chatSentiment?.sample || [])
        .map(m => `- ${m.user}: ${m.text}`)
        .join("\n");

    const prompt = `
  You are **CineCircle AI**, a movie recommendation expert embedded inside a shared watch room.
  Analyze this movie night scenario and recommend ONE movie from the pool with a persuasive explanation.
  
  [TIME]
  - Day: ${time.day}
  - Local time: ${String(time.hour).padStart(2, "0")}:00 (${time.timeOfDay})
  - Weekend: ${time.isWeekend ? "yes" : "no"}
  
  [GROUP]
  - Total members: ${group.totalMembers}
  - Online now: ${group.onlineMembers}
  - Mode: ${group.isGroup ? "group" : group.isPair ? "pair" : "solo"}
  
  [POOL]
  - Movies in pool: ${pool.totalMovies}
  - Average rating (pool): ${pool.averageRating}/10
  - High-rated movies (>= 8): ${ratings.highRatedCount}
  - Movies below user min-rating (${ratings.minRating}): ${ratings.lowRatedCount}
  
  [WATCH HISTORY]
  - Watched items tracked: ${watchHistory.watchedCount}
  - Fresh movies in pool (not watched): ${watchHistory.freshCount}
  - Prefer fresh over repeats: ${watchHistory.preferFresh ? "yes" : "no"}
  
  [CHAT MOOD]
  - Has recent chat: ${chatSentiment.hasChat ? "yes" : "no"}
  - Detected mood: ${chatSentiment.mood}
  ${chatSentiment.hasChat && chatSample ? "Recent messages:\n" + chatSample : ""}
  
  [AVAILABLE MOVIES]
  ${moviesList || "- (no movies listed)"}
  
  [TASK]
  Pick exactly ONE movie from the pool above and explain why it is the best choice
  for this specific group, at this specific time, given:
  1. Time appropriateness (e.g., lighter on weeknights, longer/deeper on weekends and late nights)
  2. Group size and mood (solo vs date vs group)
  3. Movie quality and ratings
  4. Preference for FRESH picks over movies that might already be watched
  5. The recent chat mood (high-energy vs low-key)
  
  [OUTPUT FORMAT]
  You MUST respond with a single JSON object and nothing else:
  
  {
    "movie": "Exact movie title from the pool",
    "confidence": 0-100,
    "reasoning": "2-4 conversational sentences that make them want to watch it."
  }
  
  - "movie" must exactly match one of the titles in the pool list.
  - "confidence" is a number from 0 to 100 (no % sign).
  - "reasoning" should reference specific factors (time of day, group size, mood, ratings).
  `;

    return prompt;
}

// js/ai-mediator.js

function getRatingsContext() {
    const pool = state.pool || [];
    const minRating = state.filters?.minRating ?? 6;

    const ratings = pool.map(m => m.voteAverage || 0);
    const avg = ratings.length
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
        : 0;

    const highRatedCount = pool.filter(m => (m.voteAverage || 0) >= 8).length;
    const lowRatedCount = pool.filter(m => (m.voteAverage || 0) < minRating).length;

    return {
        minRating,
        averageRating: avg,
        highRatedCount,
        lowRatedCount,
    };
}

export async function getAISuggestion() {
    const context = buildAIContext();
    const prompt = generatePrompt(context);

    try {
        const response = await fetch(BRAIN_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful movie mediator. You MUST return valid JSON with keys: movie, confidence (number), reasoning."
                    },
                    { role: "user", content: prompt }
                ]
            })
        });

        const data = await response.json();
        console.log("🤖 Raw AI Response:", data);

        if (data.error) {
            throw new Error(`OpenRouter Error: ${data.error.message || data.error}`);
        }
        if (!data.choices || !data.choices[0]) {
            throw new Error("Invalid response: choices[0] missing");
        }

        const content = data.choices[0].message.content;

        try {
            return JSON.parse(content);
        } catch (e) {
            console.warn("AI returned non-JSON", content);
            return {
                movie: "AI Parse Error",
                confidence: 0,
                reasoning: content
            };
        }

    } catch (e) {
        console.error('❌ AI Failed:', e);
        toast(`AI Error: ${e.message}`, 'error');
        return null;
    }
}


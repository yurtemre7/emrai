// api/main.ts
import "jsr:@std/dotenv/load";
import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { logger } from "@hono/hono/logger";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: "http://localhost:5173",
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 600,
  }),
);
app.use(
  "/api/*",
  logger(),
);

app.get("/", (c) => {
  return c.text("Welcome to the emrai API!");
});

// Define the OpenAI API endpoint
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Get the OpenAI API key from environment variables
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

// Get valid API keys from environment variables
const VALID_API_KEYS = Deno.env.get('VALID_API_KEYS')?.split(',') || [];

// Usage tracking with Deno KV
const kv = await Deno.openKv();

// Simple authentication middleware
const authenticate = async (c: any, next: any) => {
  const apiKey = c.req.header('X-API-Key');
  
  if (!apiKey || !VALID_API_KEYS.includes(apiKey)) {
    return c.json({ error: 'Unauthorized: Invalid API key' }, 401);
  }
  
  // Use the API key as the user ID for simplicity
  c.set('userId', apiKey);
  
  await next();
};

// Usage tracking middleware
const trackUsage = async (c: any, next: any) => {
  const userId = c.req.header('X-API-Key');
  const today = new Date().toISOString().split('T')[0];
  
  // Get current usage count
  const usageKey = [`usage-${userId}-${today}`];
  const currentUsage = await kv.get(usageKey);
  const count = (currentUsage.value as number) || 0;
  
  // Check if user has exceeded daily limit
  const DAILY_LIMIT = parseInt(Deno.env.get('DAILY_LIMIT') || '100');
  if (count >= DAILY_LIMIT) {
    return c.json({ error: 'Daily usage limit exceeded' }, 429);
  }
  
  // Continue to the next handler
  await next();
  
  // Increment usage after successful request
  await kv.set(usageKey, count + 1);
};

// Check if OpenAI API key is configured
const checkOpenAiKey = (c: any, next: any) => {
  if (!OPENAI_API_KEY) {
    return c.json({ error: 'OpenAI API key is not configured' }, 500);
  }
  return next();
};


// Apply middlewares to the API routes
app.use('/api/*', authenticate, trackUsage, checkOpenAiKey);

// Health check endpoint
app.get('/', (c) => c.json({ status: 'ok' }));

// Get current usage
app.get('/api/usage', async (c) => {
  const userId = c.req.header("X-API-Key");
  const today = new Date().toISOString().split('T')[0];
  
  const usageKey = [`usage-${userId}-${today}`];
  const currentUsage = await kv.get(usageKey);
  const count = (currentUsage.value as number) || 0;
  
  const DAILY_LIMIT = parseInt(Deno.env.get('DAILY_LIMIT') || '100');
  
  return c.json({
    usage: count,
    limit: DAILY_LIMIT,
    remaining: DAILY_LIMIT - count
  });
});

// Define the request handler for the completions endpoint
app.post('/api/completions', async (c) => {
  try {
    // Parse the request body
    const body = await c.req.json();
    const prompt = body.p;

    if (!prompt) {
      return c.json({ error: 'Prompt is required' }, 400);
    }

    // Prepare the request to OpenAI
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: parseInt(Deno.env.get('MAX_TOKENS') || '1000'),
        temperature: parseFloat(Deno.env.get('TEMPERATURE') || '0.7'),
      }),
    });

    // Check if the request was successful
    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      return c.json({ error: 'Failed to get completions from OpenAI', code: response.status });
    }

    // Parse the response from OpenAI
    const data = await response.json();
    const answer = data.choices[0].message.content.trim();

    // Return the answer
    return c.json({ a: answer });
  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'An error occurred' }, 500);
  }
});

// Get API key information
app.get('/api/key-info', (c) => {
  return c.json({
    keys: VALID_API_KEYS.length,
    dailyLimit: parseInt(Deno.env.get('DAILY_LIMIT') || '100')
  });
});


const port = parseInt(Deno.env.get('PORT') || '8000');

Deno.serve(app.fetch);

console.log(`Server is running on http://localhost:${port}`);

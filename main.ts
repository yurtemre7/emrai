// api/main.ts
import "jsr:@std/dotenv/load";
import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";

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

app.get("/", (c) => {
  return c.text("Welcome to the emrai API!");
});


Deno.serve(app.fetch);

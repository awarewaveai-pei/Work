import express from "express";

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "node-api",
    port: Number(port)
  });
});

app.get("/rag/health", (_req, res) => {
  res.json({
    ok: true,
    service: "rag",
    supabaseUrl: process.env.SUPABASE_URL ? "configured" : "missing",
    openai: process.env.OPENAI_API_KEY ? "configured" : "missing"
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`node-api listening on ${port}`);
});

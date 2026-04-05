/**
 * Semantic search: embed the question (OpenAI) then call Postgres RPC match_documents.
 *
 * Adjust RPC_NAME and rpc() args below if your SQL function uses different names.
 * Example SQL (1536 dims = text-embedding-3-small):
 *
 *   create or replace function match_documents(
 *     query_embedding vector(1536),
 *     match_threshold float,
 *     match_count int
 *   ) returns setof ... language sql ...
 *
 * Run: npx tsx scripts/rag_query.ts "你的問題"
 * Or:  npm run rag:query -- "你的問題"
 * Optional: npm run rag:query -- --threshold 0.05 --limit 10 "你的問題"
 * Or set MATCH_THRESHOLD / MATCH_COUNT in .env.local
 */

import { parse } from 'dotenv'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const envPath = join(repoRoot, '.env.local')
if (existsSync(envPath)) {
  let raw = readFileSync(envPath, 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
  const parsed = parse(raw)
  for (const [k, v] of Object.entries(parsed)) {
    const key = k.replace(/^\uFEFF/, '').trim()
    if (!key) continue
    process.env[key] = String(v).replace(/^\uFEFF/, '').trim()
  }
}

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const openaiApiKey = process.env.OPENAI_API_KEY?.trim()
const embeddingModel = (process.env.EMBEDDING_MODEL || 'text-embedding-3-small').trim()

if (!supabaseUrl || !supabaseServiceRoleKey || !openaiApiKey) {
  throw new Error('Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY in .env.local')
}

const RPC_NAME = 'match_documents'

function parseArgs(argv: string[]): { question: string; threshold: number; matchCount: number } {
  let threshold = Number.parseFloat(process.env.MATCH_THRESHOLD ?? '0.05')
  if (Number.isNaN(threshold)) threshold = 0.05
  let matchCount = Number.parseInt(process.env.MATCH_COUNT ?? '8', 10)
  if (Number.isNaN(matchCount)) matchCount = 8
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--threshold' && argv[i + 1] !== undefined) {
      threshold = Number.parseFloat(argv[++i]!)
      continue
    }
    if (a === '--limit' && argv[i + 1] !== undefined) {
      matchCount = Number.parseInt(argv[++i]!, 10)
      continue
    }
    rest.push(a)
  }
  return { question: rest.join(' ').trim(), threshold, matchCount }
}

type EmbeddingResponse = {
  data: Array<{ embedding: number[] }>
}

async function embedQuery(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({ model: embeddingModel, input: text }),
  })
  if (!response.ok) {
    throw new Error(`OpenAI embeddings: ${response.status} ${await response.text()}`)
  }
  const json = (await response.json()) as EmbeddingResponse
  const v = json.data?.[0]?.embedding
  if (!v?.length) throw new Error('No embedding returned')
  return v
}

async function main() {
  const { question, threshold, matchCount } = parseArgs(process.argv.slice(2))
  if (!question) {
    console.error('Usage: npm run rag:query -- "你的問題"')
    console.error('        npm run rag:query -- --threshold 0.02 --limit 10 "關鍵字"')
    process.exit(1)
  }

  console.log(`match_threshold=${threshold}, match_count=${matchCount} (lower threshold = more permissive if your SQL uses "similarity > threshold")`)
  console.log('Embedding question...')
  const embedding = await embedQuery(question)
  const vectorLiteral = `[${embedding.join(',')}]`

  const supabase = createClient(supabaseUrl!, supabaseServiceRoleKey!)

  console.log(`Calling RPC ${RPC_NAME}...`)
  const { data, error } = await supabase.rpc(RPC_NAME, {
    query_embedding: vectorLiteral,
    match_threshold: threshold,
    match_count: matchCount,
  })

  if (error) {
    console.error('RPC error:', JSON.stringify(error, null, 2))
    console.error(
      'If args are wrong, open SQL in Studio for your match_documents() and edit rag_query.ts rpc() payload.'
    )
    process.exit(1)
  }

  const rows = data ?? []
  if (Array.isArray(rows) && rows.length === 0) {
    console.error(
      'No rows. Common fixes: (1) Lower threshold: npm run rag:query -- --threshold 0.01 "..." ' +
        '(2) Use words that appear in your chunks. (3) In Studio, open match_documents SQL — extra WHERE (e.g. org id) may filter everything.'
    )
  }
  console.log(JSON.stringify(data, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

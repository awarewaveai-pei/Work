import { parse } from 'dotenv'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

// Load monorepo-root .env.local; strip UTF-8 BOM (PowerShell Set-Content utf8 adds BOM and breaks first key).
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

type KnowledgeChunkRow = {
  id: string
  organization_id: string
  workspace_id: string | null
  scope_type: string
  scope_id: string | null
  document_id: string
  chunk_index: number
  content: string
}

type EmbeddingResponse = {
  data: Array<{
    embedding: number[]
  }>
}

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const openaiApiKey = process.env.OPENAI_API_KEY?.trim()
const embeddingModel = (process.env.EMBEDDING_MODEL || 'text-embedding-3-small').trim()

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL in .env.local — run npm run rag:setup')
}

if (
  supabaseUrl.length < 12 ||
  (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://'))
) {
  throw new Error(
    'SUPABASE_URL looks corrupt or incomplete (must be like http://IP:8000). Re-run: npm run rag:setup'
  )
}

try {
  const host = new URL(supabaseUrl).hostname.toLowerCase()
  const raw = supabaseUrl.toLowerCase()
  const looksPlaceholder =
    host === 'your_server_ip' ||
    raw.includes('your_server_ip') ||
    host.includes('example.com') ||
    (supabaseServiceRoleKey &&
      (supabaseServiceRoleKey.includes('YOUR_') ||
        supabaseServiceRoleKey.toLowerCase().includes('your_service_role')))
  if (looksPlaceholder) {
    throw new Error(
      'SUPABASE_URL (or key) still looks like a placeholder. Use a real host/IP in SUPABASE_URL (e.g. http://127.0.0.1:8000) and real keys from Studio → Project Settings → API.'
    )
  }
} catch (e) {
  if (e instanceof TypeError) {
    const hint =
      supabaseUrl.length === 0
        ? '(empty after trim — check .env.local; re-run npm run rag:setup)'
        : `(length ${supabaseUrl.length}, first char code ${supabaseUrl.charCodeAt(0)})`
    throw new Error(`SUPABASE_URL is not a valid URL ${hint}`)
  }
  throw e
}

if (!supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
}

if (!openaiApiKey) {
  throw new Error('Missing OPENAI_API_KEY')
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function getChunksWithoutEmbeddings(limit = 50): Promise<KnowledgeChunkRow[]> {
  const { data, error } = await supabase
    .from('knowledge_chunks')
    .select(`
      id,
      organization_id,
      workspace_id,
      scope_type,
      scope_id,
      document_id,
      chunk_index,
      content
    `)
    .not('content', 'is', null)
    .limit(limit)

  if (error) {
    throw error
  }

  const chunkIds = (data ?? []).map((row) => row.id)

  if (chunkIds.length === 0) {
    return []
  }

  const { data: existingEmbeddings, error: existingError } = await supabase
    .from('knowledge_embeddings')
    .select('chunk_id')
    .in('chunk_id', chunkIds)

  if (existingError) {
    throw existingError
  }

  const existingChunkIdSet = new Set(
    (existingEmbeddings ?? []).map((row: { chunk_id: string }) => row.chunk_id)
  )

  return (data ?? []).filter((row) => !existingChunkIdSet.has(row.id)) as KnowledgeChunkRow[]
}

async function createEmbedding(input: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: embeddingModel,
      input,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Embedding API error: ${response.status} ${errorText}`)
  }

  const json = (await response.json()) as EmbeddingResponse
  const embedding = json.data?.[0]?.embedding

  if (!embedding) {
    throw new Error('No embedding returned from API')
  }

  return embedding
}

async function insertEmbedding(chunk: KnowledgeChunkRow, embedding: number[]) {
  // PostgREST + pgvector: pass vector as a string "[0.1,0.2,...]" (plain number[] often fails insert).
  const vectorLiteral = `[${embedding.join(',')}]`
  const payload = {
    organization_id: chunk.organization_id,
    workspace_id: chunk.workspace_id,
    scope_type: chunk.scope_type,
    scope_id: chunk.scope_id,
    chunk_id: chunk.id,
    model: embeddingModel,
    embedding: vectorLiteral,
    metadata: {
      document_id: chunk.document_id,
      chunk_index: chunk.chunk_index,
      source: 'rag_seed_and_embedding.ts',
    },
  }

  const { error } = await supabase.from('knowledge_embeddings').insert(payload as never)

  if (error) {
    console.error('Supabase insert error:', JSON.stringify(error, null, 2))
    throw error
  }
}

async function main() {
  console.log('Loading chunks without embeddings...')
  const chunks = await getChunksWithoutEmbeddings(50)

  if (chunks.length === 0) {
    console.log('No chunks need embeddings.')
    return
  }

  console.log(`Found ${chunks.length} chunks to embed.`)

  for (const chunk of chunks) {
    console.log(`Embedding chunk ${chunk.id}...`)
    const embedding = await createEmbedding(chunk.content)
    await insertEmbedding(chunk, embedding)
    console.log(`Inserted embedding for chunk ${chunk.id}`)
  }

  console.log('Done.')
}

main().catch((error: unknown) => {
  console.error(error)
  if (error && typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; code?: string }
    if (e.details || e.hint || e.code) {
      console.error('details:', e.details, 'hint:', e.hint, 'code:', e.code)
    }
  }
  process.exit(1)
})

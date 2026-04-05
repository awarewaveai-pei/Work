import { createClient } from '@supabase/supabase-js'

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

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiApiKey = process.env.OPENAI_API_KEY
const embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL')
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
  const payload = {
    organization_id: chunk.organization_id,
    workspace_id: chunk.workspace_id,
    scope_type: chunk.scope_type,
    scope_id: chunk.scope_id,
    chunk_id: chunk.id,
    model: embeddingModel,
    embedding,
    metadata: {
      document_id: chunk.document_id,
      chunk_index: chunk.chunk_index,
      source: 'rag_seed_and_embedding.ts',
    },
  }

  const { error } = await supabase.from('knowledge_embeddings').insert(payload)

  if (error) {
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

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

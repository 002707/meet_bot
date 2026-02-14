import { Pinecone } from '@pinecone-database/pinecone'

let pinecone: Pinecone | null = null
let index: ReturnType<Pinecone['index']> | null = null

if (process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_NAME) {
    pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
    })
    index = pinecone.index(process.env.PINECONE_INDEX_NAME)
}

export async function saveManyVectors(vectors: Array<{
    id: string
    embedding: number[]
    metadata: any
}>) {
    if (!index) {
        console.warn('[pinecone] Not configured, skipping saveManyVectors')
        return
    }
    const upsertData = vectors.map(v => ({
        id: v.id,
        values: v.embedding,
        metadata: v.metadata
    }))

    await index.upsert(upsertData)
}

export async function searchVectors(
    embedding: number[],
    filter: any = {},
    topK: number = 5
) {
    if (!index) {
        console.warn('[pinecone] Not configured, skipping searchVectors')
        return []
    }
    const result = await index.query({
        vector: embedding,
        filter,
        topK,
        includeMetadata: true
    })

    return result.matches || []
}

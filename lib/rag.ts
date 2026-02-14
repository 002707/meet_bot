import { prisma } from "./db";
import { chatWithAI, createEmbedding, createManyEmbeddings } from "./openai";
import { saveManyVectors, searchVectors } from "./pinecone";
import { chunkTranscript, extractSpeaker } from "./text-chunker";

export async function processTranscript(
    meetingId: string,
    userId: string,
    transcript: string,
    meetingTitle?: string
) {
    const chunks = chunkTranscript(transcript)

    const texts = chunks.map(chunk => chunk.content)

    const embeddings = await createManyEmbeddings(texts)

    const dbChunks = chunks.map((chunk) => ({
        meetingId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        speakerName: extractSpeaker(chunk.content),
        vectorId: `${meetingId}_chunk_${chunk.chunkIndex}`
    }))

    await prisma.transcriptChunk.createMany({
        data: dbChunks,
        skipDuplicates: true
    })

    const vectors = chunks.map((chunk, index) => ({
        id: `${meetingId}_chunk_${chunk.chunkIndex}`,
        embedding: embeddings[index],
        metadata: {
            meetingId,
            userId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            speakerName: extractSpeaker(chunk.content),
            meetingTitle: meetingTitle || 'Untitled Meeting'

        }
    }))

    await saveManyVectors(vectors)
}

export async function chatWithMeeting(
    userId: string,
    meetingId: string,
    question: string
) {
    const hasPinecone = !!(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_NAME)

    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId }
    })

    let context = ''
    let results: any[] = []

    if (hasPinecone) {
        const questionEmbedding = await createEmbedding(question)

        results = await searchVectors(
            questionEmbedding,
            { userId, meetingId },
            5
        )

        context = results
            .map(result => {
                const speaker = result.metadata?.speakerName || 'Unknown'
                const content = result.metadata?.content || ''
                return `${speaker}: ${content}`
            })
            .join('\n\n')
    }

    const systemPrompt = hasPinecone && context
        ? `You are helping someone understand their meeting.
    Meeting: ${meeting?.title || 'Untitled Meeting'}
    Date: ${meeting?.createdAt ? new Date(meeting.createdAt).toDateString() : 'Unknown'}

    Here's what was discussed:
    ${context}

    Answer the user's question based only on the meeting content above. If the answer isn't in the meeting, say so.`
        : `You are a helpful AI meeting assistant for the meeting "${meeting?.title || 'Untitled Meeting'}". No transcript is available yet for this meeting. Answer the user's question helpfully based on your general knowledge.`

    const answer = await chatWithAI(systemPrompt, question)

    return {
        answer,
        sources: results.map(result => ({
            meetingId: result.metadata?.meetingId,
            content: result.metadata?.content,
            speakerName: result.metadata?.speakerName,
            confidence: result.score
        }))
    }
}

export async function chatWithAllMeetings(
    userId: string,
    question: string
) {
    const hasPinecone = !!(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_NAME)

    let context = ''
    let results: any[] = []

    if (hasPinecone) {
        const questionEmbedding = await createEmbedding(question)

        results = await searchVectors(
            questionEmbedding,
            { userId },
            8
        )

        context = results
            .map(result => {
                const meetingTitle = result.metadata?.meetingTitle || 'Untitled Meeting'
                const speaker = result.metadata?.speakerName || 'Unknown'
                const content = result.metadata?.content || ''
                return `Meeting: ${meetingTitle}\n${speaker}: ${content}`
            })
            .join('\n\n---\n\n')
    }

    const systemPrompt = hasPinecone && context
        ? `You are helping someone understand their meeting history.

    Here's what was discussed across their meetings:
    ${context}

    Answer the user's question based on the meeting content above. When you reference something, mention which meeting it's from.`
        : `You are a helpful AI meeting assistant. You help users with questions about meetings, productivity, and work. Since there are no meeting transcripts available yet, answer the user's question helpfully based on your general knowledge.`

    const answer = await chatWithAI(systemPrompt, question)

    return {
        answer,
        sources: results.map(result => ({
            meetingId: result.metadata?.meetingId,
            meetingTitle: result.metadata?.meetingTitle,
            content: result.metadata?.content,
            speakerName: result.metadata?.speakerName,
            confidence: result.score
        }))
    }
}
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getRAGEngine } from '@/lib/rag-engine';

// ─── System Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — MP Эксперт, гуру-селлер с многолетним опытом на маркетплейсах Wildberries и Ozon.

Твои ответы:
- Конкретные, с цифрами и расчётами из предоставленного контекста
- С рассуждениями: "рынок X, селлеров Y, значит медиана Z, потому что топ-1% забирает W%"
- Практические рекомендации с обоснованием
- Если не знаешь точных цифр — говоришь "ориентировочно" и объясняешь логику
- Всегда на русском языке
- Структурированные: заголовки, списки, примеры

Ты знаешь:
- Внутреннюю рекламу WB (АРК, авто-РК, буст, CPM, CTR, ДРР, CRF(L))
- Ранжирование на WB (факторы, алгоритмы, органика vs реклама)
- Ценообразование (СПП, акции, медианная цена, дебуст)
- Ozon (FBO, FBS, realFBO, селлер-прайм, реклама, Rich-контент)
- Карго, логистику, Китай, юань, таможню, сертификацию
- Налоги (НДС, УСН, ИРП)
- Аналитику (MPStats, внутренние отчёты, воронки)
- Рыночную аналитику: оборот WB 6,1 трлн руб (2025), Ozon ~4 трлн, комиссии, тренды
- Обучающие курсы: Ланцов, Куриленко, Шевченко, Сулеймановы, Алхутов и др.
- Экспертные данные от Evirma (CRF(L), плагин, кластеризация, ставки)
- Статьи и руководства: SEO карточек, ДРР и реклама, юнит-экономика

Если вопрос не по теме маркетплейсов — вежливо скажи, что твоя специализация — маркетплейсы.

ВАЖНО: Используй информацию из предоставленного контекста. Если контекст содержит релевантные данные — обязательно используй их в ответе с конкретными цифрами. Указывай источники данных, если они есть в контексте. Не выдумывай цифры — используй только данные из контекста или свои точные знания.`;

// ─── Multi-Key Gemini Rotation ──────────────────────────────────────────────

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const GEMINI_KEYS_STR = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const GEMINI_KEYS = GEMINI_KEYS_STR.split(',').map(k => k.trim()).filter(k => k.length > 0);

if (GEMINI_KEYS.length === 0) {
  console.log('⚠️ No GEMINI_API_KEY(S) configured');
}

// Key rotation state
let currentKeyIdx = 0;
const keyCooldowns = new Map<string, number>();
const keyErrors = new Map<string, number>();

function getNextKey(): string {
  const now = Date.now();
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const idx = (currentKeyIdx + i) % GEMINI_KEYS.length;
    const key = GEMINI_KEYS[idx];
    const cooldown = keyCooldowns.get(key) || 0;
    if (now > cooldown) {
      currentKeyIdx = (idx + 1) % GEMINI_KEYS.length;
      console.log(`🔑 Using key #${idx + 1}/${GEMINI_KEYS.length}`);
      return key;
    }
  }
  // All on cooldown - use earliest available
  let bestKey = GEMINI_KEYS[0];
  let bestTime = Infinity;
  for (const key of GEMINI_KEYS) {
    const cd = keyCooldowns.get(key) || 0;
    if (cd < bestTime) { bestTime = cd; bestKey = key; }
  }
  return bestKey;
}

function markKeyRateLimited(key: string, cooldownMs = 30000): void {
  keyCooldowns.set(key, Date.now() + cooldownMs);
  const errors = (keyErrors.get(key) || 0) + 1;
  keyErrors.set(key, errors);
  console.log(`🚫 Key #${GEMINI_KEYS.indexOf(key) + 1} rate limited → cooldown ${cooldownMs}ms (errors: ${errors})`);
}

function createOpenAI(): OpenAI {
  const key = getNextKey();
  return new OpenAI({ apiKey: key, baseURL: GEMINI_BASE_URL });
}

// ─── Concurrency Limiter ────────────────────────────────────────────────────

const MAX_CONCURRENT = 3;
let activeRequests = 0;

async function acquireSlot(): Promise<void> {
  while (activeRequests >= MAX_CONCURRENT) {
    await new Promise(r => setTimeout(r, 300));
  }
  activeRequests++;
}

function releaseSlot(): void {
  activeRequests = Math.max(0, activeRequests - 1);
}

// ─── Fallback Reply ─────────────────────────────────────────────────────────

function buildFallbackReply(
  message: string,
  blocks: Array<{ text: string; section: string; score: number }>,
  topic: string
): string {
  const topBlocks = blocks.slice(0, 8);
  let reply = `⏳ LLM временно недоступен, но вот что нашёл в базе знаний по теме "${topic}":\n\n`;
  for (let i = 0; i < topBlocks.length; i++) {
    const block = topBlocks[i];
    reply += `**${i + 1}. [${block.section}]**\n${block.text.substring(0, 400)}${block.text.length > 400 ? '...' : ''}\n\n`;
  }
  reply += `---\n*Найдено ${blocks.length} релевантных блоков. Попробуйте повторить запрос через несколько секунд для получения полного ответа от AI.*`;
  return reply;
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { message, topic, history, stream: useStream } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const startTime = Date.now();

    // RAG search
    const ragEngine = await getRAGEngine();
    const searchResult = await ragEngine.search(message, topic || undefined);
    const searchTime = Date.now() - startTime;

    console.log(`🧠 Query: "${message}" | Topic: "${searchResult.topic}" (${searchResult.topicConfidence}) | BM25: ${searchResult.blocksFound} blocks | ${searchTime}ms`);

    const context = searchResult.context;
    const sources = searchResult.sources.map(s => ({
      section: s.source,
      count: s.count,
      topScore: s.topScore,
      previews: s.previews.slice(0, 3),
    }));

    const metadata = {
      topic: searchResult.topic,
      topicConfidence: searchResult.topicConfidence,
      sources,
      blocksFound: searchResult.blocksFound,
      searchTime,
      isFallback: false,
    };

    // Build messages
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: SYSTEM_PROMPT + (context ? `\n\n${context}\n\nИспользуй эту информацию для ответа. Указывай конкретные цифры из контекста и источники данных.` : ''),
      },
    ];

    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-6)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: 'user', content: message });

    // Check if keys configured
    if (GEMINI_KEYS.length === 0) {
      console.log('⚠️ No GEMINI_API_KEY(S), using BM25 fallback');
      const fallbackReply = buildFallbackReply(message, searchResult.blocks, searchResult.topic);
      const totalTime = Date.now() - startTime;
      return NextResponse.json({
        reply: fallbackReply, thinking: '', topic: searchResult.topic,
        topicConfidence: searchResult.topicConfidence, sources,
        blocksFound: searchResult.blocksFound, engine: 'BM25-TS',
        searchTime, totalTime, isFallback: true,
      });
    }

    // ── Streaming SSE ──
    if (useStream !== false) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(`event: meta\ndata: ${JSON.stringify(metadata)}\n\n`));

          try {
            await acquireSlot();
            const client = createOpenAI();

            const MAX_RETRIES = 3;
            let lastError: any;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
              try {
                const stream = await client.chat.completions.create({
                  model: GEMINI_MODEL,
                  messages,
                  max_tokens: 4096,
                  temperature: 0.7,
                  stream: true,
                });

                for await (const chunk of stream) {
                  const delta = chunk.choices?.[0]?.delta;
                  if (delta?.content) {
                    controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify(delta.content)}\n\n`));
                  }
                  if ((delta as any)?.reasoning_content) {
                    controller.enqueue(encoder.encode(`event: thinking\ndata: ${JSON.stringify((delta as any).reasoning_content)}\n\n`));
                  }
                }

                const totalTime = Date.now() - startTime;
                controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ totalTime })}\n\n`));
                lastError = null;
                break;
              } catch (e: any) {
                lastError = e;
                const status = e.status || 0;

                if (status === 429) {
                  const usedKey = GEMINI_KEYS[(currentKeyIdx - 1 + GEMINI_KEYS.length) % GEMINI_KEYS.length];
                  markKeyRateLimited(usedKey, 30000);

                  if (attempt < MAX_RETRIES) {
                    console.log(`🔄 Key rate limited (429), rotating. Attempt ${attempt}/${MAX_RETRIES}`);
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                  }
                }

                if (status === 401 || status === 403) {
                  console.error(`❌ Auth error (${status}):`, e.message?.substring(0, 200));
                  break;
                }

                if (attempt < MAX_RETRIES) {
                  const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
                  console.log(`⏳ Attempt ${attempt} failed (${status}), retrying in ${delay}ms`);
                  await new Promise(r => setTimeout(r, delay));
                }
              }
            }

            if (lastError) {
              console.error('❌ All retries failed:', lastError?.message);
              const fallbackReply = buildFallbackReply(message, searchResult.blocks, searchResult.topic);
              const totalTime = Date.now() - startTime;
              controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify(fallbackReply)}\n\n`));
              controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ totalTime, isFallback: true })}\n\n`));
            }
          } catch (error: any) {
            console.error('❌ Stream error:', error?.message);
            const fallbackReply = buildFallbackReply(message, searchResult.blocks, searchResult.topic);
            const totalTime = Date.now() - startTime;
            controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify(fallbackReply)}\n\n`));
            controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ totalTime, isFallback: true })}\n\n`));
          } finally {
            releaseSlot();
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
      });
    }

    // ── Non-streaming ──
    let reply: string | undefined;
    let isFallback = false;

    try {
      await acquireSlot();
      const client = createOpenAI();

      const MAX_RETRIES = 3;
      let lastError: any;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await client.chat.completions.create({
            model: GEMINI_MODEL,
            messages,
            max_tokens: 4096,
            temperature: 0.7,
          });
          reply = result.choices?.[0]?.message?.content;
          if (!reply) throw new Error('Empty response');
          lastError = null;
          break;
        } catch (e: any) {
          lastError = e;
          const status = e.status || 0;
          if (status === 429) {
            const usedKey = GEMINI_KEYS[(currentKeyIdx - 1 + GEMINI_KEYS.length) % GEMINI_KEYS.length];
            markKeyRateLimited(usedKey, 30000);
            if (attempt < MAX_RETRIES) {
              await new Promise(r => setTimeout(r, 2000));
              continue;
            }
          }
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(2, attempt - 1), 15000)));
          }
        }
      }

      if (lastError && !reply) {
        reply = buildFallbackReply(message, searchResult.blocks, searchResult.topic);
        isFallback = true;
      }
    } catch (e: any) {
      console.error('❌ LLM error:', e?.message);
      reply = buildFallbackReply(message, searchResult.blocks, searchResult.topic);
      isFallback = true;
    } finally {
      releaseSlot();
    }

    const totalTime = Date.now() - startTime;
    return NextResponse.json({
      reply, thinking: '', topic: searchResult.topic,
      topicConfidence: searchResult.topicConfidence, sources,
      blocksFound: searchResult.blocksFound, engine: 'BM25+Gemini',
      searchTime, totalTime, isFallback,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера. Попробуйте позже.' }, { status: 500 });
  }
}

// Health check
export async function GET() {
  try {
    const ragEngine = await getRAGEngine();
    const stats = ragEngine.getStats();
    return NextResponse.json({
      status: 'ok',
      engine: 'BM25+Gemini',
      llm: GEMINI_KEYS.length > 0 ? `gemini (${GEMINI_MODEL}, ${GEMINI_KEYS.length} key(s))` : 'not configured',
      ...stats,
    });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}

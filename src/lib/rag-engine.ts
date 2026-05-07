/**
 * RAG Engine — combines BM25 search + topic routing + context building
 * Pure TypeScript, no Python dependencies
 * Optimized for 4GB RAM server
 */

import { BM25Engine, BM25Result } from './bm25';
import { loadKnowledgeBase, KBBlock } from './kb-loader';
import { russianStem } from './russian-stemmer';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RAGSearchResult {
  blocks: BM25Result[];
  topic: string;
  topicConfidence: number;
  blocksFound: number;
  sources: SourceGroup[];
  context: string;
}

export interface SourceGroup {
  source: string;
  count: number;
  topScore: number;
  previews: Array<{ text: string; score: number; section: string }>;
}

// ─── Topic Detection ──────────────────────────────────────────────────────────

interface TopicRule {
  keywords: string[];
  boostSections: string[];
  boostFactor: number;
}

const TOPIC_RULES: Record<string, TopicRule> = {
  WB: {
    keywords: ['wb', 'вайлдберриз', 'wildberries', 'вб', 'селлер', 'спп', 'дорр', 'ctr', 'cpm', 'арк', 'буст', 'кластер', 'ранжирован', 'органик', 'реклам', 'продвижен', 'аукцион', 'ставк', 'показ', 'карточк', 'seo', 'сэо', 'внутренн', 'дебуст', 'crf', 'выкуп', 'коэффициент', 'индекс'],
    boostSections: ['СЕКЦИЯ 1', 'СЕКЦИЯ 6', 'СЕКЦИЯ 7', 'WB', 'WILDBERRIES'],
    boostFactor: 1.5,
  },
  OZON: {
    keywords: ['озон', 'ozon', 'фбо', 'фбс', 'realfbo', 'селлер-прайм', 'rich-контент', 'бестселлер', 'звёздн', 'премиум'],
    boostSections: ['СЕКЦИЯ 2', 'OZON'],
    boostFactor: 1.5,
  },
  ОТЧЁТЫ: {
    keywords: ['отчёт', 'отчет', 'аналитик', 'оборудован', 'оборот', 'трлн', 'млрд', 'статистик', 'mpstats', 'тренд', 'рынок', 'доля'],
    boostSections: ['СЕКЦИЯ 4', 'ОТЧЁТ', 'АНАЛИТИК'],
    boostFactor: 1.5,
  },
  КУРСЫ: {
    keywords: ['курс', 'обучен', 'интенсив', 'спринт', 'программ', 'ленцов', 'куриленко', 'шевченко', 'сулейманов', 'алхутов', 'меркатус', 'mkeeper', 'leo'],
    boostSections: ['СЕКЦИЯ 5', 'КУРС', 'ОБУЧЕН', 'LEO', 'MKEEPER'],
    boostFactor: 1.3,
  },
  ЭВИРМА: {
    keywords: ['эвирм', 'evirm', 'crf(l)', 'плагин', 'кластеризац', 'ставк'],
    boostSections: ['СЕКЦИЯ 6', 'ЭВИРМ', 'EVIRM', 'CRF'],
    boostFactor: 1.5,
  },
  СТАТЬИ: {
    keywords: ['стать', 'руководств', 'seo', 'гайд', 'инструкц', 'совет'],
    boostSections: ['СЕКЦИЯ 7', 'СТАТЬ', 'SEO'],
    boostFactor: 1.3,
  },
};

// ─── RAG Engine ───────────────────────────────────────────────────────────────

class RAGEngine {
  private bm25: BM25Engine;
  private allBlocks: KBBlock[] = [];
  private reportBlocks: KBBlock[] = [];
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.bm25 = new BM25Engine(1.5, 0.75);
  }

  /**
   * Initialize the engine — load KB, build BM25 index
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._init();
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    const startTime = Date.now();
    console.log('[RAG Engine] Initializing...');

    // Load all KB files
    this.allBlocks = loadKnowledgeBase();

    // Extract report blocks for permanent context
    this.reportBlocks = this.allBlocks.filter(
      b => b.section.includes('СЕКЦИЯ 4') ||
           b.section.includes('ОТЧЁТ') ||
           b.section.includes('АНАЛИТИК') ||
           b.topic.includes('ОТЧЁТ')
    );

    // Build BM25 index
    const docs = this.allBlocks.map(block => ({
      id: block.id,
      text: block.text,
      section: block.section,
      source: block.source,
      metadata: {
        topic: block.topic,
        url: block.url || '',
        title: block.title || '',
      },
    }));

    this.bm25.addDocuments(docs);

    const elapsed = Date.now() - startTime;
    const stats = this.bm25.getStats();
    console.log(`[RAG Engine] Ready in ${elapsed}ms — ${stats.totalDocuments} docs, ${stats.uniqueTerms} terms, ~${stats.memoryEstimate} RAM`);
    this.initialized = true;
  }

  /**
   * Detect the topic of a query
   * Uses Russian stemming for better keyword matching (китая → китай)
   * Platform names (ozon, wb) get 5x weight to avoid misclassification
   */
  detectTopic(query: string): { topic: string; confidence: number } {
    // Stem the query words for matching Russian inflections
    const queryWords = query.toLowerCase().match(/[a-zа-яё0-9]{2,}/gi) || [];
    const stemmedQuery = queryWords.map(w => russianStem(w));
    const qLower = query.toLowerCase(); // Also keep original for direct matches

    let bestTopic = 'ОБЩЕЕ';
    let bestScore = 0;

    // Platform-specific identifiers that strongly indicate a topic
    const PLATFORM_WEIGHTS: Record<string, Record<string, number>> = {
      WB: { 'wb': 5, 'вайлдберриз': 5, 'wildberries': 5, 'вб': 5 },
      OZON: { 'ozon': 5, 'озон': 5, 'фбо': 3, 'фбс': 3, 'бестселлер': 3 },
    };

    for (const [topic, rule] of Object.entries(TOPIC_RULES)) {
      let score = 0;
      for (const keyword of rule.keywords) {
        // Try direct match first
        if (qLower.includes(keyword.toLowerCase())) {
          const pw = PLATFORM_WEIGHTS[topic]?.[keyword.toLowerCase()] || 1;
          score += pw;
          continue;
        }
        // Try stemmed match (for Russian inflections: китая→китай, озоном→озон)
        const stemmedKeyword = russianStem(keyword);
        if (stemmedQuery.includes(stemmedKeyword)) {
          const pw = PLATFORM_WEIGHTS[topic]?.[keyword.toLowerCase()] || 1;
          score += pw;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestTopic = topic;
      }
    }

    // Confidence: 0-1 based on score
    const confidence = Math.min(bestScore / 5, 1);

    return { topic: bestTopic, confidence };
  }

  /**
   * Build section boosts from detected topic
   */
  private buildBoosts(topic: string, explicitTopic?: string): Map<string, number> | undefined {
    const boosts = new Map<string, number>();

    // Apply explicit topic boost (from UI filter)
    if (explicitTopic && TOPIC_RULES[explicitTopic]) {
      const rule = TOPIC_RULES[explicitTopic];
      for (const section of rule.boostSections) {
        boosts.set(section, rule.boostFactor);
      }
      return boosts;
    }

    // Apply detected topic boost
    if (topic !== 'ОБЩЕЕ' && TOPIC_RULES[topic]) {
      const rule = TOPIC_RULES[topic];
      for (const section of rule.boostSections) {
        boosts.set(section, rule.boostFactor);
      }
    }

    return boosts.size > 0 ? boosts : undefined;
  }

  /**
   * Search for relevant blocks
   */
  async search(query: string, explicitTopic?: string): Promise<RAGSearchResult> {
    await this.init();

    // Detect topic
    const { topic, confidence } = this.detectTopic(query);

    // Build boosts
    const boosts = this.buildBoosts(topic, explicitTopic);

    // Enhance query with topic keywords for better matching
    let searchQuery = query;
    if (explicitTopic && TOPIC_RULES[explicitTopic]) {
      // Add some topic keywords to improve search
      const topKeywords = TOPIC_RULES[explicitTopic].keywords.slice(0, 3);
      searchQuery = `${query} ${topKeywords.join(' ')}`;
    }

    // BM25 search — get top 20 blocks
    const blocks = this.bm25.search(searchQuery, 20, boosts);

    // Group results by source
    const sourceMap = new Map<string, SourceGroup>();
    for (const block of blocks) {
      const source = block.source;
      if (!sourceMap.has(source)) {
        sourceMap.set(source, {
          source,
          count: 0,
          topScore: block.score,
          previews: [],
        });
      }
      const group = sourceMap.get(source)!;
      group.count++;
      group.previews.push({
        text: block.text.substring(0, 150) + (block.text.length > 150 ? '...' : ''),
        score: block.score,
        section: block.section,
      });
    }

    // Build context for LLM — structured by source
    const context = this.buildContext(blocks);

    return {
      blocks,
      topic,
      topicConfidence: confidence,
      blocksFound: blocks.length,
      sources: Array.from(sourceMap.values()).sort((a, b) => b.topScore - a.topScore),
      context,
    };
  }

  /**
   * Build structured context for LLM
   * 20 blocks × up to 1500 chars, grouped by source
   */
  private buildContext(blocks: BM25Result[]): string {
    const parts: string[] = [];

    // Add report context if available and no report blocks in results
    const hasReportBlocks = blocks.some(b => b.section.includes('СЕКЦИЯ 4') || b.section.includes('ОТЧЁТ'));
    if (!hasReportBlocks && this.reportBlocks.length > 0) {
      const reportText = this.reportBlocks
        .slice(0, 3)
        .map(b => b.text.substring(0, 500))
        .join('\n\n---\n\n');
      parts.push(`=== АКТУАЛЬНЫЕ ОТЧЁТЫ И ТАРИФЫ ===\n${reportText}`);
    }

    // Group blocks by source
    const sourceGroups = new Map<string, BM25Result[]>();
    for (const block of blocks) {
      const key = block.source;
      if (!sourceGroups.has(key)) sourceGroups.set(key, []);
      sourceGroups.get(key)!.push(block);
    }

    // Build structured context
    let totalChars = 0;
    const maxContextChars = 30000; // ~8K tokens, fits in 1M context

    for (const [source, sourceBlocks] of sourceGroups) {
      let sourceCtx = `\n=== ИСТОЧНИК: ${source} ===\n`;
      for (const block of sourceBlocks) {
        const blockText = `[${block.section} | Score: ${block.score}]\n${block.text.substring(0, 1500)}\n\n`;
        if (totalChars + sourceCtx.length + blockText.length > maxContextChars) break;
        sourceCtx += blockText;
        totalChars += blockText.length;
      }
      parts.push(sourceCtx);
      if (totalChars >= maxContextChars) break;
    }

    return parts.join('\n');
  }

  /**
   * Get engine stats
   */
  getStats() {
    if (!this.initialized) return { initialized: false };
    const bm25Stats = this.bm25.getStats();
    return {
      initialized: true,
      totalBlocks: this.allBlocks.length,
      reportBlocks: this.reportBlocks.length,
      ...bm25Stats,
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let engineInstance: RAGEngine | null = null;

export async function getRAGEngine(): Promise<RAGEngine> {
  if (!engineInstance) {
    engineInstance = new RAGEngine();
    await engineInstance.init();
  }
  return engineInstance;
}

export { RAGEngine };

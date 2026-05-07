/**
 * BM25 Search Engine — pure TypeScript implementation
 * Okapi BM25 with Russian stemming support
 * Optimized for in-memory use with ~10K document blocks
 */

import { tokenizeAndStem, tokenizeSimple } from './russian-stemmer';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BM25Document {
  id: string;
  text: string;
  section: string;
  source: string;
  metadata?: Record<string, string>;
}

export interface BM25Result {
  id: string;
  score: number;
  text: string;
  section: string;
  source: string;
  metadata?: Record<string, string>;
}

// ─── BM25 Engine ──────────────────────────────────────────────────────────────

export class BM25Engine {
  private documents: BM25Document[] = [];
  private docTokens: string[][] = [];
  private docLengths: number[] = [];
  private avgDocLength = 0;
  private df: Map<string, number> = new Map(); // document frequency
  private N = 0; // total documents
  private termIndex: Map<string, Map<number, number>> = new Map(); // term -> { docId -> tf }

  // BM25 parameters
  private k1 = 1.5;
  private b = 0.75;

  // Cache for stemmed queries
  private queryCache: Map<string, string[]> = new Map();
  private maxCacheSize = 500;

  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
  }

  /**
   * Add a single document to the index
   */
  addDocument(doc: BM25Document): void {
    const idx = this.documents.length;
    this.documents.push(doc);

    const tokens = tokenizeAndStem(doc.text);
    this.docTokens.push(tokens);
    this.docLengths.push(tokens.length);

    // Build term frequency and document frequency
    const termFreqs = new Map<string, number>();
    for (const token of tokens) {
      termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
    }

    // Update inverted index
    for (const [term, freq] of termFreqs) {
      if (!this.termIndex.has(term)) {
        this.termIndex.set(term, new Map());
      }
      this.termIndex.get(term)!.set(idx, freq);

      // Update document frequency
      this.df.set(term, (this.df.get(term) || 0) + 1);
    }
  }

  /**
   * Add multiple documents (more efficient than adding one by one)
   */
  addDocuments(docs: BM25Document[]): void {
    for (const doc of docs) {
      this.addDocument(doc);
    }
    this.finalize();
  }

  /**
   * Finalize the index — compute average doc length, etc.
   */
  finalize(): void {
    this.N = this.documents.length;
    if (this.N > 0) {
      this.avgDocLength = this.docLengths.reduce((a, b) => a + b, 0) / this.N;
    }
    // Free raw tokens to save memory (we only need the inverted index)
    this.docTokens = [];
  }

  /**
   * Compute IDF for a term
   */
  private idf(term: string): number {
    const df = this.df.get(term) || 0;
    if (df === 0) return 0;
    // BM25 IDF formula (Robertson-Sparck Jones)
    return Math.log((this.N - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * Score a single document for a query
   */
  private scoreDocument(docIdx: number, queryTokens: string[]): number {
    let score = 0;
    const docLen = this.docLengths[docIdx];
    const lenNorm = 1 - this.b + this.b * (docLen / this.avgDocLength);

    for (const term of queryTokens) {
      const tf = this.termIndex.get(term)?.get(docIdx) || 0;
      if (tf === 0) continue;

      const termIdf = this.idf(term);
      const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * lenNorm);
      score += termIdf * tfNorm;
    }

    return score;
  }

  /**
   * Search for documents matching a query
   */
  search(query: string, topK = 20, boostSections?: Map<string, number>): BM25Result[] {
    if (this.N === 0) return [];

    // Check cache
    let queryTokens = this.queryCache.get(query);
    if (!queryTokens) {
      queryTokens = tokenizeAndStem(query);
      if (this.queryCache.size >= this.maxCacheSize) {
        // Simple cache eviction: delete first entry
        const firstKey = this.queryCache.keys().next().value;
        if (firstKey) this.queryCache.delete(firstKey);
      }
      this.queryCache.set(query, queryTokens);
    }

    if (queryTokens.length === 0) return [];

    // Find candidate documents (docs that contain at least one query term)
    const candidates = new Set<number>();
    for (const token of queryTokens) {
      const postings = this.termIndex.get(token);
      if (postings) {
        for (const docIdx of postings.keys()) {
          candidates.add(docIdx);
        }
      }
    }

    // Score candidates
    const scored: Array<{ idx: number; score: number }> = [];
    for (const docIdx of candidates) {
      let score = this.scoreDocument(docIdx, queryTokens);

      // Apply section boost if configured
      if (boostSections && this.documents[docIdx]) {
        const section = this.documents[docIdx].section.toLowerCase();
        for (const [key, boost] of boostSections) {
          if (section.includes(key.toLowerCase())) {
            score *= boost;
          }
        }
      }

      if (score > 0) {
        scored.push({ idx: docIdx, score });
      }
    }

    // Sort by score descending, take top K
    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, topK);

    return topResults.map(({ idx, score }) => ({
      id: this.documents[idx].id,
      score: Math.round(score * 1000) / 1000,
      text: this.documents[idx].text,
      section: this.documents[idx].section,
      source: this.documents[idx].source,
      metadata: this.documents[idx].metadata,
    }));
  }

  /**
   * Get statistics about the index
   */
  getStats() {
    return {
      totalDocuments: this.N,
      avgDocLength: Math.round(this.avgDocLength),
      uniqueTerms: this.df.size,
      memoryEstimate: `~${Math.round(this.N * 0.003 + this.df.size * 0.00005)}MB`,
    };
  }

  /**
   * Get document by index
   */
  getDocument(idx: number): BM25Document | undefined {
    return this.documents[idx];
  }

  /**
   * Get all documents
   */
  getDocuments(): BM25Document[] {
    return this.documents;
  }

  /**
   * Search with simple tokenization (no stemming) — for comparison
   */
  searchSimple(query: string, topK = 20): BM25Result[] {
    const queryTokens = tokenizeSimple(query);
    if (queryTokens.length === 0 || this.N === 0) return [];

    const candidates = new Set<number>();
    for (const token of queryTokens) {
      const postings = this.termIndex.get(token);
      if (postings) {
        for (const docIdx of postings.keys()) {
          candidates.add(docIdx);
        }
      }
    }

    const scored: Array<{ idx: number; score: number }> = [];
    for (const docIdx of candidates) {
      let score = 0;
      const docLen = this.docLengths[docIdx];
      const lenNorm = 1 - this.b + this.b * (docLen / this.avgDocLength);

      for (const term of queryTokens) {
        const tf = this.termIndex.get(term)?.get(docIdx) || 0;
        if (tf === 0) continue;
        const termIdf = this.idf(term);
        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * lenNorm);
        score += termIdf * tfNorm;
      }

      if (score > 0) {
        scored.push({ idx: docIdx, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(({ idx, score }) => ({
      id: this.documents[idx].id,
      score: Math.round(score * 1000) / 1000,
      text: this.documents[idx].text,
      section: this.documents[idx].section,
      source: this.documents[idx].source,
    }));
  }
}

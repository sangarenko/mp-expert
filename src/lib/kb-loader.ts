/**
 * Knowledge Base Loader — loads all 9 KB files, chunks, deduplicates
 * Supports multiple file formats:
 * 1. full_knowledge_base.txt — sections with "СЕКЦИЯ N:" headers
 * 2. articles_clean.txt — blocks with [БЛОК N] [ИСТОЧНИК: ...] [ТЕМА: ...]
 * 3. ozon_clean.txt, leo_clean.txt, etc. — blocks with [ИСТОЧНИК: ...] [ТЕМА: ...]
 * 4. reports_analysis.txt — plain text
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

export interface KBBlock {
  id: string;
  text: string;
  section: string;
  source: string;
  topic: string;
  url?: string;
  title?: string;
}

const KB_DIR = join(process.cwd(), 'kb-all');

const KB_FILES: Record<string, string> = {
  'full_knowledge_base.txt': 'БАЗА ЗНАНИЙ',
  'marketplace_ai_training_data_clean.txt': 'ОБУЧЕНИЕ AI',
  'articles_clean.txt': 'СТАТЬИ',
  'ozon_clean.txt': 'OZON',
  'leo_clean.txt': 'LEO',
  'mkeeper_clean.txt': 'MKEEPER',
  'farealchina_clean.txt': 'КАРГО/КИТАЙ',
  'maxprowb_clean.txt': 'MAXPRO WB',
  'reports_analysis.txt': 'ОТЧЁТЫ/АНАЛИТИКА',
};

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const MIN_CHUNK_LENGTH = 50;

/**
 * Generate a hash for deduplication
 */
function contentHash(text: string): string {
  // Normalize: lowercase, collapse whitespace, remove punctuation for dedup
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').replace(/[^\wа-яё]/gi, '').substring(0, 200);
  return createHash('md5').update(normalized).digest('hex').substring(0, 12);
}

/**
 * Parse full_knowledge_base.txt — sections with "СЕКЦИЯ N:" headers
 */
function parseFullKB(text: string): KBBlock[] {
  const blocks: KBBlock[] = [];
  const sectionPattern = /(СЕКЦИЯ \d+:.{0,80}|=== ДОБАВЛЕНО.{0,50})/g;

  let currentSection = 'ОБЩЕЕ';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const parts: Array<{ section: string; text: string }> = [];

  while ((match = sectionPattern.exec(text)) !== null) {
    // Save text before this section header
    if (match.index > lastIndex) {
      const prevText = text.substring(lastIndex, match.index).trim();
      if (prevText) {
        parts.push({ section: currentSection, text: prevText });
      }
    }
    currentSection = match[1].trim().substring(0, 80);
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last section
  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex).trim();
    if (remaining) {
      parts.push({ section: currentSection, text: remaining });
    }
  }

  // Chunk each section
  for (const part of parts) {
    const chunks = chunkText(part.text);
    for (const chunk of chunks) {
      blocks.push({
        id: `fkb-${blocks.length}`,
        text: chunk,
        section: part.section,
        source: 'БАЗА ЗНАНИЙ',
        topic: detectTopicFromSection(part.section),
      });
    }
  }

  return blocks;
}

/**
 * Parse article-style files — [БЛОК N] [ИСТОЧНИК: ...] [ТЕМА: ...] format
 */
function parseArticleBlocks(text: string, sourceName: string): KBBlock[] {
  const blocks: KBBlock[] = [];

  // Split by [БЛОК N] or [ИСТОЧНИК:
  const blockPattern = /\[(БЛОК \d+|ИСТОЧНИК:)/g;

  let lastIndex = 0;
  let currentMeta: Partial<KBBlock> = { source: sourceName, topic: '' };
  const parts: Array<{ meta: Partial<KBBlock>; text: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(text)) !== null) {
    // Save previous block
    if (match.index > lastIndex) {
      const prevText = text.substring(lastIndex, match.index).trim();
      if (prevText) {
        parts.push({ meta: { ...currentMeta }, text: prevText });
      }
    }

    // Parse metadata from the line
    const lineEnd = text.indexOf('\n', match.index);
    const metaLine = text.substring(match.index, lineEnd > match.index ? lineEnd : match.index + 200);

    // Extract [ТЕМА: ...]
    const topicMatch = metaLine.match(/\[ТЕМА:\s*([^\]]+)\]/i);
    if (topicMatch) currentMeta.topic = topicMatch[1].trim();

    // Extract [ИСТОЧНИК: ...]
    const sourceMatch = metaLine.match(/\[ИСТОЧНИК:\s*([^\]]+)\]/i);
    if (sourceMatch) currentMeta.source = `${sourceName} / ${sourceMatch[1].trim()}`;

    // Extract [URL: ...]
    const urlMatch = metaLine.match(/\[URL:\s*([^\]]+)\]/i);
    if (urlMatch) currentMeta.url = urlMatch[1].trim();

    // Extract [ЗАГОЛОВОК: ...]
    const titleMatch = metaLine.match(/\[ЗАГОЛОВОК:\s*([^\]]+)\]/i);
    if (titleMatch) currentMeta.title = titleMatch[1].trim();

    // Detect section from topic
    currentMeta.section = topicToSection(currentMeta.topic || '');

    lastIndex = lineEnd > match.index ? lineEnd + 1 : match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex).trim();
    if (remaining) {
      parts.push({ meta: { ...currentMeta }, text: remaining });
    }
  }

  for (const part of parts) {
    const chunks = chunkText(part.text);
    for (const chunk of chunks) {
      blocks.push({
        id: `art-${blocks.length}`,
        text: chunk,
        section: part.meta.section || sourceName,
        source: part.meta.source || sourceName,
        topic: part.meta.topic || '',
        url: part.meta.url,
        title: part.meta.title,
      });
    }
  }

  return blocks;
}

/**
 * Parse simple block files — [ИСТОЧНИК: @channel] [ТЕМА: ...] format
 */
function parseChannelBlocks(text: string, sourceName: string): KBBlock[] {
  const blocks: KBBlock[] = [];

  // Split by [ИСТОЧНИК: ...]
  const blockPattern = /\[ИСТОЧНИК:\s*([^\]]+)\]\s*\[ТЕМА:\s*([^\]]+)\]/gi;

  let lastIndex = 0;
  let currentChannel = sourceName;
  let currentTopic = '';
  const parts: Array<{ channel: string; topic: string; text: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(text)) !== null) {
    // Save previous block
    if (match.index > lastIndex) {
      const prevText = text.substring(lastIndex, match.index).trim();
      if (prevText) {
        parts.push({ channel: currentChannel, topic: currentTopic, text: prevText });
      }
    }

    currentChannel = match[1].trim();
    currentTopic = match[2].trim();

    // Move past the metadata line
    const lineEnd = text.indexOf('\n', match.index);
    lastIndex = lineEnd > match.index ? lineEnd + 1 : match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex).trim();
    if (remaining) {
      parts.push({ channel: currentChannel, topic: currentTopic, text: remaining });
    }
  }

  for (const part of parts) {
    const chunks = chunkText(part.text);
    for (const chunk of chunks) {
      blocks.push({
        id: `ch-${blocks.length}`,
        text: chunk,
        section: topicToSection(part.topic),
        source: `${sourceName} / ${part.channel}`,
        topic: part.topic,
      });
    }
  }

  return blocks;
}

/**
 * Parse plain text files (like reports_analysis.txt)
 */
function parsePlainText(text: string, sourceName: string): KBBlock[] {
  const blocks: KBBlock[] = [];
  const chunks = chunkText(text);

  for (const chunk of chunks) {
    blocks.push({
      id: `txt-${blocks.length}`,
      text: chunk,
      section: sourceName,
      source: sourceName,
      topic: 'ОТЧЁТЫ/АНАЛИТИКА',
    });
  }

  return blocks;
}

/**
 * Split text into chunks with overlap
 */
function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed || trimmed.length < 20) continue;

    if (buffer.length + trimmed.length < CHUNK_SIZE) {
      buffer += (buffer ? '\n\n' : '') + trimmed;
    } else {
      if (buffer.trim().length > MIN_CHUNK_LENGTH) {
        chunks.push(buffer.trim());
      }
      // Overlap
      const overlapText = buffer.length > CHUNK_OVERLAP ? buffer.slice(-CHUNK_OVERLAP) : '';
      buffer = overlapText + (overlapText ? '\n\n' : '') + trimmed;
    }
  }

  if (buffer.trim().length > MIN_CHUNK_LENGTH) {
    chunks.push(buffer.trim());
  }

  return chunks;
}

/**
 * Map section names to topic categories
 */
function detectTopicFromSection(section: string): string {
  const s = section.toUpperCase();
  if (s.includes('СЕКЦИЯ 1') || s.includes('WILDBERRIES') || s.includes('WB')) return 'WB';
  if (s.includes('СЕКЦИЯ 2') || s.includes('OZON')) return 'OZON';
  if (s.includes('СЕКЦИЯ 3') || s.includes('КАРГО') || s.includes('ЛОГИСТИКА')) return 'КАРГО';
  if (s.includes('СЕКЦИЯ 4') || s.includes('ОТЧЁТ') || s.includes('АНАЛИТИКА')) return 'ОТЧЁТЫ';
  if (s.includes('СЕКЦИЯ 5') || s.includes('КУРС') || s.includes('ОБУЧЕНИЕ')) return 'КУРСЫ';
  if (s.includes('СЕКЦИЯ 6') || s.includes('ЭВИРМ') || s.includes('EVIRM')) return 'ЭВИРМА';
  if (s.includes('СЕКЦИЯ 7') || s.includes('СТАТЬИ')) return 'СТАТЬИ';
  return 'ОБЩЕЕ';
}

/**
 * Map topic tags to section categories
 */
function topicToSection(topic: string): string {
  const t = topic.toUpperCase();
  if (t.includes('WB') || t.includes('WILDBERRIES')) return 'СЕКЦИЯ 1: WB';
  if (t.includes('OZON')) return 'СЕКЦИЯ 2: OZON';
  if (t.includes('КАРГО') || t.includes('ЛОГИСТИКА') || t.includes('КИТАЙ') || t.includes('CARGO')) return 'СЕКЦИЯ 3: КАРГО';
  if (t.includes('ОТЧЁТ') || t.includes('АНАЛИТИК') || t.includes('REPORT')) return 'СЕКЦИЯ 4: ОТЧЁТЫ';
  if (t.includes('КУРС') || t.includes('ОБУЧЕН') || t.includes('LEO')) return 'СЕКЦИЯ 5: КУРСЫ';
  if (t.includes('ЭВИРМ') || t.includes('EVIRM') || t.includes('CRF')) return 'СЕКЦИЯ 6: ЭВИРМА';
  if (t.includes('СТАТЬ') || t.includes('SEO') || t.includes('РЕКЛАМ')) return 'СЕКЦИЯ 7: СТАТЬИ';
  if (t.includes('MKEEPER') || t.includes('МЕРКАТУС')) return 'КУРСЫ/MKEEPER';
  return 'ОБЩЕЕ';
}

/**
 * Detect file format and parse accordingly
 */
function parseFile(filename: string, sourceName: string): KBBlock[] {
  const filePath = join(KB_DIR, filename);

  try {
    const text = readFileSync(filePath, 'utf-8');
    if (!text.trim()) return [];

    // Detect format
    if (filename === 'full_knowledge_base.txt') {
      return parseFullKB(text);
    }

    if (filename === 'articles_clean.txt' || filename === 'marketplace_ai_training_data_clean.txt') {
      return parseArticleBlocks(text, sourceName);
    }

    if (filename === 'reports_analysis.txt') {
      return parsePlainText(text, sourceName);
    }

    // Channel-style files: ozon, leo, mkeeper, farealchina, maxprowb
    return parseChannelBlocks(text, sourceName);
  } catch (error) {
    console.error(`Failed to load KB file ${filename}:`, error);
    return [];
  }
}

/**
 * Load all knowledge base files, chunk, and deduplicate
 */
export function loadKnowledgeBase(): KBBlock[] {
  const allBlocks: KBBlock[] = [];
  const seenHashes = new Set<string>();

  console.log('[KB Loader] Loading knowledge base files...');

  for (const [filename, sourceName] of Object.entries(KB_FILES)) {
    const blocks = parseFile(filename, sourceName);
    console.log(`[KB Loader] ${filename}: ${blocks.length} blocks`);

    // Deduplicate
    let dupes = 0;
    for (const block of blocks) {
      const hash = contentHash(block.text);
      if (seenHashes.has(hash)) {
        dupes++;
        continue;
      }
      seenHashes.add(hash);

      // Truncate text to max chunk size
      if (block.text.length > CHUNK_SIZE + 200) {
        block.text = block.text.substring(0, CHUNK_SIZE + 200);
      }

      allBlocks.push(block);
    }

    if (dupes > 0) {
      console.log(`[KB Loader] ${filename}: ${dupes} duplicates removed`);
    }
  }

  console.log(`[KB Loader] Total: ${allBlocks.length} unique blocks`);

  return allBlocks;
}

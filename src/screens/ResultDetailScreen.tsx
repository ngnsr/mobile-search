import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Document, DocumentChunk, DocumentService } from '../services/DocumentService';
import { SearchDocumentResult, SearchMode } from '../services/SearchService';
import { FileIndexingService } from '../services/FileIndexingService';

interface Props {
  item:
    | { kind: 'doc'; doc: Document }
    | { kind: 'result'; result: SearchDocumentResult; query: string; mode: SearchMode }
    | null;
  documentService: DocumentService;
  fileIndexingService: FileIndexingService;
  onBack: () => void;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,.;:()\\/"'!?]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function HighlightedText({
  text,
  query,
  activeRange,
}: {
  text: string;
  query: string;
  activeRange?: { start: number; end: number } | null;
}) {
  const terms = buildQueryTerms(query);
  if (!terms.length) return <Text style={styles.content}>{text}</Text>;

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'ig');
  const parts = text.split(pattern);

  return (
    <Text style={styles.content}>
      {(() => {
        let offset = 0;
        return parts.map((part, idx) => {
          const start = offset;
          const end = offset + part.length;
          offset = end;

        const isMatch = terms.includes(part.toLowerCase());
          const isActive =
            !!activeRange &&
            isMatch &&
            start === activeRange.start &&
            end === activeRange.end;
        return (
            <Text
              key={idx}
              style={isActive ? styles.activeHighlight : isMatch ? styles.highlight : undefined}
            >
            {part}
          </Text>
        );
        });
      })()}
    </Text>
  );
}

type Occurrence = {
  chunkId: number;
  chunkIndex: number;
  pageNumber: number | null;
  chunkContent: string;
  matchStart: number;
  matchEnd: number;
};

function buildOccurrences(chunks: DocumentChunk[], query: string, max: number = 200): Occurrence[] {
  const terms = buildQueryTerms(query);
  if (!terms.length) return [];

  const pattern = new RegExp(terms.map(escapeRegExp).join('|'), 'ig');
  const occurrences: Occurrence[] = [];

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    pattern.lastIndex = 0;
    for (;;) {
      const m = pattern.exec(chunk.content);
      if (!m) break;
      occurrences.push({
        chunkId: chunk.id,
        chunkIndex,
        pageNumber: (chunk.page_number as number | null | undefined) ?? null,
        chunkContent: chunk.content,
        matchStart: m.index,
        matchEnd: m.index + m[0].length,
      });
      if (occurrences.length >= max) return occurrences;
      if (m[0].length === 0) pattern.lastIndex++;
    }
  }

  return occurrences;
}

function buildWindow(text: string, matchStart: number, matchEnd: number) {
  const before = 140;
  const after = 240;
  const start = Math.max(0, matchStart - before);
  const end = Math.min(text.length, matchEnd + after);
  const windowText = `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;

  const shift = start > 0 ? 1 : 0; // leading ellipsis
  const activeStart = matchStart - start + shift;
  const activeEnd = matchEnd - start + shift;

  return { windowText, activeRange: { start: activeStart, end: activeEnd } };
}

export const ResultDetailScreen: React.FC<Props> = ({ item, documentService, fileIndexingService, onBack }) => {
  const title = item?.kind === 'doc' ? item.doc.title : item?.kind === 'result' ? item.result.document_title ?? 'Result' : '';
  const body = item?.kind === 'doc' ? item.doc.content : item?.kind === 'result' ? item.result.snippet : '';
  const docId = item?.kind === 'doc' ? item.doc.id : item?.kind === 'result' ? item.result.document_id : 0;
  const query = item?.kind === 'result' ? item.query : '';
  const mode = item?.kind === 'result' ? item.mode : null;

  const isNavigableSearch = item?.kind === 'result' && !!query;
  const [docChunks, setDocChunks] = useState<DocumentChunk[] | null>(null);
  const [activeOccurrenceIndex, setActiveOccurrenceIndex] = useState<number>(0);
  const [showMatches, setShowMatches] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isNavigableSearch) {
        setDocChunks(null);
        setActiveOccurrenceIndex(0);
        setShowMatches(false);
        return;
      }
      const chunks = await documentService.listChunksForDocument(docId);
      if (cancelled) return;
      setDocChunks(chunks);
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, documentService, isNavigableSearch]);

  const occurrences = useMemo(() => {
    if (!isNavigableSearch || !docChunks) return [];
    return buildOccurrences(docChunks, query);
  }, [docChunks, isNavigableSearch, query]);

  // Pick the initial match as the first match inside the opened chunk (if any), otherwise the first overall match.
  useEffect(() => {
    if (!isNavigableSearch) return;
    const openedChunkId = item?.kind === 'result' ? item.result.best_chunk_id : null;
    if (!openedChunkId || occurrences.length === 0) {
      setActiveOccurrenceIndex(0);
      return;
    }
    const idx = occurrences.findIndex((o) => o.chunkId === openedChunkId);
    setActiveOccurrenceIndex(idx >= 0 ? idx : 0);
  }, [isNavigableSearch, item, occurrences]);

  const activeOccurrence = isNavigableSearch ? occurrences[activeOccurrenceIndex] : null;
  const display = useMemo(() => {
    if (!isNavigableSearch || !activeOccurrence) {
      return { text: body, activeRange: null as { start: number; end: number } | null };
    }
    const { windowText, activeRange } = buildWindow(
      activeOccurrence.chunkContent,
      activeOccurrence.matchStart,
      activeOccurrence.matchEnd,
    );
    return { text: windowText, activeRange };
  }, [activeOccurrence, body, isNavigableSearch]);

  useEffect(() => {
    if (!isNavigableSearch) return;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [activeOccurrenceIndex, isNavigableSearch]);

  if (!item) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      <ScrollView ref={(r) => (scrollRef.current = r)} style={styles.contentContainer}>
        <Text style={styles.docId}>
          Document ID: {String(docId)}
          {mode ? ` • Mode: ${mode.toUpperCase()}` : ''}
        </Text>
        <TouchableOpacity
          style={styles.reindexButton}
          onPress={async () => {
            try {
              await fileIndexingService.reindexDocument(docId);
              Alert.alert('Reindex started', 'Indexing runs in background. Check the documents list for progress.');
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              Alert.alert('Reindex failed', msg);
            }
          }}
        >
          <Text style={styles.reindexButtonText}>Reindex / Update</Text>
        </TouchableOpacity>
        {query ? <Text style={styles.query}>Query: {query}</Text> : null}
        {isNavigableSearch ? (
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navButton, activeOccurrenceIndex <= 0 && styles.navButtonDisabled]}
              disabled={activeOccurrenceIndex <= 0}
              onPress={() => setActiveOccurrenceIndex((i) => Math.max(0, i - 1))}
            >
              <Text style={styles.navButtonText}>◀</Text>
            </TouchableOpacity>
            <Text style={styles.navStatus}>
              {occurrences.length ? `${activeOccurrenceIndex + 1}/${occurrences.length}` : '0/0'}
              {activeOccurrence?.pageNumber ? ` • Page ${activeOccurrence.pageNumber}` : ''}
            </Text>
            <TouchableOpacity
              style={[
                styles.navButton,
                (activeOccurrenceIndex >= occurrences.length - 1 || occurrences.length === 0) && styles.navButtonDisabled,
              ]}
              disabled={activeOccurrenceIndex >= occurrences.length - 1 || occurrences.length === 0}
              onPress={() => setActiveOccurrenceIndex((i) => Math.min(occurrences.length - 1, i + 1))}
            >
              <Text style={styles.navButtonText}>▶</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {isNavigableSearch && occurrences.length > 0 ? (
          <TouchableOpacity style={styles.matchesToggle} onPress={() => setShowMatches((v) => !v)}>
            <Text style={styles.matchesToggleText}>{showMatches ? 'Hide matches' : 'Show all matches'}</Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.divider} />
        {isNavigableSearch && showMatches ? (
          <View style={styles.matchesList}>
            {occurrences.map((o, idx) => {
              const excerptStart = Math.max(0, o.matchStart - 24);
              const excerptEnd = Math.min(o.chunkContent.length, o.matchEnd + 48);
              const excerpt = o.chunkContent.slice(excerptStart, excerptEnd).replace(/\s+/g, ' ').trim();
              return (
                <TouchableOpacity
                  key={`${o.chunkId}:${o.matchStart}:${idx}`}
                  style={[styles.matchItem, idx === activeOccurrenceIndex && styles.matchItemActive]}
                  onPress={() => {
                    setActiveOccurrenceIndex(idx);
                    setShowMatches(false);
                  }}
                >
                  <Text style={styles.matchItemTitle}>
                    {o.pageNumber ? `Page ${o.pageNumber}` : 'Match'} • #{idx + 1}
                  </Text>
                  <Text style={styles.matchItemText} numberOfLines={2}>
                    {excerptStart > 0 ? '…' : ''}
                    {excerpt}
                    {excerptEnd < o.chunkContent.length ? '…' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={styles.divider} />
          </View>
        ) : null}
        {query ? (
          <HighlightedText text={display.text} query={query} activeRange={display.activeRange} />
        ) : (
          <Text style={styles.content}>{display.text}</Text>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: { fontSize: 18, color: '#3498db', marginRight: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  contentContainer: { padding: 20 },
  docId: { fontSize: 14, color: '#888', marginBottom: 10 },
  reindexButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#2ecc71',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  reindexButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  query: { fontSize: 12, color: '#666', marginBottom: 10 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  navButton: {
    width: 40,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#3498db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: {
    backgroundColor: '#b7d7f0',
  },
  navButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  navStatus: { fontSize: 12, color: '#666', flex: 1, textAlign: 'center' },
  matchesToggle: { marginBottom: 10, alignSelf: 'center' },
  matchesToggleText: { fontSize: 12, color: '#3498db', fontWeight: '700' },
  matchesList: { marginBottom: 10 },
  matchItem: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  matchItemActive: {
    borderColor: '#3498db',
  },
  matchItemTitle: { fontSize: 12, fontWeight: '700', color: '#2c3e50', marginBottom: 4 },
  matchItemText: { fontSize: 12, color: '#666' },
  matchesMore: { fontSize: 11, color: '#888', textAlign: 'center', marginBottom: 10 },
  divider: { height: 1, backgroundColor: '#eee', marginBottom: 20 },
  content: { fontSize: 18, lineHeight: 26, color: '#333' },
  highlight: { backgroundColor: '#fff3b0' },
  activeHighlight: { backgroundColor: '#ffd166' },
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, Keyboard } from 'react-native';
import { SearchService, SearchDocumentResult, SearchMode, SearchDocumentsResponse } from '../services/SearchService';
import { Logger } from '../utils/logger';

interface Props {
  searchService: SearchService;
  onBack: () => void;
  onResultPress: (result: SearchDocumentResult, ctx: { query: string; mode: SearchMode }) => void;
}

export const SearchScreen: React.FC<Props> = ({ 
  searchService, 
  onBack,
  onResultPress
}) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [kindFilter, setKindFilter] = useState<'all' | 'pdf' | 'txt' | 'md' | 'manual'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d'>('all');
  const [results, setResults] = useState<SearchDocumentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [metrics, setMetrics] = useState<SearchDocumentsResponse['metrics'] | null>(null);

  const PAGE_SIZE = 20;

  const handleSearch = async (opts?: { mode?: SearchMode; append?: boolean }) => {
    if (!query.trim()) return;
    const effectiveMode = opts?.mode ?? mode;
    const append = opts?.append ?? false;

    try {
      if (append) setLoadingMore(true);
      else setLoading(true);

      const nextOffset = append ? offset : 0;
      const dateRangeDays = dateFilter === '7d' ? 7 : dateFilter === '30d' ? 30 : null;
      const res = await searchService.searchDocuments(query, effectiveMode, PAGE_SIZE, nextOffset, {
        kind: kindFilter,
        dateRangeDays,
      });

      const nextResults = append ? [...results, ...res.results] : res.results;
      setResults(nextResults);
      setMetrics(res.metrics);

      setOffset(nextOffset + res.results.length);
      setHasMore(res.results.length === PAGE_SIZE);
    } catch (e) {
      // This is usually a SQLite/schema issue after fast refresh.
      // Surface a message and log details for debugging.
      Logger.error('SearchScreen', 'Search failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `Search failed: ${msg}\n\nTry reloading the app.`);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const renderItem = ({ item }: { item: SearchDocumentResult }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => {
        Keyboard.dismiss();
        onResultPress(item, { query, mode });
      }}
    >
      <Text style={styles.itemTitle} numberOfLines={1}>{item.document_title}</Text>
      {item.page_number ? <Text style={styles.itemSubtitle}>Page {item.page_number}</Text> : null}
      <Text style={styles.itemContent} numberOfLines={3}>{item.snippet}</Text>
      <View style={styles.meta}>
        <Text style={styles.metaText}>{mode === 'semantic' ? 'Similar chunks' : 'Matches'}: {item.hit_chunks}</Text>
        {item.rrf_score !== undefined ? <Text style={styles.metaText}>RRF: {item.rrf_score.toFixed(4)}</Text> : null}
        {item.fts_rank !== undefined ? <Text style={styles.metaText}>BM25: {item.fts_rank.toFixed(2)}</Text> : null}
        {item.vec_distance !== undefined ? <Text style={styles.metaText}>Vec: {item.vec_distance.toFixed(4)}</Text> : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Search</Text>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Enter search query..."
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.modes}>
        {(['bm25', 'semantic', 'hybrid'] as SearchMode[]).map((m) => (
          <TouchableOpacity 
            key={m} 
            style={[styles.modeButton, mode === m && styles.activeMode]} 
            onPress={() => {
              Keyboard.dismiss();
              setMode(m);
              if (query.trim()) {
                // Re-run search for the new mode immediately.
                setOffset(0);
                setHasMore(false);
                handleSearch({ mode: m, append: false });
              }
            }}
          >
            <Text style={[styles.modeText, mode === m && styles.activeModeText]}>
              {m.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filters}>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Type</Text>
          {(['all', 'pdf', 'txt', 'md', 'manual'] as const).map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.filterChip, kindFilter === k && styles.filterChipActive]}
              onPress={() => {
                setKindFilter(k);
                setOffset(0);
                setHasMore(false);
                if (query.trim()) handleSearch({ append: false });
              }}
            >
              <Text style={[styles.filterChipText, kindFilter === k && styles.filterChipTextActive]}>
                {k.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Date</Text>
          {(['all', '7d', '30d'] as const).map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.filterChip, dateFilter === d && styles.filterChipActive]}
              onPress={() => {
                setDateFilter(d);
                setOffset(0);
                setHasMore(false);
                if (query.trim()) handleSearch({ append: false });
              }}
            >
              <Text style={[styles.filterChipText, dateFilter === d && styles.filterChipTextActive]}>
                {d.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {metrics && (
        <View style={styles.metrics}>
          <Text style={styles.metricsText}>
            Embedding: {metrics.embeddingMs}ms | Search: {metrics.searchMs}ms
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#3498db" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.document_id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (!hasMore || loadingMore || loading || !query.trim()) return;
            handleSearch({ append: true });
          }}
          onEndReachedThreshold={0.6}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color="#3498db" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text>No results found.</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    elevation: 2,
  },
  backButton: { fontSize: 18, color: '#3498db', marginRight: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  searchBar: { 
    flexDirection: 'row', 
    padding: 10, 
    backgroundColor: '#fff', 
    alignItems: 'center',
    marginTop: 10,
  },
  input: { 
    flex: 1, 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    padding: 10,
    marginRight: 10,
  },
  searchButton: { 
    backgroundColor: '#3498db', 
    padding: 12, 
    borderRadius: 8 
  },
  searchButtonText: { color: '#fff', fontWeight: 'bold' },
  modes: { 
    flexDirection: 'row', 
    padding: 10, 
    justifyContent: 'space-around',
    backgroundColor: '#fff',
  },
  modeButton: { 
    paddingVertical: 5, 
    paddingHorizontal: 15, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: '#3498db' 
  },
  activeMode: { backgroundColor: '#3498db' },
  modeText: { color: '#3498db', fontWeight: 'bold' },
  activeModeText: { color: '#fff' },
  filters: { backgroundColor: '#fff', paddingHorizontal: 10, paddingBottom: 10 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  filterLabel: { width: 40, fontSize: 12, fontWeight: '700', color: '#2c3e50' },
  filterChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#ecf0f1' },
  filterChipActive: { backgroundColor: '#2ecc71' },
  filterChipText: { fontSize: 11, color: '#2c3e50', fontWeight: '700' },
  filterChipTextActive: { color: '#fff' },
  metrics: { padding: 5, backgroundColor: '#eee', alignItems: 'center' },
  metricsText: { fontSize: 11, color: '#666' },
  list: { padding: 10 },
  footer: { paddingVertical: 16 },
  item: { 
    backgroundColor: '#fff', 
    padding: 15, 
    borderRadius: 8, 
    marginBottom: 10,
    elevation: 1,
  },
  itemTitle: { fontSize: 14, fontWeight: '700', color: '#2c3e50', marginBottom: 6 },
  itemSubtitle: { fontSize: 12, color: '#666', marginBottom: 6 },
  itemContent: { fontSize: 16, color: '#333' },
  meta: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 5 },
  metaText: { fontSize: 12, color: '#888' },
  empty: { flex: 1, alignItems: 'center', marginTop: 50 },
});

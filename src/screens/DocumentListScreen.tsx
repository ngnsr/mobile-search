import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Document, DocumentService } from '../services/DocumentService';

interface Props {
  documentService: DocumentService;
  onAddPress: () => void;
  onSearchPress: () => void;
  onStatsPress: () => void;
  onAssistantPress: () => void;
  onDocumentPress: (doc: Document) => void;
}

export const DocumentListScreen: React.FC<Props> = ({ 
  documentService, 
  onAddPress, 
  onSearchPress,
  onStatsPress,
  onAssistantPress,
  onDocumentPress
}) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const docs = await documentService.listDocuments();
      const seen = new Set<string>();
      const unique: Document[] = [];
      for (const d of docs) {
        const key = d.fingerprint ?? `${d.title}\n${d.content}`.slice(0, 2000);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(d);
      }
      setDocuments(unique);
    } catch {
      Alert.alert('Error', 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [documentService]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    const hasIndexing = documents.some((d) => d.status === 'INDEXING');
    if (!hasIndexing) return;

    const id = setInterval(() => {
      loadDocuments();
    }, 1000);
    return () => clearInterval(id);
  }, [documents, loadDocuments]);

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          await documentService.deleteDocument(id);
          loadDocuments();
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Documents</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.assistantButton} onPress={onAssistantPress}>
            <Text style={styles.buttonText}>Assistant</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statsButton} onPress={onStatsPress}>
            <Text style={styles.buttonText}>Stats</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.searchButton} onPress={onSearchPress}>
            <Text style={styles.buttonText}>Search</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.item} 
            onPress={() => onDocumentPress(item)}
            onLongPress={() => handleDelete(item.id)}
          >
            <Text style={styles.itemTitle}>{item.title}</Text>
            {item.status === 'INDEXING' ? (
              <View style={styles.indexingRow}>
                <ActivityIndicator size="small" color="#3498db" />
                <Text style={styles.indexingText}>
                  Indexing {item.indexed_chunks ?? 0}/{item.total_chunks ?? 0}
                </Text>
              </View>
            ) : item.status === 'FAILED' ? (
              <Text style={styles.failedText} numberOfLines={1}>
                Indexing failed{item.error_message ? `: ${item.error_message}` : ''}
              </Text>
            ) : null}
            <Text style={styles.itemDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text>No documents yet.</Text>
          </View>
        }
        refreshing={loading}
        onRefresh={loadDocuments}
      />

      <TouchableOpacity style={styles.fab} onPress={onAddPress}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    elevation: 2,
  },
  title: { fontSize: 24, fontWeight: 'bold' },
  headerButtons: { flexDirection: 'row', gap: 10 },
  assistantButton: { backgroundColor: '#e67e22', padding: 10, borderRadius: 5 },
  statsButton: { backgroundColor: '#9b59b6', padding: 10, borderRadius: 5 },
  searchButton: { backgroundColor: '#3498db', padding: 10, borderRadius: 5 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  item: { 
    backgroundColor: '#fff', 
    padding: 15, 
    marginHorizontal: 10, 
    marginTop: 10, 
    borderRadius: 8,
    elevation: 1,
  },
  itemTitle: { fontSize: 18, fontWeight: '500' },
  itemDate: { fontSize: 12, color: '#888', marginTop: 5 },
  indexingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  indexingText: { marginLeft: 8, fontSize: 12, color: '#3498db' },
  failedText: { marginTop: 6, fontSize: 12, color: '#c0392b' },
  empty: { flex: 1, alignItems: 'center', marginTop: 50 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: '#2ecc71',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  fabText: { color: '#fff', fontSize: 30, fontWeight: 'bold' },
});

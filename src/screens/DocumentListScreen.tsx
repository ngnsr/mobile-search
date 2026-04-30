import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Document, DocumentService } from '../services/DocumentService';

interface Props {
  documentService: DocumentService;
  onAddPress: () => void;
  onSearchPress: () => void;
  onStatsPress: () => void;
  onAssistantPress: () => void;
  onLegalPress: () => void;
  onManualPress: () => void;
  onDocumentPress: (doc: Document) => void;
}

export const DocumentListScreen: React.FC<Props> = ({ 
  documentService, 
  onAddPress, 
  onSearchPress,
  onStatsPress,
  onAssistantPress,
  onLegalPress,
  onManualPress,
  onDocumentPress
}) => {
  const { t, i18n } = useTranslation();
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
    }, 1200);
    return () => clearInterval(id);
  }, [documents, loadDocuments]);

  const handleDelete = (id: number) => {
    Alert.alert('Delete Document', 'This will permanently remove the indexed data. Are you sure?', [
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

  const toggleLanguage = async () => {
    const newLang = i18n.language === 'en' ? 'uk' : 'en';
    await AsyncStorage.setItem('@app_language', newLang);
    i18n.changeLanguage(newLang);
  };


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('documentList.title')}</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={[styles.navButton, { backgroundColor: '#3b82f6' }]} onPress={toggleLanguage}>
            <Text style={styles.navButtonText}>{i18n.language.toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navButton, { backgroundColor: '#10b981' }]} onPress={onStatsPress}>
            <Text style={styles.navButtonText}>{t('common.stats')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navButton, { backgroundColor: '#f59e0b' }]} onPress={onAssistantPress}>
            <Text style={styles.navButtonText}>{t('common.assistant')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navButton, { backgroundColor: '#6366f1' }]} onPress={onSearchPress}>
            <Text style={styles.navButtonText}>{t('common.search')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navButton, { backgroundColor: '#8b5cf6' }]} onPress={onManualPress}>
            <Text style={styles.navButtonText}>{t('common.manual', 'MANUAL')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navButton, { backgroundColor: '#64748b' }]} onPress={onLegalPress}>
            <Text style={styles.navButtonText}>{t('legal.title')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.card} 
            onPress={() => onDocumentPress(item)}
            onLongPress={() => handleDelete(item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.cardTop}>
              <View style={styles.typeIconBox}>
                <Text style={styles.typeEmoji}>{item.source_kind === 'pdf' ? '📕' : '📄'}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.cardMeta}>{new Date(item.created_at).toLocaleDateString()} • {item.source_kind?.toUpperCase() || 'MANUAL'}</Text>
              </View>
            </View>

            {item.status === 'INDEXING' ? (
              <View style={styles.statusBox}>
                <ActivityIndicator size="small" color="#6366f1" />
                <Text style={styles.indexingText}>
                  {t('documentList.statusIndexing')} ({item.indexed_chunks || 0}/{item.total_chunks || 0})
                </Text>
              </View>
            ) : item.status === 'FAILED' ? (
              <View style={[styles.statusBox, styles.statusBoxFailed]}>
                <Text style={styles.failedText}>{t('documentList.statusFailed')}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>{t('documentList.title')}</Text>
              <Text style={styles.emptyText}>{t('documentList.noDocuments')}</Text>
            </View>
          ) : null
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
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { 
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#0f172a' },
  headerButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  navButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  navButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  listContent: { padding: 16, paddingBottom: 100 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  typeIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  typeEmoji: { fontSize: 20 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  cardMeta: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  statusBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 12, 
    paddingTop: 12, 
    borderTopWidth: 1, 
    borderTopColor: '#f1f5f9' 
  },
  statusBoxFailed: { borderTopColor: '#fee2e2' },
  indexingText: { marginLeft: 8, fontSize: 12, color: '#6366f1', fontWeight: 'bold' },
  failedText: { fontSize: 12, color: '#ef4444', fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', maxWidth: '70%' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: '#6366f1',
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
});


import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DocumentService } from '../services/DocumentService';
import { FileIndexingService } from '../services/FileIndexingService';
import { ENV } from '../config/env';

interface Props {
  documentService: DocumentService;
  fileIndexingService: FileIndexingService;
  onBack: () => void;
  onSuccess: () => void;
}

export const AddDocumentScreen: React.FC<Props> = ({ 
  documentService, 
  fileIndexingService,
  onBack,
  onSuccess
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [enhancedPdf, setEnhancedPdf] = useState(false);
  const [manualCollapsed, setManualCollapsed] = useState(true);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert(t('common.error'), t('addDocument.errorNoTitle'));
      return;
    }

    try {
      setIsSaving(true);
      await documentService.addDocument(title, content);
      Alert.alert(t('common.success', 'Success'), t('addDocument.success'));
      onSuccess();
    } catch {
      Alert.alert(t('common.error'), t('addDocument.errorFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportFiles = async () => {
    try {
      setIsSaving(true);
      const { success, failed } = await fileIndexingService.selectAndIndexFiles({
        enhancedPdf,
        backendUrl: ENV.API_URL,
      });
      if (success > 0 || failed > 0) {
        Alert.alert(
          t('addDocument.importFinished'),
          t('addDocument.importSuccess', { success }) + (failed > 0 ? t('addDocument.importFailed', { failed }) : '')
        );
        if (success > 0) onSuccess();
      }
    } catch {
      // Error handled in service or user cancelled
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButtonBox}>
          <Text style={styles.backButton}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('addDocument.title')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('addDocument.importTitle')}</Text>
          <Text style={styles.sectionSubtitle}>{t('addDocument.importSubtitle')}</Text>
          
          <TouchableOpacity style={styles.importButton} onPress={handleImportFiles} disabled={isSaving}>
            <Text style={styles.importButtonText}>{t('addDocument.selectFiles')}</Text>
          </TouchableOpacity>

          <View style={styles.enhancedRow}>
            <TouchableOpacity
              style={[styles.checkbox, enhancedPdf && styles.checkboxChecked]}
              onPress={() => setEnhancedPdf((v) => !v)}
              disabled={isSaving}
            >
              <Text style={styles.checkboxText}>{enhancedPdf ? '✓' : ''}</Text>
            </TouchableOpacity>
            <View>
              <Text style={styles.enhancedLabel}>{t('addDocument.enhancedPdf')}</Text>
              <Text style={styles.enhancedSub}>{t('addDocument.enhancedPdfSub')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <TouchableOpacity 
            style={styles.manualHeader} 
            onPress={() => setManualCollapsed(!manualCollapsed)}
            activeOpacity={0.6}
          >
            <View>
              <Text style={styles.sectionTitle}>{t('addDocument.manualEntry')}</Text>
              {manualCollapsed && <Text style={styles.sectionSubtitle}>{t('addDocument.manualSubtitle')}</Text>}
            </View>
            <Text style={styles.collapseIcon}>{manualCollapsed ? '＋' : '－'}</Text>
          </TouchableOpacity>
          
          {!manualCollapsed && (
            <View style={styles.form}>
              <Text style={styles.label}>{t('addDocument.docTitle')}</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={t('addDocument.docTitlePlaceholder')}
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.label}>{t('addDocument.docContent')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={content}
                onChangeText={setContent}
                placeholder={t('addDocument.docContentPlaceholder')}
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={10}
              />

              <TouchableOpacity 
                style={[styles.saveButton, isSaving && styles.disabledButton]} 
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>{t('addDocument.saveDocument')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backButtonBox: { padding: 4 },
  backButton: { fontSize: 16, color: '#6366f1', fontWeight: 'bold' },
  title: { fontSize: 20, fontWeight: '800', color: '#1e293b', marginLeft: 16 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  importButton: { 
    backgroundColor: '#6366f1', 
    paddingVertical: 14, 
    borderRadius: 12, 
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  importButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  enhancedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, backgroundColor: '#f8fafc', padding: 12, borderRadius: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: { backgroundColor: '#6366f1' },
  checkboxText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  enhancedLabel: { fontSize: 14, color: '#1e293b', fontWeight: 'bold' },
  enhancedSub: { fontSize: 11, color: '#94a3b8' },
  form: { gap: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 8, marginTop: 16 },
  input: { 
    borderWidth: 1, 
    borderColor: '#e2e8f0', 
    borderRadius: 12, 
    padding: 14, 
    fontSize: 15,
    color: '#1e293b',
    backgroundColor: '#fff',
  },
  textArea: { 
    height: 160, 
    textAlignVertical: 'top' 
  },
  saveButton: { 
    backgroundColor: '#10b981', 
    paddingVertical: 16, 
    borderRadius: 12, 
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  disabledButton: { opacity: 0.6 },
  manualHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  collapseIcon: {
    fontSize: 20,
    color: '#6366f1',
    fontWeight: '900',
  },
});

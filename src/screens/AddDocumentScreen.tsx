import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native';
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
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [enhancedPdf, setEnhancedPdf] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Error', 'Title and content are required');
      return;
    }

    try {
      setIsSaving(true);
      await documentService.addDocument(title, content);
      Alert.alert('Success', 'Document added successfully');
      onSuccess();
    } catch {
      Alert.alert('Error', 'Failed to add document');
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
        Alert.alert('Import Finished', `Successfully indexed ${success} files.${failed > 0 ? ` Failed to index ${failed} files.` : ''}`);
        if (success > 0) onSuccess();
      }
    } catch {
      // Error handled in service or user cancelled
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportFolder = async () => {
    try {
      setIsSaving(true);
      const { success, failed } = await fileIndexingService.selectAndIndexFolder();
      Alert.alert('Import Finished', `Successfully indexed ${success} files from folder.${failed > 0 ? ` Failed: ${failed}` : ''}`);
      if (success > 0) onSuccess();
    } catch {
      // Error handled in service or user cancelled
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add Document</Text>
      </View>

      <View style={styles.importSection}>
        <Text style={styles.sectionTitle}>Import from Device</Text>
        <View style={styles.importButtons}>
          <TouchableOpacity style={styles.importButton} onPress={handleImportFiles} disabled={isSaving}>
            <Text style={styles.importButtonText}>Select Files</Text>
          </TouchableOpacity>
          {Platform.OS !== 'android' ? (
            <TouchableOpacity style={styles.importButton} onPress={handleImportFolder} disabled={isSaving}>
              <Text style={styles.importButtonText}>Select Folder</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.enhancedRow}>
          <TouchableOpacity
            style={[styles.checkbox, enhancedPdf && styles.checkboxChecked]}
            onPress={() => setEnhancedPdf((v) => !v)}
            disabled={isSaving}
          >
            <Text style={styles.checkboxText}>{enhancedPdf ? '✓' : ''}</Text>
          </TouchableOpacity>
          <Text style={styles.enhancedLabel}>Enhanced PDF (cloud conversion)</Text>
        </View>
        <Text style={styles.hint}>
          Supported: .txt, .md, .pdf (beta){Platform.OS === 'android' ? ' • Folder import: iOS only' : ''}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Manual Entry</Text>
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Document Title"
        />

        <Text style={styles.label}>Content</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={content}
          onChangeText={setContent}
          placeholder="Document Content"
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
            <Text style={styles.saveButtonText}>Save Document</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  importSection: { padding: 20, backgroundColor: '#f9f9f9' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#2c3e50' },
  importButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  importButton: { 
    backgroundColor: '#3498db', 
    padding: 12, 
    borderRadius: 8, 
    flex: 0.48, 
    alignItems: 'center' 
  },
  importButtonText: { color: '#fff', fontWeight: 'bold' },
  enhancedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3498db',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: { backgroundColor: '#3498db' },
  checkboxText: { color: '#fff', fontWeight: '800' },
  enhancedLabel: { fontSize: 12, color: '#2c3e50', fontWeight: '700' },
  backendRow: { marginTop: 10 },
  backendLabel: { fontSize: 12, color: '#666', marginBottom: 6, fontWeight: '700' },
  backendInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    fontSize: 12,
  },
  backendHint: { fontSize: 11, color: '#888', marginTop: 6 },
  hint: { fontSize: 12, color: '#7f8c8d', marginTop: 10, textAlign: 'center' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  form: { padding: 20 },
  label: { fontSize: 14, fontWeight: 'bold', marginBottom: 5, color: '#7f8c8d' },
  input: { 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    padding: 12, 
    fontSize: 16,
    marginBottom: 20,
  },
  textArea: { 
    height: 200, 
    textAlignVertical: 'top' 
  },
  saveButton: { 
    backgroundColor: '#2ecc71', 
    padding: 15, 
    borderRadius: 8, 
    alignItems: 'center' 
  },
  saveButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  disabledButton: { opacity: 0.6 },
});

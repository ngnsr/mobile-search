import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import Markdown from 'react-native-markdown-display';
import FileViewer from 'react-native-file-viewer';
import { SearchService } from '../services/SearchService';
import { AssistantService, ChatMessage } from '../services/AssistantService';

type UiSource = { id: number; title: string; localUri?: string | null; kind?: string | null };
type UiMsg = { role: 'user' | 'assistant'; content: string; sources?: UiSource[] };

export function AssistantScreen({
  searchService,
  onBack,
}: {
  searchService: SearchService;
  onBack: () => void;
}) {
  const [model, setModel] = useState('fast');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<UiMsg[]>([]);
  const [busy, setBusy] = useState(false);

  const assistant = useMemo(() => new AssistantService(), []);

  const send = async () => {
    const q = input.trim();
    if (!q) return;

    setBusy(true);
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: q }]);

    try {
      const res = await searchService.search(q, 'hybrid', 15);
      console.log('[DEBUG] Search results count:', res.results.length);
      if (res.results.length > 0) {
        console.log('[DEBUG] First search result metadata:', JSON.stringify({
          id: res.results[0].id,
          doc_id: res.results[0].document_id,
          title: res.results[0].document_title,
          local_uri: res.results[0].source_local_uri,
          kind: res.results[0].source_kind
        }, null, 2));
      }
      
      const sourceMap = new Map<number, UiSource>();
      const sources = res.results.map((r, idx) => {
        const title = r.document_title ?? `Doc ${r.document_id}`;
        
        if (!sourceMap.has(r.document_id)) {
          sourceMap.set(r.document_id, {
            id: r.document_id,
            title,
            localUri: r.source_local_uri,
            kind: r.source_kind
          });
        }

        const page = (r as any).page_number ? ` (p.${(r as any).page_number})` : '';
        // Removed harsh 900 character truncation so the full 300 words are sent
        return `[#${idx + 1}] ${title}${page}\n${r.content}`;
      });

      const system: ChatMessage = {
        role: 'system',
        content:
          'You are a helpful assistant for a local document search app. ' +
          'Answer the user using ONLY the provided sources. ' +
          'If sources are insufficient, say so. ' +
          'Cite sources like [#1], [#2].',
      };

      const user: ChatMessage = {
        role: 'user',
        content: `Question: ${q}\n\nSources:\n\n${sources.join('\n\n---\n\n')}`,
      };

      const finalSources = Array.from(sourceMap.values());

      // Immediately add an empty assistant message that we will stream into
      setMessages((m) => [...m, { role: 'assistant', content: '', sources: finalSources }]);

      await assistant.chat({ 
        model, 
        messages: [system, user],
        onChunk: (chunk) => {
          setMessages((current) => {
            const next = [...current];
            const lastIdx = next.length - 1;
            if (next[lastIdx].role === 'assistant') {
              next[lastIdx] = { ...next[lastIdx], content: next[lastIdx].content + chunk };
            }
            return next;
          });
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Assistant error', msg);
    } finally {
      setBusy(false);
    }
  };

  // Removed handleOpenSource as requested
  const handleOpenSource = async (source: UiSource) => {
    // Feature disabled
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Assistant</Text>
      </View>

      <View style={styles.divider} />

      <ScrollView style={styles.chat} contentContainerStyle={styles.chatContent}>
        {messages.length === 0 ? (
          <Text style={styles.empty}>Ask something about your documents.</Text>
        ) : null}
        {messages.map((m, idx) => (
          <View key={idx} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            <Text style={styles.bubbleRole}>{m.role.toUpperCase()}</Text>
            {m.role === 'assistant' ? (
              <>
                {m.sources && m.sources.length > 0 && (
                  <View style={styles.sourcesContainer}>
                    <Text style={styles.sourcesTitle}>Sources used ({m.sources.length}):</Text>
                    <View style={styles.sourcesList}>
                      {m.sources.map((src) => (
                        <View
                          key={src.id}
                          style={styles.sourceItem}
                        >
                          <View style={[styles.iconBox, { backgroundColor: src.kind === 'pdf' ? '#fee2e2' : '#e0f2fe' }]}>
                            <Text style={styles.sourceIcon}>{src.kind === 'pdf' ? '📕' : '📄'}</Text>
                          </View>
                          <View style={styles.sourceInfo}>
                            <Text style={styles.sourceText} numberOfLines={1}>{src.title}</Text>
                            <Text style={styles.sourceDetail}>{src.kind?.toUpperCase() || 'FILE'}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                <Markdown style={markdownStyles}>{m.content}</Markdown>
              </>
            ) : (
              <Text style={styles.bubbleText}>{m.content}</Text>
            )}
          </View>
        ))}
        {busy ? <ActivityIndicator size="small" color="#3498db" /> : null}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          value={input}
          onChangeText={setInput}
          placeholder="Type a question..."
          editable={!busy}
          onSubmitEditing={send}
        />
        <TouchableOpacity style={[styles.sendButton, busy && styles.sendDisabled]} onPress={send} disabled={busy}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: '#fff', elevation: 2 },
  backButton: { fontSize: 18, color: '#3498db', marginRight: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  settings: { padding: 14, backgroundColor: '#fff' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#2c3e50', marginBottom: 10 },
  label: { fontSize: 12, color: '#666', marginBottom: 6, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: '#fff', fontSize: 12, marginBottom: 10 },
  saveButton: { backgroundColor: '#2ecc71', padding: 10, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  divider: { height: 1, backgroundColor: '#eee' },
  chat: { flex: 1 },
  chatContent: { padding: 12, gap: 10 },
  empty: { color: '#888', textAlign: 'center', marginTop: 20 },
  bubble: { padding: 10, borderRadius: 10 },
  userBubble: { backgroundColor: '#d6ecff', alignSelf: 'flex-end', maxWidth: '85%' },
  assistantBubble: { backgroundColor: '#fff', alignSelf: 'flex-start', maxWidth: '90%', minWidth: '70%' },
  bubbleRole: { fontSize: 10, color: '#666', fontWeight: '800', marginBottom: 6 },
  bubbleText: { fontSize: 13, color: '#2c3e50' },
  sourcesContainer: { marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 10 },
  sourcesTitle: { fontSize: 9, color: '#a0aec0', fontWeight: '800', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  sourcesList: { gap: 8 },
  sourceItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    borderWidth: 1, 
    borderColor: '#edf2f7', 
    borderRadius: 10, 
    padding: 8,
    width: '100%',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sourceIcon: { fontSize: 18 },
  sourceInfo: { flex: 1 },
  sourceText: { fontSize: 13, color: '#2d3748', fontWeight: '700' },
  sourceDetail: { fontSize: 10, color: '#a0aec0', marginTop: 1 },
  openArrowBox: {
    padding: 4,
  },
  openArrow: { fontSize: 16, color: '#3182ce', fontWeight: 'bold' },
  composer: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', gap: 10, alignItems: 'center' },
  composerInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14 },
  sendButton: { backgroundColor: '#3498db', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  sendDisabled: { opacity: 0.6 },
  sendText: { color: '#fff', fontWeight: '800' },
});

const markdownStyles = StyleSheet.create({
  body: { fontSize: 13, color: '#2c3e50' },
  code_block: { backgroundColor: '#f0f0f0', padding: 8, borderRadius: 4, fontFamily: 'monospace' },
  code_inline: { backgroundColor: '#f0f0f0', paddingHorizontal: 4, borderRadius: 4, fontFamily: 'monospace' },
});


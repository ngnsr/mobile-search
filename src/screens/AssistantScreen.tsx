import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-native-markdown-display';
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
  const { t } = useTranslation();
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
      
      const sourceDocs: { id: number; uiIndex: number; title: string; chunks: string[]; localUri?: string | null; kind?: string | null }[] = [];
      const docIdToIndex = new Map<number, number>();

      res.results.forEach((r) => {
        if (!docIdToIndex.has(r.document_id)) {
          docIdToIndex.set(r.document_id, sourceDocs.length);
          sourceDocs.push({
            id: r.document_id,
            uiIndex: sourceDocs.length + 1,
            title: r.document_title ?? `Doc ${r.document_id}`,
            chunks: [],
            localUri: r.source_local_uri,
            kind: r.source_kind
          });
        }
        const doc = sourceDocs[docIdToIndex.get(r.document_id)!];
        const page = (r as any).page_number ? ` (Page ${(r as any).page_number})` : '';
        doc.chunks.push(`--- Chunk${page} ---\n${r.content}`);
      });

      const finalSources = sourceDocs.map(d => ({
        id: d.id,
        title: `[#${d.uiIndex}] ${d.title}`,
        localUri: d.localUri,
        kind: d.kind
      }));

      const sourcesText = sourceDocs.length > 0 
        ? sourceDocs.map(d => `Source [#${d.uiIndex}]: ${d.title}\n${d.chunks.join('\n\n')}`).join('\n\n====================\n\n')
        : t('assistant.noSources');

      const system: ChatMessage = {
        role: 'system',
        content:
          'You are a strict assistant for a local document search app. ' +
          'For questions about documents, you MUST answer using ONLY the provided sources. ' +
          `If the provided sources do not contain the answer, you MUST reply EXACTLY with: "${t('assistant.cannotAnswer')}" ` +
          'If the user just says hello or makes small talk, greet them politely and remind them you only answer questions based on documents. ' +
          'DO NOT use your internal knowledge for factual queries. DO NOT hallucinate information or citations. ' +
          'When citing a source, use the exact format [#<number>].',
      };

      const user: ChatMessage = {
        role: 'user',
        content: `Sources:\n\n${sourcesText}\n\nQuestion: ${q}`,
      };

      const history: ChatMessage[] = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      // Keep only the last 10 messages to avoid context overflow
      const recentHistory = history.slice(-10);

      setMessages((m) => [...m, { role: 'assistant', content: '', sources: finalSources }]);

      await assistant.chat({ 
        model, 
        messages: [system, ...recentHistory, user],
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
      Alert.alert(t('common.error'), msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButtonBox}>
          <Text style={styles.backButton}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('assistant.title')}</Text>
      </View>

      <ScrollView style={styles.chat} contentContainerStyle={styles.chatContent}>
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>{t('assistant.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('assistant.emptyText')}</Text>
          </View>
        ) : null}
        {messages.map((m, idx) => (
          <View key={idx} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            <Text style={styles.bubbleRole}>{m.role.toUpperCase()}</Text>
            {m.role === 'assistant' ? (
              <>
                {m.sources && m.sources.length > 0 && (
                  <View style={styles.sourcesContainer}>
                    <Text style={styles.sourcesLabel}>{t('assistant.sourcesLabel')}</Text>
                    <View style={styles.sourcesList}>
                      {m.sources.map((src) => (
                        <View key={src.id} style={styles.sourceRow}>
                          <Text style={styles.sourceEmoji}>{src.kind === 'pdf' ? '📕' : '📄'}</Text>
                          <Text style={styles.sourceTitle} numberOfLines={1}>{src.title}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                <Markdown style={markdownStyles}>{m.content || '...'}</Markdown>
              </>
            ) : (
              <Text style={styles.bubbleText}>{m.content}</Text>
            )}
          </View>
        ))}
        {busy ? (
          <View style={styles.loaderLine}>
            <ActivityIndicator size="small" color="#6366f1" />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          value={input}
          onChangeText={setInput}
          placeholder={t('assistant.composerPlaceholder')}
          placeholderTextColor="#94a3b8"
          editable={!busy}
          onSubmitEditing={send}
        />
        <TouchableOpacity style={[styles.sendButton, busy && styles.sendDisabled]} onPress={send} disabled={busy}>
          <Text style={styles.sendText}>{t('assistant.send')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingVertical: 16,
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#f1f5f9'
  },
  backButtonBox: { padding: 4 },
  backButton: { fontSize: 16, color: '#6366f1', fontWeight: 'bold' },
  title: { fontSize: 20, fontWeight: '800', color: '#1e293b', marginLeft: 16 },
  chat: { flex: 1 },
  chatContent: { padding: 16, paddingBottom: 32, gap: 20 },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyTitle: { fontSize: 24, fontWeight: '900', color: '#1e293b', marginBottom: 8 },
  emptyText: { fontSize: 15, color: '#64748b', textAlign: 'center', maxWidth: '80%' },
  bubble: { 
    padding: 16, 
    borderRadius: 16, 
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  userBubble: { 
    backgroundColor: '#6366f1', 
    alignSelf: 'flex-end', 
    borderBottomRightRadius: 4,
  },
  assistantBubble: { 
    backgroundColor: '#fff', 
    alignSelf: 'flex-start', 
    borderTopLeftRadius: 4,
    minWidth: '80%',
    borderColor: '#f1f5f9',
    borderWidth: 1,
  },
  bubbleRole: { fontSize: 9, fontWeight: '900', marginBottom: 8, letterSpacing: 1 },
  bubbleRoleUser: { color: 'rgba(255,255,255,0.7)' },
  bubbleRoleAssistant: { color: '#94a3b8' },
  bubbleText: { fontSize: 15, lineHeight: 22, color: '#fff' },
  sourcesContainer: { 
    marginBottom: 16, 
    backgroundColor: '#f1f5f9', 
    padding: 12, 
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sourcesLabel: { 
    fontSize: 10, 
    fontWeight: '900', 
    color: '#64748b', 
    marginBottom: 10, 
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  sourcesList: { gap: 8 },
  sourceRow: { 
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff', 
    paddingHorizontal: 12, 
    paddingVertical: 10, 
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sourceEmoji: { fontSize: 14, marginRight: 10 },
  sourceTitle: { fontSize: 13, fontWeight: '600', color: '#1e293b', flex: 1 },
  composer: { 
    flexDirection: 'row', 
    padding: 16, 
    backgroundColor: '#fff', 
    gap: 12, 
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  composerInput: { 
    flex: 1, 
    backgroundColor: '#f8fafc',
    borderRadius: 12, 
    paddingHorizontal: 16, 
    paddingVertical: 12,
    fontSize: 15,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  sendButton: { 
    backgroundColor: '#6366f1', 
    paddingVertical: 12, 
    paddingHorizontal: 20, 
    borderRadius: 12,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#fff', fontWeight: 'bold' },
  loaderLine: { alignSelf: 'flex-start', marginLeft: 20 },
});

const markdownStyles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 24, color: '#1e293b' },
  code_block: { backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: 13, marginVertical: 8 },
  code_inline: { backgroundColor: '#f1f5f9', paddingHorizontal: 6, borderRadius: 4, fontFamily: 'monospace', fontWeight: '700' },
  link: { color: '#6366f1', textDecorationLine: 'underline' },
});



import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import './i18n';
import { useTranslation } from 'react-i18next';
import { useAppInitialization } from './hooks/useAppInitialization';
import { DocumentListScreen } from './screens/DocumentListScreen';
import { AddDocumentScreen } from './screens/AddDocumentScreen';
import { SearchScreen } from './screens/SearchScreen';
import { ResultDetailScreen } from './screens/ResultDetailScreen';
import { StatsScreen } from './screens/StatsScreen';
import { AssistantScreen } from './screens/AssistantScreen';
import { LegalScreen } from './screens/LegalScreen';
import { ManualScreen } from './screens/ManualScreen';
import { Document } from './services/DocumentService';
import { SearchDocumentResult, SearchMode } from './services/SearchService';
import { StatsService } from './services/StatsService';

type Screen = 'list' | 'add' | 'search' | 'detail' | 'stats' | 'assistant' | 'legal' | 'manual';

export default function App() {
  const { isReady, status, db, documentService, searchService, fileIndexingService } = useAppInitialization();
  const [currentScreen, setCurrentScreen] = useState<Screen>('list');
  const [selectedItem, setSelectedItem] = useState<
    | { kind: 'doc'; doc: Document }
    | { kind: 'result'; result: SearchDocumentResult; query: string; mode: SearchMode }
    | null
  >(null);

  const { t } = useTranslation();

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>{status}</Text>
      </View>
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'list':
        return (
          <DocumentListScreen
            documentService={documentService!}
            onAddPress={() => setCurrentScreen('add')}
            onSearchPress={() => setCurrentScreen('search')}
            onStatsPress={() => setCurrentScreen('stats')}
            onAssistantPress={() => setCurrentScreen('assistant')}
            onLegalPress={() => setCurrentScreen('legal')}
            onManualPress={() => setCurrentScreen('manual')}
            onDocumentPress={(doc) => {
              setSelectedItem({ kind: 'doc', doc });
              setCurrentScreen('detail');
            }}
          />
        );
      case 'add':
        return (
          <AddDocumentScreen
            documentService={documentService!}
            fileIndexingService={fileIndexingService!}
            onBack={() => setCurrentScreen('list')}
            onSuccess={() => setCurrentScreen('list')}
          />
        );
      case 'search':
        return (
          <SearchScreen
            searchService={searchService!}
            onBack={() => setCurrentScreen('list')}
            onResultPress={(result, ctx) => {
              setSelectedItem({ kind: 'result', result, query: ctx.query, mode: ctx.mode });
              setCurrentScreen('detail');
            }}
          />
        );
      case 'detail':
        return (
          <ResultDetailScreen
            item={selectedItem}
            documentService={documentService!}
            fileIndexingService={fileIndexingService!}
            onBack={() => {
              // If we came from search, go back to search, otherwise list
              // For simplicity, just go back to where we can
              setSelectedItem(null);
              setCurrentScreen(selectedItem?.kind === 'doc' ? 'list' : 'search');
            }}
          />
        );
      case 'stats':
        return (
          <StatsScreen
            statsService={new StatsService(db!)}
            onBack={() => setCurrentScreen('list')}
          />
        );
      case 'assistant':
        return <AssistantScreen searchService={searchService!} onBack={() => setCurrentScreen('list')} />;
      case 'legal':
        return <LegalScreen onBack={() => setCurrentScreen('list')} />;
      case 'manual':
        return <ManualScreen onBack={() => setCurrentScreen('list')} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        {renderScreen()}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  loadingText: { marginTop: 20, fontSize: 16, color: '#34495e', fontWeight: '500' },
});

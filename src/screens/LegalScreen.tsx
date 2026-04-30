import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
  onBack: () => void;
}

type Tab = 'eula' | 'privacy';

export const LegalScreen: React.FC<Props> = ({ onBack }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('eula');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('legal.title')}</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'eula' && styles.activeTab]} 
          onPress={() => setActiveTab('eula')}
        >
          <Text style={[styles.tabText, activeTab === 'eula' && styles.activeTabText]}>{t('legal.eula')}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'privacy' && styles.activeTab]} 
          onPress={() => setActiveTab('privacy')}
        >
          <Text style={[styles.tabText, activeTab === 'privacy' && styles.activeTabText]}>{t('legal.privacy')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <Text style={styles.sectionTitle}>
          {activeTab === 'eula' ? t('legal.eulaTitle') : t('legal.privacyTitle')}
        </Text>
        <Text style={styles.text}>
          {activeTab === 'eula' ? t('legal.eulaText') : t('legal.privacyText')}
        </Text>
        <View style={styles.divider} />
        <Text style={styles.footerText}>{t('legal.footer')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 15,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
  },
  tabContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: '#f8fafc',
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#e2e8f0',
  },
  activeTab: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  activeTabText: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 15,
  },
  text: {
    fontSize: 15,
    lineHeight: 24,
    color: '#475569',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 30,
  },
  footerText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
});

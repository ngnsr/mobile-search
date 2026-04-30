import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Dimensions, Platform, Alert } from 'react-native';
import Pdf from 'react-native-pdf';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import { useTranslation } from 'react-i18next';

interface Props {
  onBack: () => void;
}

export function ManualScreen({ onBack }: Props) {
  const { t } = useTranslation();
  
  const source = Platform.select({
    ios: require('../../assets/searchio.pdf'),
    android: { uri: 'bundle-assets://searchio.pdf' },
  });

  const handleShare = async () => {
    try {
      const fileName = 'searchio.pdf';
      const localPath = `${RNFS.CachesDirectoryPath}/${fileName}`;
      
      // Ensure file exists in cache for sharing
      if (!(await RNFS.exists(localPath))) {
        if (Platform.OS === 'android') {
          await RNFS.copyFileAssets(fileName, localPath);
        } else {
          const bundlePath = `${RNFS.MainBundlePath}/${fileName}`;
          if (await RNFS.exists(bundlePath)) {
            await RNFS.copyFile(bundlePath, localPath);
          }
        }
      }

      // We use file:// URI now that FileProvider is configured in AndroidManifest.xml
      const shareUrl = Platform.OS === 'android' ? `file://${localPath}` : localPath;
      
      await Share.open({
        url: shareUrl,
        type: 'application/pdf',
        title: t('common.manual', 'Searchio Manual'),
      });
    } catch (error) {
      if (error && (error as any).message !== 'User did not share') {
        console.error('Share error:', error);
        Alert.alert(t('common.error'), t('common.shareError', 'Could not share the file.'));
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← {t('common.back', 'Back')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('common.manual', 'Manual')}</Text>
        </View>
        <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
          <Text style={styles.shareButtonText}>{t('common.share', 'Share')}</Text>
        </TouchableOpacity>
      </View>
      <Pdf
        source={source}
        style={styles.pdf}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3498db',
    fontWeight: '600',
  },
  shareButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3498db',
    borderRadius: 6,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  pdf: {
    flex: 1,
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
});

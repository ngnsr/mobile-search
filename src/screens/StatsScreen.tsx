import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { StatsService } from '../services/StatsService';
import { BarChart } from '../components/charts/BarChart';
import { Sparkline } from '../components/charts/Sparkline';
import { StackedBar } from '../components/charts/StackedBar';

export function StatsScreen({ statsService, onBack }: { statsService: StatsService; onBack: () => void }) {
  const [byKind, setByKind] = useState<Array<{ kind: string; count: number }>>([]);
  const [searchByDay, setSearchByDay] = useState<Array<{ day: string; count: number }>>([]);
  const [searchByMode, setSearchByMode] = useState<Array<{ mode: string; count: number }>>([]);
  const [avgLatency, setAvgLatency] = useState<Array<{ mode: string; avg_total_ms: number }>>([]);
  const [series, setSeries] = useState<Array<{ total_ms: number; created_at: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [k, byDay, byMode, avg, ser] = await Promise.all([
        statsService.getDocumentCountsByKind(),
        statsService.getSearchCountsByDay(7),
        statsService.getSearchCountsByMode(),
        statsService.getAvgLatencyByMode(),
        statsService.getLatencySeries(32),
      ]);
      if (cancelled) return;
      setByKind(k);
      setSearchByDay(byDay);
      setSearchByMode(byMode);
      setAvgLatency(avg);
      setSeries(ser.reverse());
    })();
    return () => {
      cancelled = true;
    };
  }, [statsService]);

  const barData = useMemo(
    () =>
      byKind.map((d) => ({
        label: d.kind.toUpperCase(),
        value: d.count,
        color: d.kind === 'pdf' ? '#e67e22' : d.kind === 'manual' ? '#2ecc71' : '#3498db',
      })),
    [byKind],
  );

  const searchesByDayBars = useMemo(
    () =>
      searchByDay.map((d) => ({
        label: d.day.slice(5),
        value: d.count,
        color: '#f39c12',
      })),
    [searchByDay],
  );

  const modeStack = useMemo(() => {
    const color = (m: string) => (m === 'bm25' ? '#3498db' : m === 'semantic' ? '#9b59b6' : '#2ecc71');
    return searchByMode.map((d) => ({ label: d.mode.toUpperCase(), value: d.count, color: color(d.mode) }));
  }, [searchByMode]);

  const avgBars = useMemo(
    () =>
      avgLatency.map((d) => ({
        label: d.mode.toUpperCase(),
        value: d.avg_total_ms,
        color: d.mode === 'bm25' ? '#3498db' : d.mode === 'semantic' ? '#9b59b6' : '#2ecc71',
      })),
    [avgLatency],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Stats</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Documents by Type (Bar Chart)</Text>
        <BarChart data={barData} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Searches (Last 7 Days) (Bar Chart)</Text>
        <BarChart data={searchesByDayBars} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Search Mode Distribution (Stacked Bar)</Text>
        <StackedBar data={modeStack} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Search Latency (Sparkline)</Text>
        <Sparkline values={series.map((s) => s.total_ms)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Avg Latency by Mode (Bar Chart)</Text>
        <BarChart data={avgBars} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { paddingBottom: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    elevation: 2,
  },
  backButton: { fontSize: 18, color: '#3498db', marginRight: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  card: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 14,
    borderRadius: 10,
    elevation: 1,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#2c3e50', marginBottom: 12 },
});

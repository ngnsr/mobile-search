import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function Sparkline({
  values,
  height = 40,
  label,
}: {
  values: number[];
  height?: number;
  label?: string;
}) {
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.row, { height }]}>
        {values.map((v, idx) => {
          const norm = (v - min) / range;
          const barH = Math.max(2, norm * height);
          return <View key={idx} style={[styles.bar, { height: barH }]} />;
        })}
      </View>
      <View style={styles.meta}>
        <Text style={styles.metaText}>min {Math.round(min)}ms</Text>
        <Text style={styles.metaText}>max {Math.round(max)}ms</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: '#2c3e50', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 6, backgroundColor: '#9b59b6', borderRadius: 3 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  metaText: { fontSize: 11, color: '#888' },
});


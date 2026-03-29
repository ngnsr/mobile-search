import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type BarDatum = {
  label: string;
  value: number;
  color?: string;
};

export function BarChart({
  data,
  maxValue,
}: {
  data: BarDatum[];
  maxValue?: number;
}) {
  const max = maxValue ?? Math.max(1, ...data.map((d) => d.value));

  return (
    <View style={styles.root}>
      {data.map((d) => {
        const widthPct = Math.max(0, Math.min(100, (d.value / max) * 100));
        return (
          <View key={d.label} style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>
              {d.label}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${widthPct}%`, backgroundColor: d.color ?? '#3498db' }]} />
            </View>
            <Text style={styles.value}>{Math.round(d.value)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { width: 76, fontSize: 12, color: '#2c3e50', fontWeight: '700' },
  track: {
    flex: 1,
    height: 10,
    borderRadius: 6,
    backgroundColor: '#ecf0f1',
    overflow: 'hidden',
  },
  fill: { height: 10, borderRadius: 6 },
  value: { width: 48, textAlign: 'right', fontSize: 12, color: '#34495e' },
});


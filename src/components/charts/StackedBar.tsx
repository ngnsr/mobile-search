import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type StackedDatum = {
  label: string;
  value: number;
  color: string;
};

export function StackedBar({ data }: { data: StackedDatum[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  return (
    <View>
      <View style={styles.bar}>
        {data.map((d) => {
          const widthPct = Math.max(0, (d.value / total) * 100);
          return <View key={d.label} style={[styles.seg, { width: `${widthPct}%`, backgroundColor: d.color }]} />;
        })}
      </View>
      <View style={styles.legend}>
        {data.map((d) => (
          <View key={d.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: d.color }]} />
            <Text style={styles.legendText}>
              {d.label}: {d.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 12,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#ecf0f1',
  },
  seg: { height: 12 },
  legend: { marginTop: 10, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#34495e' },
});


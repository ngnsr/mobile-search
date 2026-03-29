module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Catch accidental 'any' usages — warn instead of error to not block CI immediately
    '@typescript-eslint/no-explicit-any': 'warn',
    // Missing useEffect deps is a common source of stale closure bugs
    'react-hooks/exhaustive-deps': 'error',
    // Discourage raw console.log in production code; use src/utils/logger.ts instead
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    // Prefer const for variables that are never reassigned
    'prefer-const': 'error',
  },
};

import { globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'node_modules/**', 'next-env.d.ts']),
  {
    rules: {
      // v2.16.12 上游代码尚未迁移到 React 19 的编译器约束；沿用升级前的 Lint 基线。
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/incompatible-library': 'off',
      // 播放器与 ArtPlayer/hls.js 交互处存在少量受控的 any（第三方类型未覆盖），
      // 保留告警即可，不阻塞构建。
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];

export default eslintConfig;

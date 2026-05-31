import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.karuta.app',
  appName: '歌牌 Karuta',
  webDir: '../frontend/dist',
  server: {
    // 允许 WebView 加载 COS 资源（图片/音频）
    allowNavigation: ['*.myqcloud.com'],
    androidScheme: 'http',
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#FFB7C5',
    },
  },
};

export default config;

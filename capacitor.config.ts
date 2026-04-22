import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stegosec.app',
  appName: 'StegoSec',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
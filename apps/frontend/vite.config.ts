import { defineConfig } from 'vite';
//import react from '@vitejs/plugin-react';

//export default defineConfig({
//  plugins: [react()],
//  envDir: '../..',
//  server: {
//    port: 5173,
//  },
//});
export default defineConfig({
  server: {
    allowedHosts: [
      'gala-immersion-drinkable.ngrok-free.dev'
    ]
  }
})
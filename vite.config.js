export default {
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './race-insight.html',
        index: './index.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
}

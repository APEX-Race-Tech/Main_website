export default {
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './race-insight.html',
        index: './index.html',
        kineticsports: './kineticsports.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
}

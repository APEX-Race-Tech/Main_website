export default {
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './race-insight.html',
        index: './index.html',
        kineticsports: './kineticsports.html',
        racing: './racing.html',
        'race-insight/eula': './race-insight/eula.html',
        'race-insight/terms': './race-insight/terms.html',
        'race-insight/privacy-policy': './race-insight/privacy-policy.html',
        'race-insight/third-party-licenses': './race-insight/third-party-licenses.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
}

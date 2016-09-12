module.exports = {
  plugins: {
    appWebserver: {
      host: '0.0.0.0',
      port: 7979,
      session: {
        name: 'sessionId',
        secret: 'd0bi3td4y',
        store: {
          type: 'redis',
          url: 'redis://localhost:6379'
        }
      },
      cacheControl: {
        enabled: false,
        pattern: {
          operator: 'or',
          url: /^\/(assets|css|js|picture|font)\/.+/,
          contentType: /^\/(jpeg|png|gif)$/
        },
        maxAge: 3600
      },
      printRequestInfo: false
    }
  }
};

module.exports = {
  plugins: {
    appWebserver: {
      host: '0.0.0.0',
      port: 7979,
      session: {
        name: 'sessionId',
        secret: 'd0bi3td4y',
        mongodb: {
          uri: 'mongodb://localhost:27017/devebot-session'
        }
      }
    }
  }
};

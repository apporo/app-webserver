module.exports = {
  logger: {
    transports: {
      console: {
        type: 'console',
        level: 'debug',
        json: false,
        timestamp: true,
        colorize: true
      }
    }
  },
  newFeatures: {
    application: {
      logoliteEnabled: true,
      sandboxConfig: true
    }
  }
};

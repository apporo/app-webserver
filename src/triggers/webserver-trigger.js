'use strict';

const Devebot = require('devebot');
const chores = Devebot.require('chores');
const lodash = Devebot.require('lodash');
const fs = require('fs');
const http = require('http');
const https = require('https');

const SERVER_HOSTS = ['0.0.0.0', '127.0.0.1', 'localhost'];

function WebserverTrigger(params) {
  params = params || {};
  let self = this;

  let LX = params.loggingFactory.getLogger();
  let LT = params.loggingFactory.getTracer();
  let packageName = params.packageName || 'app-webserver';
  let blockRef = chores.getBlockRef(__filename, packageName);

  LX.has('silly') && LX.log('silly', LT.toMessage({
    tags: [ blockRef, 'constructor-begin' ],
    text: ' + constructor start ...'
  }));

  let pluginCfg = params.sandboxConfig;
  let appHost = pluginCfg && pluginCfg.host || '0.0.0.0';
  let appPort = pluginCfg && pluginCfg.port || 7979;
  let appProto = 'http';

  let ssl = { available: false };
  Object.defineProperty(self, 'ssl', {
    get: function() { return lodash.assign({}, ssl) },
    set: function(value) {}
  });

  if (pluginCfg.ssl && pluginCfg.ssl.enabled) {
    pluginCfg.ssl = pluginCfg.ssl || {};

    LX.has('silly') && LX.log('silly', LT.add({
      sslConfig: pluginCfg.ssl
    }).toMessage({
      tags: [ blockRef, 'ssl', 'enabled' ],
      text: 'SSL is enabled'
    }));

    ssl.ca = pluginCfg.ssl.ca;
    try {
      ssl.ca = ssl.ca || fs.readFileSync(pluginCfg.ssl.ca_file);
    } catch(error) {
      LX.has('silly') && LX.log('silly', LT.add({
        ca: ssl.ca,
        ca_file: pluginCfg.ssl.ca_file,
        error: error
      }).toMessage({
        tags: [ blockRef, 'ssl', 'ca-loading' ],
        text: 'error on loading CA files[${ca_file}]: ${error}'
      }));
    }

    ssl.key = pluginCfg.ssl.key;
    ssl.cert = pluginCfg.ssl.cert;
    try {
      ssl.key = ssl.key || fs.readFileSync(pluginCfg.ssl.key_file);
      ssl.cert = ssl.cert || fs.readFileSync(pluginCfg.ssl.cert_file);
    } catch(error) {
      LX.has('silly') && LX.log('silly', LT.add({
        key: ssl.key,
        key_file: pluginCfg.ssl.key_file,
        cert: ssl.cert,
        cert_file: pluginCfg.ssl.cert_file,
        error: error
      }).toMessage({
        tags: [ blockRef, 'ssl', 'key-cert-loading' ],
        text: 'error on loading key/cert files: ${error}'
      }));
    }

    if (!ssl.key && !ssl.cert && SERVER_HOSTS.indexOf(appHost)>=0) {
      LX.has('silly') && LX.log('silly', LT.toMessage({
        tags: [ blockRef, 'ssl', 'key-cert-use-default' ],
        text: 'Using default key/cert for localhost'
      }));
      ssl.key = fs.readFileSync(path.join(__dirname, '../../data/ssl/localhost.key.pem'));
      ssl.cert = fs.readFileSync(path.join(__dirname, '../../data/ssl/localhost.cert.pem'));
    }

    if (ssl.key && ssl.cert) {
      appProto = 'https';
      ssl.available = true;
      LX.has('silly') && LX.log('silly', LT.add({
        ssl: ssl
      }).toMessage({
        tags: [ blockRef, 'ssl', 'available' ],
        text: 'HTTPs is available'
      }));
    }
  } else {
    LX.has('silly') && LX.log('silly', LT.toMessage({
      tags: [ blockRef, 'ssl', 'disabled' ],
      text: 'SSL is disabled'
    }));
  }

  let server = ssl.available ? https.createServer({
    ca: ssl.ca,
    cert: ssl.cert,
    key: ssl.key,
    requestCert: true,
    rejectUnauthorized: false
  }) : http.createServer();

  Object.defineProperty(self, 'server', {
    get: function() { return server },
    set: function(value) {}
  });

  self.attach = self.register = function(outlet) {
    LX.has('silly') && LX.log('silly', LT.toMessage({
      tags: [ blockRef, 'attach', 'begin' ],
      text: 'attach() - try to register a outlet'
    }));
    if (server.listeners('request').indexOf(outlet) >= 0) {
      LX.has('silly') && LX.log('silly', LT.toMessage({
        tags: [ blockRef, 'attach', 'skip' ],
        text: 'attach() - outlet has already attached. skip!'
      }));
    } else {
      server.addListener('request', outlet);
      LX.has('silly') && LX.log('silly', LT.toMessage({
        tags: [ blockRef, 'attach', 'done' ],
        text: 'attach() - attach the outlet'
      }));
    }
  }

  self.detach = self.unregister = function(outlet) {
    LX.has('silly') && LX.log('silly', LT.toMessage({
      tags: [ blockRef, 'detach', 'begin' ],
      text: 'detach() - try to unregister a outlet'
    }));
    if (server.listeners('request').indexOf(outlet) >= 0) {
      server.removeListener('request', outlet);
      LX.has('silly') && LX.log('silly', LT.toMessage({
        tags: [ blockRef, 'detach', 'done' ],
        text: 'detach() - detach the outlet'
      }));
    } else {
      LX.has('silly') && LX.log('silly', LT.toMessage({
        tags: [ blockRef, 'detach', 'skip' ],
        text: 'detach() - outlet is not available. skip!'
      }));
    }
  }

  self.start = function() {
    return new Promise(function(onResolved, onRejected) {
      LX.has('silly') && LX.log('silly', LT.add({
        protocol: appProto,
        host: appHost,
        port: appPort
      }).toMessage({
        tags: [ blockRef, 'webserver', 'starting' ],
        text: 'webserver is starting'
      }));
      let serverInstance = server.listen(appPort, appHost, function () {
        let host = serverInstance.address().address;
        let port = serverInstance.address().port;
        chores.isVerboseForced('webserver', pluginCfg) &&
            console.log('webserver is listening on %s://%s:%s', appProto, host, port);
        LX.has('silly') && LX.log('silly', LT.toMessage({
          tags: [ blockRef, 'webserver', 'started' ],
          text: 'webserver has started'
        }));
        onResolved(serverInstance);
      });
    });
  };

  self.stop = function() {
    return new Promise(function(onResolved, onRejected) {
      LX.has('silly') && LX.log('silly', LT.add({
        protocol: appProto,
        host: appHost,
        port: appPort
      }).toMessage({
        tags: [ blockRef, 'webserver', 'stopping' ],
        text: 'webserver is stopping'
      }));
      server.close(function (err) {
        chores.isVerboseForced('webserver', pluginCfg) &&
            console.log('webserver has been closed');
        LX.has('silly') && LX.log('silly', LT.toMessage({
          tags: [ blockRef, 'webserver', 'stopped' ],
          text: 'webserver has stopped'
        }));
        onResolved();
      });
    });
  };

  self.getServiceInfo = function() {
    return {
      webserver_host: configHost,
      webserver_port: configPort
    };
  };

  self.getServiceHelp = function() {
    let info = self.getServiceInfo();
    return {
      type: 'record',
      title: 'Webserver plugin trigger',
      label: {
        webserver_host: 'Host',
        webserver_port: 'Port'
      },
      data: {
        webserver_host: info.webserver_host,
        webserver_port: info.webserver_port
      }
    };
  };

  LX.has('silly') && LX.log('silly', LT.toMessage({
    tags: [ blockRef, 'constructor-end' ],
    text: ' - constructor has finished'
  }));
};

module.exports = WebserverTrigger;

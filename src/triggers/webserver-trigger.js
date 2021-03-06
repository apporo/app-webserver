'use strict';

const Devebot = require('devebot');
const chores = Devebot.require('chores');
const lodash = Devebot.require('lodash');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const SERVER_HOSTS = ['0.0.0.0', '127.0.0.1', 'localhost'];

function WebserverTrigger(params = {}) {
  const { packageName, sandboxConfig, loggingFactory } = params;
  const L = loggingFactory.getLogger();
  const T = loggingFactory.getTracer();
  const blockRef = chores.getBlockRef(__filename, packageName);

  let { port, host } = extractConfigAddress(sandboxConfig);

  this.getPort = function () {
    return port;
  }

  this.getHost = function () {
    return host;
  }

  const isLocalhost = SERVER_HOSTS.indexOf(host) >= 0;
  const ssl = loadSSLConfig({ L, T, blockRef }, sandboxConfig, isLocalhost);

  Object.defineProperty(this, 'ssl', {
    get: function() { return lodash.assign({}, ssl) },
    set: function(value) {}
  });

  const protocol = ssl.available ? 'https' : 'http';

  const server = ssl.available ? https.createServer({
    ca: ssl.ca,
    cert: ssl.cert,
    key: ssl.key,
    requestCert: true,
    rejectUnauthorized: false
  }) : http.createServer();

  // @Deprecated
  Object.defineProperty(this, 'server', {
    get: function() { return server },
    set: function(value) {}
  });

  this.attach = this.register = function(outlet) {
    L.has('silly') && L.log('silly', T.toMessage({
      tags: [ blockRef, 'attach', 'begin' ],
      text: 'attach() - try to register a outlet'
    }));
    if (server.listeners('request').indexOf(outlet) >= 0) {
      L.has('silly') && L.log('silly', T.toMessage({
        tags: [ blockRef, 'attach', 'skip' ],
        text: 'attach() - outlet has already attached. skip!'
      }));
    } else {
      server.addListener('request', outlet);
      L.has('silly') && L.log('silly', T.toMessage({
        tags: [ blockRef, 'attach', 'done' ],
        text: 'attach() - attach the outlet'
      }));
    }
  }

  this.detach = this.unregister = function(outlet) {
    L.has('silly') && L.log('silly', T.toMessage({
      tags: [ blockRef, 'detach', 'begin' ],
      text: 'detach() - try to unregister a outlet'
    }));
    if (server.listeners('request').indexOf(outlet) >= 0) {
      server.removeListener('request', outlet);
      L.has('silly') && L.log('silly', T.toMessage({
        tags: [ blockRef, 'detach', 'done' ],
        text: 'detach() - detach the outlet'
      }));
    } else {
      L.has('silly') && L.log('silly', T.toMessage({
        tags: [ blockRef, 'detach', 'skip' ],
        text: 'detach() - outlet is not available. skip!'
      }));
    }
  }

  this.start = function() {
    if (sandboxConfig.enabled === false) return Promise.resolve();
    return new Promise(function(onResolved, onRejected) {
      L.has('silly') && L.log('silly', T.add({ protocol, host, port }).toMessage({
        tags: [ blockRef, 'webserver', 'starting' ],
        text: 'webserver is starting'
      }));
      const serverInstance = server.listen.apply(server, buildListenArgs(port, host, function () {
        port = serverInstance.address().port;
        host = serverInstance.address().address;
        chores.isVerboseForced('webserver', sandboxConfig) &&
            console.log('webserver is listening on %s://%s:%s', protocol, host, port);
        L.has('silly') && L.log('silly', T.toMessage({
          tags: [ blockRef, 'webserver', 'started' ],
          text: 'webserver has started'
        }));
        onResolved(serverInstance);
      }));
    });
  };

  this.stop = function() {
    if (sandboxConfig.enabled === false) return Promise.resolve();
    return new Promise(function(onResolved, onRejected) {
      L.has('silly') && L.log('silly', T.add({ protocol, host, port }).toMessage({
        tags: [ blockRef, 'webserver', 'stopping' ],
        text: 'webserver is stopping'
      }));
      server.close(function (err) {
        chores.isVerboseForced('webserver', sandboxConfig) &&
            console.log('webserver has been closed');
        // https://nodejs.org/api/net.html#net_server_close_callback
        if (err) {
          L.has('error') && L.log('error', T.toMessage({
            tags: [ blockRef, 'webserver', 'stopped' ],
            text: 'the webserver was not open when it was closed'
          }));
          onRejected(err);
        } else {
          L.has('silly') && L.log('silly', T.toMessage({
            tags: [ blockRef, 'webserver', 'stopped' ],
            text: 'the webserver has stopped successfully'
          }));
          onResolved();
        }
      });
    });
  };

  this.getServiceInfo = function() {
    return {
      webserver_host: host,
      webserver_port: port
    };
  };

  this.getServiceHelp = function() {
    let info = this.getServiceInfo();
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
};

module.exports = WebserverTrigger;

function extractConfigAddress (sandboxConfig) {
  let port = 7979;
  if ('port' in sandboxConfig) {
    port = sandboxConfig.port;
  }
  let host = '0.0.0.0';
  if ('host' in sandboxConfig) {
    host = sandboxConfig.host;
  }
  return { port, host }
}

function buildListenArgs (port, host, callback) {
  const listenParams = [];
  if (!lodash.isNil(port)) {
    listenParams.push(port);
  }
  if (!lodash.isNil(host)) {
    listenParams.push(host);
  }
  listenParams.push(callback);
  return listenParams;
}

function loadSSLConfig (ctx = {}, serverCfg = {}, isLocalhost) {
  const { L, T, blockRef } = ctx;
  const ssl = { available: false };
  if (serverCfg.ssl && serverCfg.ssl.enabled) {
    L.has('silly') && L.log('silly', T.add({
      sslConfig: serverCfg.ssl
    }).toMessage({
      tags: [ blockRef, 'ssl', 'enabled' ],
      text: 'SSL is enabled'
    }));

    ssl.ca = serverCfg.ssl.ca;
    try {
      ssl.ca = ssl.ca || fs.readFileSync(serverCfg.ssl.ca_file);
    } catch (error) {
      L.has('silly') && L.log('silly', T.add({
        ca: ssl.ca,
        ca_file: serverCfg.ssl.ca_file,
        error: error
      }).toMessage({
        tags: [ blockRef, 'ssl', 'ca-loading' ],
        text: 'error on loading CA files[${ca_file}]: ${error}'
      }));
    }

    ssl.key = serverCfg.ssl.key;
    ssl.cert = serverCfg.ssl.cert;
    try {
      ssl.key = ssl.key || fs.readFileSync(serverCfg.ssl.key_file);
      ssl.cert = ssl.cert || fs.readFileSync(serverCfg.ssl.cert_file);
    } catch (error) {
      L.has('silly') && L.log('silly', T.add({
        key: ssl.key,
        key_file: serverCfg.ssl.key_file,
        cert: ssl.cert,
        cert_file: serverCfg.ssl.cert_file,
        error: error
      }).toMessage({
        tags: [ blockRef, 'ssl', 'key-cert-loading' ],
        text: 'error on loading key/cert files: ${error}'
      }));
    }

    if (!ssl.key && !ssl.cert && isLocalhost) {
      L.has('silly') && L.log('silly', T.toMessage({
        tags: [ blockRef, 'ssl', 'key-cert-use-default' ],
        text: 'Using default key/cert for localhost'
      }));
      ssl.key = fs.readFileSync(path.join(__dirname, '../../data/ssl/localhost.key.pem'));
      ssl.cert = fs.readFileSync(path.join(__dirname, '../../data/ssl/localhost.cert.pem'));
    }

    if (ssl.key && ssl.cert) {
      ssl.available = true;
      L.has('silly') && L.log('silly', T.add({ ssl }).toMessage({
        tags: [ blockRef, 'ssl', 'available' ],
        text: 'HTTPs is available'
      }));
    }
  } else {
    L.has('silly') && L.log('silly', T.toMessage({
      tags: [ blockRef, 'ssl', 'disabled' ],
      text: 'SSL is disabled'
    }));
  }

  return ssl;
}
'use strict';

var Devebot = require('devebot');
var lodash = Devebot.require('lodash');
var debugx = Devebot.require('debug')('appWebserver:trigger');
var fs = require('fs');
var http = require('http');
var https = require('https');

var SERVER_HOSTS = ['0.0.0.0', '127.0.0.1', 'localhost'];

var Service = function(params) {
  debugx.enabled && debugx(' + constructor begin ...');

  params = params || {};
  var self = this;

  var logger = params.loggingFactory.getLogger();
  var pluginCfg = params.sandboxConfig;

  var appHost = pluginCfg && pluginCfg.host || '0.0.0.0';
  var appPort = pluginCfg && pluginCfg.port || 7979;
  var appProto = 'http';

  var ssl = { available: false };
  Object.defineProperty(self, 'ssl', {
    get: function() { return lodash.assign({}, ssl) },
    set: function(value) {}
  });

  if (pluginCfg.ssl && pluginCfg.ssl.enabled) {
    pluginCfg.ssl = pluginCfg.ssl || {};

    ssl.ca = pluginCfg.ssl.ca;
    try {
      ssl.ca = ssl.ca || fs.readFileSync(pluginCfg.ssl.ca_file);
    } catch(error) {
      debugx.enabled && debugx('error on loading CA files: %s', JSON.stringify(error));
    }

    ssl.key = pluginCfg.ssl.key;
    ssl.cert = pluginCfg.ssl.cert;
    try {
      ssl.key = ssl.key || fs.readFileSync(pluginCfg.ssl.key_file);
      ssl.cert = ssl.cert || fs.readFileSync(pluginCfg.ssl.cert_file);
    } catch(error) {
      debugx.enabled && debugx('error on loading key/cert files: %s', JSON.stringify(error));
    }

    if (!ssl.key && !ssl.cert && SERVER_HOSTS.indexOf(appHost)>=0) {
      ssl.key = fs.readFileSync(path.join(__dirname, '../../data/ssl/localhost.key.pem'));
      ssl.cert = fs.readFileSync(path.join(__dirname, '../../data/ssl/localhost.cert.pem'));
    }

    if (ssl.key && ssl.cert) {
      appProto = 'https';
      ssl.available = true;
    }
  }

  var server = ssl.available ? https.createServer({
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
    debugx.enabled && debugx('attach() - try to register a outlet');
    if (server.listeners('request').indexOf(outlet) >= 0) {
      debugx.enabled && debugx('attach() - outlet has already attached. skip');
    } else {
      debugx.enabled && debugx('attach() - attach the outlet');
      server.addListener('request', outlet);
    }
  }

  self.detach = self.unregister = function(outlet) {
    debugx.enabled && debugx('detach() - try to unregister a outlet');
    if (server.listeners('request').indexOf(outlet) >= 0) {
      debugx.enabled && debugx('detach() - detach the outlet');
      server.removeListener('request', outlet);
    } else {
      debugx.enabled && debugx('detach() - outlet is not available. skip');
    }
  }

  self.start = function() {
    debugx.enabled && debugx(' - initialize the middlewares ...');
    return new Promise(function(resolved, rejected) {
      var serverInstance = server.listen(appPort, appHost, function () {
        var host = serverInstance.address().address;
        var port = serverInstance.address().port;
        (pluginCfg && pluginCfg.verbose !== false || debugx.enabled) &&
        console.log('webserver is listening on %s://%s:%s', appProto, host, port);
        resolved(serverInstance);
      });
    });
  };

  self.stop = function() {
    return new Promise(function(resolved, rejected) {
      server.close(function (err) {
        (pluginCfg && pluginCfg.verbose !== false || debugx.enabled) &&
        console.log('webserver has been closed');
        resolved();
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
    var info = self.getServiceInfo();
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

  debugx.enabled && debugx(' - constructor end!');
};

Service.argumentSchema = {
  "id": "webserverTrigger",
  "type": "object",
  "properties": {}
};

module.exports = Service;

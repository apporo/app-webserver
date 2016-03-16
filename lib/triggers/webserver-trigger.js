'use strict';

var events = require('events');
var util = require('util');

var debuglog = require('devebot').debug('webserver');
var lodash = require('devebot').pkg.lodash;
var express = require('express');
var http = require('http');

var Service = function(params) {
  debuglog(' + constructor begin ...');
  
  Service.super_.call(this);

  params = params || {};
  
  var self = this;

  var loggingFactory = params.loggingFactory;
  self.logger = loggingFactory.getLogger();

  self.getSandboxName = function() {
    return params.sandboxname;
  };

  var apporo = express();
  
  if (debuglog.isEnabled) {
    apporo.use('*', function(req, res, next) {
      process.nextTick(function() {
        debuglog('=@ app-webserver receives a new request:');
        debuglog(' - Request protocol: ' + req.protocol);
        debuglog(' - Request host: ' + req.hostname);
        debuglog(' - Request url: ' + req.originalUrl);
        debuglog(' - Request body: ' + JSON.stringify(req.body));
        debuglog(' - Request user-agent: ' + req.headers['user-agent']);
      });
      next();
    });
  }
  
  var server = http.createServer(apporo);
  
  self.getApporo = function() {
    return apporo;
  };

  self.getExpress = function() {
    return express;
  };

  self.getServer = function() {
    return server;
  };

  self.start = function() {
    var configHost = lodash.get(params, 'profileconfig.webserver.host', '0.0.0.0');
    var configPort = lodash.get(params, 'profileconfig.webserver.port', 7979);
    var serverInstance = server.listen(configPort, configHost, function () {
      var host = serverInstance.address().address;
      var port = serverInstance.address().port;
      console.log('app-webserver listening at http://%s:%s', host, port);
    });
    return serverInstance;
  };

  self.stop = function() {
    server.close(function (err) {
      console.log('app-webserver has been closed');
    });
  };
  
  self.getServiceInfo = function() {
    return {};
  };
  
  debuglog(' - constructor end!');
};

Service.argumentSchema = {
  "id": "/webserverTrigger",
  "type": "object",
  "properties": {
    "sandboxname": {
      "type": "string"
    },
    "sandboxconfig": {
      "type": "object"
    },
    "profileconfig": {
      "type": "object"
    },
    "generalconfig": {
      "type": "object"
    },
    "loggingFactory": {
      "type": "object"
    }
  }
};

util.inherits(Service, events.EventEmitter);

module.exports = Service;

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

  self.logger = params.loggingFactory.getLogger();

  self.getSandboxName = function() {
    return params.sandboxname;
  };

  self.getExpress = function() {
    return express;
  };

  var apporo = express();
  
  self.getApporo = function() {
    return apporo;
  };

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
  
  self.getServer = function() {
    return server;
  };

  var routers = [];

  self.inject = function(middleware, path, priority) {
    priority = lodash.isNumber(priority) ? priority : 0;
    if (lodash.isObject(middleware)) {
      routers.push({
        path: path,
        middleware: middleware,
        priority: priority
      });
    }
  };

  var configHost = lodash.get(params, ['sandboxconfig', 'plugins', 'appWebserver', 'host'], '0.0.0.0');
  var configPort = lodash.get(params, ['sandboxconfig', 'plugins', 'appWebserver', 'port'], 7979);

  self.start = function() {
    var sortedRouters = lodash.sortBy(routers, function(router) {
      return router.priority;
    });

    lodash.forEach(sortedRouters, function(router) {
      if (router.path) {
        apporo.use(router.path, router.middleware);
      } else {
        apporo.use(router.middleware);
      }
    });

    var serverInstance = server.listen(configPort, configHost, function () {
      var host = serverInstance.address().address;
      var port = serverInstance.address().port;
      console.log('app-webserver is listening at http://%s:%s', host, port);
    });
    return serverInstance;
  };

  self.stop = function() {
    server.close(function (err) {
      console.log('app-webserver has been closed');
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
  
  debuglog(' - constructor end!');
};

Service.argumentSchema = {
  "id": "webserverTrigger",
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

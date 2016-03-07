'use strict';

var events = require('events');
var util = require('util');
var lodash = require('lodash');

var bodyParser = require('body-parser');
var express = require('express');
var http = require('http');
var session = require('express-session');

var Service = function(params) {
  Service.super_.call(this);

  params = params || {};
  
  var self = this;

  var loggingFactory = params.loggingFactory;
  self.logger = loggingFactory.getLogger();

  self.getSandboxName = function() {
    return params.sandboxname;
  };

  var app = express();
  app.use(session({ 
    secret: 's3cr3tk3yf0rw3bs3rv3r',
    saveUninitialized: true,
    resave: true
  }));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  var server = require('http').createServer(app);

  self.getApp = function() {
    return app;
  };

  self.getServer = function() {
    return server;
  };

  self.start = function() {
    var serverPort = lodash.get(params, 'profile.default.devebot.port', 7979);
    var serverInstance = server.listen(serverPort, function () {
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
    return {
    };
  };
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
    "loggingFactory": {
      "type": "object"
    }
  }
};

util.inherits(Service, events.EventEmitter);

module.exports = Service;

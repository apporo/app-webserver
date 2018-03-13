'use strict';

var Devebot = require('devebot');
var chores = Devebot.require('chores');
var debugx = Devebot.require('pinbug')('appWebserver:example');
var express = require('express');

var Service = function(params) {
  debugx.isEnabled && debugx(' + constructor begin ...');

  params = params || {};
  var self = this;

  var LX = params.loggingFactory.getLogger();
  var LT = params.loggingFactory.getTracer();

  var pluginCfg = params.sandboxConfig;
  debugx.isEnabled && debugx('configuration: %s', JSON.stringify(pluginCfg));

  if (pluginCfg.enabled !== false) {
    var app = express();

    app.use('*', function(req, res, next) {
      process.nextTick(function() {
        debugx('=@ example receives a new request:');
        debugx(' - Invoker IP: %s / %s', req.ip, JSON.stringify(req.ips));
        debugx(' - protocol: ' + req.protocol);
        debugx(' - host: ' + req.hostname);
        debugx(' - path: ' + req.path);
        debugx(' - URL: ' + req.url);
        debugx(' - originalUrl: ' + req.originalUrl);
        debugx(' - body: ' + JSON.stringify(req.body));
        debugx(' - user-agent: ' + req.headers['user-agent']);
      });
      next();
    });

    app.get('/example/:id', function(req, res) {
      res.status(200).json({
        message: 'example [' + req.params.id + '] request successfully'
      });
    });

    params.webserverTrigger.server.on('request', app);
  }

  debugx.isEnabled && debugx(' - constructor end!');
};

Service.referenceList = [ 'webserverTrigger' ];

module.exports = Service;

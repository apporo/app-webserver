'use strict';

var events = require('events');
var util = require('util');

var Devebot = require('devebot');
var lodash = Devebot.require('lodash');
var loader = Devebot.require('loader');
var debuglog = Devebot.require('pinbug')('appWebserver:example');
var express = require('express');

var Service = function(params) {
  debuglog.isEnabled && debuglog(' + constructor begin ...');

  params = params || {};

  var self = this;

  var LX = params.loggingFactory.getLogger();
  var LT = params.loggingFactory.getTracer();

  var pluginCfg = params.sandboxConfig;
  debuglog.isEnabled && debuglog('configuration: %s', JSON.stringify(pluginCfg));

  if (pluginCfg.enabled !== false) {
    var app = express();

    app.use('*', function(req, res, next) {
      process.nextTick(function() {
        debuglog('=@ example receives a new request:');
        debuglog(' - Invoker IP: %s / %s', req.ip, JSON.stringify(req.ips));
        debuglog(' - protocol: ' + req.protocol);
        debuglog(' - host: ' + req.hostname);
        debuglog(' - path: ' + req.path);
        debuglog(' - URL: ' + req.url);
        debuglog(' - originalUrl: ' + req.originalUrl);
        debuglog(' - body: ' + JSON.stringify(req.body));
        debuglog(' - user-agent: ' + req.headers['user-agent']);
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

  debuglog.isEnabled && debuglog(' - constructor end!');
};

Service.referenceList = [ 'webserverTrigger' ];

module.exports = Service;

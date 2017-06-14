'use strict';

var events = require('events');
var util = require('util');

var Devebot = require('devebot');
var lodash = Devebot.require('lodash');
var loader = Devebot.require('loader');
var debug = Devebot.require('debug');
var debuglog = debug('appWebserver:example1');
var express = require('express');

var Service = function(params) {
  debuglog.isEnabled && debuglog(' + constructor begin ...');

  params = params || {};

  var self = this;

  var logger = self.logger = params.loggingFactory.getLogger();

  var pluginCfg = lodash.get(params, ['sandboxConfig', 'plugins', 'appWebserver'], {});
  debuglog.isEnabled && debuglog('configuration: %s', JSON.stringify(pluginCfg));

  if (pluginCfg.enabled !== false) {
    var app = express();

    app.use('*', function(req, res, next) {
      next();
    });

    var router = express.Router();

    var trigger = params.webserverTrigger;
    trigger && trigger.getServer().on('request', app);
  }

  debuglog.isEnabled && debuglog(' - constructor end!');
};

Service.argumentSchema = {
  "id": "example1Service",
  "type": "object",
  "properties": {
    "sandboxName": {
      "type": "string"
    },
    "sandboxConfig": {
      "type": "object"
    },
    "profileConfig": {
      "type": "object"
    },
    "generalConfig": {
      "type": "object"
    },
    "loggingFactory": {
      "type": "object"
    },
    "webserverTrigger": {
      "type": "object"
    }
  }
};

module.exports = Service;

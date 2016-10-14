'use strict';

var Devebot = require('devebot');
var Promise = Devebot.require('bluebird');
var lodash = Devebot.require('lodash');
var assert = require('chai').assert;
var superagent = require('superagent');

var debug = Devebot.require('debug');
var debuglog = debug('appRestfaker:test:bdd:steps:common');

module.exports = function() {
  this.World = require('../support/world.js').World;
};

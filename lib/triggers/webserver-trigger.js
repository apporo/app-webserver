'use strict';

var events = require('events');
var util = require('util');
var fs = require('fs');
var Devebot = require('devebot');
var lodash = Devebot.require('lodash');
var debug = Devebot.require('debug');
var debuglog = debug('appWebserver');

var express = require('express');
var session = require('express-session');
var fileStore = require('session-file-store')(session);
var mongoStore = require('connect-mongo')(session);
var redisStore = require('connect-redis')(session);
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var http = require('http');
var https = require('https');

var Service = function(params) {
  debuglog.isEnabled && debuglog(' + constructor begin ...');

  params = params || {};

  var self = this;

  self.logger = params.loggingFactory.getLogger();

  self.getSandboxName = function() {
    return params.sandboxName;
  };

  var webserverConfig = lodash.get(params, ['sandboxConfig', 'plugins', 'appWebserver'], {});
  var sslEnabled = webserverConfig.ssl && webserverConfig.ssl.enabled &&
      webserverConfig.ssl.ca_file &&
      webserverConfig.ssl.cert_file &&
      webserverConfig.ssl.key_file;
  var sslUrls = (webserverConfig.ssl && webserverConfig.ssl.urls) || ['*'];

  self.getExpress = function() {
    return express;
  };

  var apporo = express();

  self.getApporo = function() {
    return apporo;
  };

  if (sslEnabled) {
    apporo.use(sslUrls, function(req, res, next) {
      if (req.client.authorized) {
        next();
        debuglog.isEnabled && debuglog(" - Passed Client: %s", req.originalUrl);
      } else {
        res.json({"status":"Access denied"}, 401);
        debuglog.isEnabled && debuglog(" - Denied client: %s", req.originalUrl);
      }
    });
  }

  if (debuglog.isEnabled && webserverConfig.printRequestInfo) {
    apporo.use('*', function(req, res, next) {
      process.nextTick(function() {
        debuglog('=@ app-webserver receives a new request:');
        debuglog(' - Request URL: ' + req.url);
        debuglog(' - Request protocol: ' + req.protocol);
        debuglog(' - Request host: ' + req.hostname);
        debuglog(' - Request path: ' + req.path);
        debuglog(' - Request originalUrl: ' + req.originalUrl);
        debuglog(' - Request body: ' + JSON.stringify(req.body));
        debuglog(' - Request user-agent: ' + req.headers['user-agent']);
      });
      next();
    });
  }

  var cacheControlConfig = lodash.get(webserverConfig, ['cacheControl'], {});
  if (cacheControlConfig.enabled) {
    apporo.use(function(req, res, next) {
      if (cacheControlConfig.pattern && cacheControlConfig.pattern.url &&
          req.url.match(cacheControlConfig.pattern.url)) {
        res.setHeader('Cache-Control', 'public, max-age=' + cacheControlConfig.maxAge);
      }
      next();
    });
  }

  var server = sslEnabled ? https.createServer({
    ca: fs.readFileSync(webserverConfig.ssl.ca_file),
    cert: fs.readFileSync(webserverConfig.ssl.cert_file),
    key: fs.readFileSync(webserverConfig.ssl.key_file),
    requestCert: true,
    rejectUnauthorized: false
  }, apporo) : http.createServer(apporo);

  self.getServer = function() {
    return server;
  };

  var sessionOpts = {
    resave: true,
    saveUninitialized: true
  };
  sessionOpts.name = lodash.get(webserverConfig, 'session.name', 'sessionId');
  sessionOpts.secret = lodash.get(webserverConfig, 'session.secret', 's3cur3');

  var sessionStoreDef = lodash.get(webserverConfig, ['session', 'store'], {});
  debuglog.isEnabled && debuglog(' - session store: %s', JSON.stringify(sessionStoreDef));

  switch(sessionStoreDef.type) {
    case 'file':
      sessionOpts.store = new fileStore({
        path: sessionStoreDef.path
      });
      debuglog.isEnabled && debuglog(' - session.store ~ fileStore');
      break;
    case 'redis':
      sessionOpts.store = new redisStore({
        url: sessionStoreDef.url
      });
      debuglog.isEnabled && debuglog(' - session.store ~ redisStore');
      break;
    case 'mongodb':
      sessionOpts.store = new mongoStore({
        url: sessionStoreDef.url
      });
      debuglog.isEnabled && debuglog(' - session.store ~ mongoStore');
      break;
    default:
      debuglog.isEnabled && debuglog(' - session.store ~ MemoryStore (default)');
  }

  var sessionInstance = session(sessionOpts);

  self.getSession = function() {
    return sessionInstance;
  };

  var cookieParserInstance = cookieParser(sessionOpts.secret);

  self.getCookieParser = function() {
    return cookieParserInstance;
  };

  var positionInstance = new (function() {
    var inRangeOf = function(minVal, maxVal, priority) {
      this.counter = this.counter || 0;
      priority = lodash.isNumber(priority) ? priority : ++this.counter;
      if (minVal && lodash.isNumber(minVal)) {
        priority = minVal + priority;
        priority = (priority < minVal) ? minVal : priority;
      }
      if (maxVal && lodash.isNumber(maxVal) && minVal <= maxVal) {
        priority = (maxVal < priority) ? maxVal : priority;
      }
      return priority;
    };

    this.POSITION_COMPRESSION = -10000;
    this.POSITION_COOKIE_PARSER = -150;
    this.POSITION_SESSION = -120;
    this.POSITION_TOKENIFY = -117;
    this.POSITION_TRACELOG_LISTENER = -115;
    this.POSITION_TRACELOG_BOUNDARY = -114;
    this.POSITION_PROXIFY = -113;
    this.POSITION_BODY_PARSER = -100;
    this.POSITION_METHOD_OVERRIDE = -98;
    this.POSITION_CSRF = -97;
    this.POSITION_HELMET = -96;

    this.POSITION_UNRESTRICTED_BEGIN = -50;
    this.POSITION_UNRESTRICTED_END = -10;

    this.POSITION_AUTHENTICATION = -1;

    this.POSITION_BEGIN_MIDDLEWARE = 0;
    this.POSITION_END_MIDDLEWARE = 10000;

    this.contextForStaticFiles = { counter: 0 };
    this.inRangeOfStaticFiles = inRangeOf.bind(this.contextForStaticFiles,
        this.POSITION_COMPRESSION + 1,
        this.POSITION_COOKIE_PARSER - 1);

    this.contextForUnrestricted = { counter: 0 };
    this.inRangeOfUnrestricted = inRangeOf.bind(this.contextForUnrestricted,
        this.POSITION_UNRESTRICTED_BEGIN,
        this.POSITION_UNRESTRICTED_END);

    this.contextForMiddlewares = { counter: 0 };
    this.inRangeOfMiddlewares = inRangeOf.bind(this.contextForMiddlewares,
        this.POSITION_BEGIN_MIDDLEWARE,
        this.POSITION_END_MIDDLEWARE);

    this.contextAfterMiddlewares = { counter: 0 };
    this.afterMiddlewares = inRangeOf.bind(this.contextAfterMiddlewares,
        this.POSITION_END_MIDDLEWARE + 1);
  })();

  self.getPosition = function() {
    return positionInstance;
  }

  var routers = [];

  routers.push({
    name: 'cookie-parser',
    middleware: cookieParserInstance,
    priority: positionInstance.POSITION_COOKIE_PARSER
  }, {
    name: 'session',
    middleware: sessionInstance,
    priority: positionInstance.POSITION_SESSION
  }, {
    name: 'body-parser-json',
    middleware: bodyParser.json({ limit: webserverConfig.jsonBodySizeLimit || '2mb' }),
    priority: positionInstance.POSITION_BODY_PARSER
  }, {
    name: 'body-parser-urlencoded',
    middleware: bodyParser.urlencoded({ extended: true }),
    priority: positionInstance.POSITION_BODY_PARSER
  });

  if (process.env.NODE_ENV == 'production') {
    routers.push({
      name: 'compression',
      middleware: require('compression')(),
      priority: positionInstance.POSITION_COMPRESSION
    }, {
      name: 'method-override',
      middleware: require('method-override')(),
      priority: positionInstance.POSITION_METHOD_OVERRIDE
    }, {
      name: 'csurf',
      middleware: require('csurf')({ cookie: { signed: true } }),
      priority: positionInstance.POSITION_CSRF
    }, {
      name: 'helmet',
      middleware: require('helmet')(),
      priority: positionInstance.POSITION_HELMET
    });
  }

  if (webserverConfig.setPoweredBy) {
    routers.push({
      name: 'setPoweredBy',
      middleware: function setPoweredBy(req, res, next) {
        res.setHeader('X-Powered-By', webserverConfig.setPoweredBy);
        next();
      },
      priority: positionInstance.inRangeOfMiddlewares()
    });
  } else {
    routers.push({
      name: 'hidePoweredBy',
      middleware: function hidePoweredBy(req, res, next) {
        res.removeHeader('X-Powered-By');
        next();
      },
      priority: positionInstance.inRangeOfMiddlewares()
    });
  }

  if (webserverConfig.defaultRedirectUrl) {
    routers.push({
      name: 'defaultRedirect',
      path: ['/$'],
      middleware: function hidePoweredBy(req, res, next) {
        res.redirect(webserverConfig.defaultRedirectUrl);
      },
      priority: positionInstance.afterMiddlewares()
    });
  }

  self.inject = function(middleware, path, priority, name) {
    if (lodash.isObject(middleware)) {
      priority = lodash.isNumber(priority) ? priority : 0;

      if (lodash.isFunction(middleware)) {
        middleware = {
          name: name,
          path: path,
          middleware: middleware,
          priority: priority
        };
      }

      routers.push(middleware);
    }
  };

  var configHost = lodash.get(webserverConfig, 'host', '0.0.0.0');
  var configPort = lodash.get(webserverConfig, 'port', 7979);

  self.start = function() {
    debuglog.isEnabled && debuglog(' - initialize the middlewares ...');
    var sortedRouters = lodash.sortBy(routers, function(router) {
      return router.priority;
    });

    if (debuglog.isEnabled) {
      lodash.forEach(sortedRouters, function(router) {
        debuglog.isEnabled && debuglog(' -> middleware [%s] is loaded at [%s], in priority: %s',
          router.name,
          router.path || '/',
          router.priority);
      });
    }

    lodash.forEach(sortedRouters, function(router) {
      if (router.path) {
        if (!(lodash.isArray(router.path) && lodash.isEmpty(router.path))) {
          apporo.use(router.path, router.middleware);
        }
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

  var builtinPackages = ['express', 'express-session'];

  self.require = function(packageName) {
    if (builtinPackages.indexOf(packageName) >= 0) return require(packageName);
    return null;
  };

  debuglog.isEnabled && debuglog(' - constructor end!');
};

Service.argumentSchema = {
  "id": "webserverTrigger",
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
    }
  }
};

module.exports = Service;

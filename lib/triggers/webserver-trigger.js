'use strict';

var Devebot = require('devebot');
var lodash = Devebot.require('lodash');
var debugx = Devebot.require('debug')('appWebserver:trigger');
var fs = require('fs');
var http = require('http');
var https = require('https');

// Deprecated
var express = require('express');
var session = require('express-session');
var fileStore = require('session-file-store')(session);
var mongoStore = require('connect-mongo')(session);
var redisStore = require('connect-redis')(session);
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');

var SERVER_HOSTS = ['0.0.0.0', '127.0.0.1', 'localhost'];

var Service = function(params) {
  debugx.enabled && debugx(' + constructor begin ...');

  params = params || {};
  var self = this;

  var logger = params.loggingFactory.getLogger();
  var pluginCfg = lodash.get(params, ['sandboxConfig', 'plugins', 'appWebserver'], {});

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

  // ============================= Deprecated =================================

  var oldFeatures = lodash.get(params, ['profileConfig', 'oldFeatures', 'appWebserver'], {});
  var legacyMode = oldFeatures.legacyMode === true;
  Object.defineProperty(self, 'legacyMode', {
    get: function() { return legacyMode },
    set: function(value) { legacyMode = value }
  });

  self.getServer = function() {
    return server;
  };

  self.getExpress = function() {
    return express;
  };

  var apporo = express();

  self.getApporo = function() {
    return apporo;
  };

  if (ssl.available) {
    var sslUrls = (pluginCfg.ssl && pluginCfg.ssl.urls) || ['*'];
    apporo.use(sslUrls, function(req, res, next) {
      if (req.client.authorized) {
        next();
        debugx.enabled && debugx(" - Passed Client: %s", req.originalUrl);
      } else {
        res.json({"status":"Access denied"}, 401);
        debugx.enabled && debugx(" - Denied client: %s", req.originalUrl);
      }
    });
  }

  if (debugx.enabled && pluginCfg.printRequestInfo) {
    apporo.use('*', function(req, res, next) {
      process.nextTick(function() {
        debugx('=@ app-webserver receives a new request:');
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
  }

  var cacheControlConfig = lodash.get(pluginCfg, ['cacheControl'], {});
  if (cacheControlConfig.enabled) {
    apporo.use(function(req, res, next) {
      if (cacheControlConfig.pattern && cacheControlConfig.pattern.url &&
          req.url.match(cacheControlConfig.pattern.url)) {
        res.setHeader('Cache-Control', 'public, max-age=' + cacheControlConfig.maxAge);
      }
      next();
    });
  }

  var sessionOpts = {
    resave: true,
    saveUninitialized: true
  };
  sessionOpts.name = lodash.get(pluginCfg, 'session.name', 'sessionId');
  sessionOpts.secret = lodash.get(pluginCfg, 'session.secret', 's3cur3');

  var sessionStoreDef = lodash.get(pluginCfg, ['session', 'store'], {});
  debugx.enabled && debugx(' - session store: %s', JSON.stringify(sessionStoreDef));

  switch(sessionStoreDef.type) {
    case 'file':
      sessionOpts.store = new fileStore({
        path: sessionStoreDef.path
      });
      debugx.enabled && debugx(' - session.store ~ fileStore');
      break;
    case 'redis':
      sessionOpts.store = new redisStore({
        url: sessionStoreDef.url
      });
      debugx.enabled && debugx(' - session.store ~ redisStore');
      break;
    case 'mongodb':
      sessionOpts.store = new mongoStore({
        url: sessionStoreDef.url
      });
      debugx.enabled && debugx(' - session.store ~ mongoStore');
      break;
    default:
      debugx.enabled && debugx(' - session.store ~ MemoryStore (default)');
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
    middleware: bodyParser.json({ limit: pluginCfg.jsonBodySizeLimit || '2mb' }),
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

  if (pluginCfg.setPoweredBy) {
    routers.push({
      name: 'setPoweredBy',
      middleware: function setPoweredBy(req, res, next) {
        res.setHeader('X-Powered-By', pluginCfg.setPoweredBy);
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

  if (pluginCfg.defaultRedirectUrl) {
    routers.push({
      name: 'defaultRedirect',
      path: ['/$'],
      middleware: function defaultRedirect(req, res, next) {
        res.redirect(pluginCfg.defaultRedirectUrl);
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

  var weaveMiddleware = function() {
    var sortedRouters = lodash.sortBy(routers, function(router) {
      return router.priority;
    });

    if (debugx.enabled) {
      lodash.forEach(sortedRouters, function(router) {
        debugx.enabled && debugx(' -> middleware [%s] is loaded at [%s], in priority: %s',
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

    server.on('request', apporo);
  }

  var builtinPackages = ['express', 'express-session', 'cookie-parser', 'body-parser', 'ejs'];

  self.require = function(packageName) {
    if (builtinPackages.indexOf(packageName) >= 0) return require(packageName);
    return null;
  };

  // ==========================================================================

  self.start = function() {
    debugx.enabled && debugx(' - initialize the middlewares ...');
    return new Promise(function(resolved, rejected) {
      if (legacyMode !== false) {
        console.log('webserver is running in legecyMode');
        weaveMiddleware();
      }
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

'use strict';

// Node
const nodePath = require('path');
// 3rd
const _ = require('lodash');
const debug = require('debug')('koa-wormhole:index');
const assert = require('better-assert');
const compose = require('koa-compose');
const pathToRegexp = require('path-to-regexp');
const allVerbs = require('methods');
_.isGenerator = require('is-generator-function');
// 1st
const Route = require('./route');

class Router {
  constructor(opts) {
    opts = opts || {};
    // an array of middleware (generators) and route instances
    this.stack = opts.stack || [];
    // an array of routes that just exists as a dumb way to see if
    // the router has a matching route given a request
    this.routes = opts.routes || [];
    this._prefix = opts.prefix || '/';
  }

  clone() {
    return new Router({
      stack: clone(this.stack),
      routes: clone(this.routes),
      prefix: this._prefix
    });
  }

  // mutates the router's current prefix.
  prefix(newPrefix) {
    const self = this;
    self._prefix = newPrefix;
    return self;
  }

  // clones the child router and merges their prefixed stack into ours
  // we don't want to mutate child, just respond to their routes+middleware.
  mount(child) {
    assert(child instanceof Router);
    const adjustedChild = child.clone().mountTo(this._prefix);
    this.stack.push(adjustedChild.middleware());
    this.routes.push(...adjustedChild.routes);
    return this;
  }

  // mutates your stack to respond to a new, prepended prefix
  mountTo(prefix) {
    const self = this;
    const newPrefix = nodePath.join(prefix, self._prefix);
    self._prefix = newPrefix;

    self.routes = self.routes.map(r => r.mountTo(prefix));
    self.stack = self.stack.map(x => {
      return x instanceof Route ? x.mountTo(prefix) : x
    });

    return this;
  }

  use() {
    const mws = Array.prototype.slice.call(arguments);
    const self = this;
    mws.forEach(x => {
      if (x.router) {
        self.mount(x.router);
      } else {
        self.stack.push(x);
      }
    });
    return this;
  }

  middleware() {
    const self = this;
    const composed = compose(this.stack.map(x => {
      return x instanceof Route ? x.middleware() : x;
    }));

    const wrapware = function*(next) {
      const ctx = this;
      const route = _.find(self.routes, route => route.matches(ctx));
      if (route) {
        ctx.params = route.parseParams(ctx);
        yield* composed.call(ctx, next);
      } else {
        yield* next;
      }
    }

    wrapware.router = self;
    return wrapware;
  }

  param(key, mw) {
    this.use(function*(next) {
      if (_.isUndefined(this.params[key]))
        yield* next;
      else
        yield* mw.call(this, this.params[key], next);
    });
    return this;
  }

  register(path, verbs, mws) {
    assert(_.isString(path));
    assert(_.isArray(verbs));
    assert(_.isArray(mws));

    const route = new Route(this._prefix, path, verbs, mws);
    this.stack.push(route);
    this.routes.push(route);
    return this;
  }
}

// create convenience method for each http verb
allVerbs.forEach(verb => {
  Router.prototype[verb] = makeVerbHandler([verb]);
});

// creates a route that responds to all verbs
Router.prototype.all = makeVerbHandler(require('methods'));

// alias del->delete since delete is a reserved word
Router.prototype.del = Router.prototype['delete'];

////////////////////////////////////////////////////////////

module.exports = Router;

////////////////////////////////////////////////////////////

// Helpers

function makeVerbHandler(verbsHandled) {
  assert(_.isArray(verbsHandled));
  return function(path /*, ...mws */) {
    let mws;
    if (_.isString(path)) {
      mws = Array.prototype.slice.call(arguments, 1);
    } else {
      mws = Array.prototype.slice.call(arguments);
      path = '/';
    }

    this.register(path, verbsHandled, _.flatten(mws));
    return this;
  };
}

function clone(x) {
  if (x.clone)
    return x.clone();
  if (_.isArray(x)) {
    return x.map(clone);
  }
  return x;
}

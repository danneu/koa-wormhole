'use strict';

// 3rd
const compose = require('koa-compose');
const assert = require('better-assert');
const methods = require('methods'); // note: these methods are all lowercase
const pathToRegexp = require('path-to-regexp');
const _ = require('lodash');

function Router() {
  // allow Router() to be instantiated without the `new` keyword
  // seems to be common in koa ecosystem
  if (!(this instanceof Router)) {
    return new Router();
  }

  // the full stack of middleware in this router to be composed at
  // .middleware() time into a single middleware function
  this.stack = [];
  // this.routes simply maintains the state necessary to know if a given
  // request matches a route in the router's stack.
  // - if true, then compose(this.stack).call(ctx).
  // - if false, then we skip the router entirely.
  this.routes = [];
}

Router.prototype.middleware = function() {
  // this is the accumulation of all the .use() and .{verb}() methods
  // called on this router, composed into one big chain
  const middlewareChain = compose(this.stack);

  const self = this;

  // The final middleware generator function that the router returns
  // simply wraps the router's middleware chain with "only pipe the request
  // through this chain if the request matches one of its routes"
  const wrapware = function* wrapware(next) {
    const ctx = this;

    ctx.params = Object.create(null);

    const isMatch = self.routes.some(route => {
      if (!_.contains(route.methods, ctx.method.toLowerCase())) return false;
      const result = route.pathRe.exec(ctx.path);
      if (!result) return false;
      // FIXME: it's nasty having a side-effect in a filter function like this
      ctx.params = _.zipObject(_.pluck(route.pathRe.keys, 'name'), result.slice(1));
      return true;
    });

    // if the request doesn't match a router's route, we skip
    // the router entirely.
    if (isMatch) {
      yield* middlewareChain.call(ctx, next);
    } else {
      yield* next;
    }
  };

  // to get router nesting to work with unified `r1.use(r2.middleware())`
  // syntax, we need to expose enough info to r1.use() so that it can
  // merge (and thus match) r2's routes into its own this.routes array
  wrapware.router = this;

  return wrapware;
};

Router.prototype.use = function() {
  const mws = Array.prototype.slice.call(arguments);
  const self = this;

  // merge routes from nested routers so that parent router can match on them
  mws.forEach(mw => {
    if (mw.router) {
      self.routes.push(...mw.router.routes);
    }
  });

  this.stack.push(...mws);

  return this;
};

Router.prototype.register = function(path, verbs, mws) {
  assert(_.isString(path));
  assert(_.isArray(verbs));
  assert(_.isArray(mws));

  const pathRe = pathToRegexp(path);

  // a route is just middleware that only gets called when it matches
  // ctx.method and ctx.path, so here we wrap the handler in that logic
  // to be composed with the rest of this.stack.
  const wrappedMws = mws.map(mw => {
    return function*(next) {
      const ctx = this;
      if (_.contains(verbs, ctx.method.toLowerCase()) && pathRe.exec(ctx.path)) {
        yield* mw.call(ctx, next);
      } else {
        yield* next;
      }
    };
  });

  this.stack.push(...wrappedMws);

  this.routes.push({
    methods: verbs,
    path: path, // String
    pathRe: pathRe
  });

  return this;
};

methods.forEach(method => {
  Router.prototype[method] = function(path /*, ...mws */) {
    const mws = Array.prototype.slice.call(arguments, 1);
    assert(_.isArray(mws));
    this.register(path, [method], mws);
    return this;
  };
});

// alias router#del -> router#delete since delete is reserved word
Router.prototype.del = Router.prototype['delete'];

Router.prototype.all = function(path /*, ...mws */) {
  const mws = Array.prototype.slice.call(arguments, 1);
  this.register(path, require('methods'), mws);
  return this;
};

module.exports = Router;

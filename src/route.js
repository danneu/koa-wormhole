'use strict';

// Node
const nodePath = require('path');
// 3rd
const _ = require('lodash');
const debug = require('debug')('koa-wormhole:route');
const assert = require('better-assert');
const compose = require('koa-compose');
const pathToRegexp = require('path-to-regexp');
const allVerbs = require('methods');
_.isGenerator = require('is-generator-function');

class Route {
  constructor(prefix, path, verbs, mws) {
    assert(_.isString(path));
    assert(_.isArray(verbs));
    assert(_.isArray(mws));

    this.path = path;
    this.verbs = verbs.map(s => s.toLowerCase());
    this.mws = mws;
    this.prefix = prefix;

    this.compile();
  }

  clone() {
    return new Route(this.prefix, this.path, this.verbs, this.mws);
  }

  mountTo(prefix) {
    this.prefix = nodePath.join(prefix, this.prefix);
    this.compile();
    return this;
  }

  compile() {
    const fullPath = nodePath.join(this.prefix, this.path);
    this.regexp = pathToRegexp(fullPath);
    return this;
  }

  parseParams(ctx) {
    const result = this.regexp.exec(ctx.path);
    return _.zipObject(_.pluck(this.regexp.keys, 'name'), result.slice(1));
  }

  // KoaContext => Bool
  matches(ctx) {
    if (!_.contains(this.verbs, ctx.method.toLowerCase()))
      return false;

    const result = this.regexp.exec(ctx.path);
    if (!result)
      return false;

    return true;
  }

  middleware() {
    const self = this;
    return function*(next) {
      const ctx = this;
      if (self.matches(ctx)) {
        yield* compose(self.mws).call(ctx, next);
      } else {
        yield* next;
      }
    };
  }
}

module.exports = Route;

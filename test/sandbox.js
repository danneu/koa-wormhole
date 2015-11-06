'use strict';
const Router = require('../src/index');
const koa = require('koa');
const request = require('supertest');
const assert = require('chai').assert;
const async = require('async');
const _ = require('lodash');

function makeApp() {
  const app = koa();
  app.use(function*(next) {
    try {
      yield* next
    } catch(err) {
      console.error(err.stack);
      throw err;
    }
  });
  app.use(function*(next) {
    this.arr = ['A'];
    yield* next;
    if (this.status === 404) {
      this.arr.push('Z');
      this.body = this.arr;
      this.status = 404;
    }
  });
  return app;
}

function makeRequest(server, verb, path, status, body, cb) {
  const args = Array.prototype.slice.call(arguments);
  if (args.length === 5) {
    cb = body;
    body = undefined;
  }

  assert.isString(verb);
  assert.isString(path);
  assert.isNumber(status);
  assert.isFunction(cb)

  verb = verb.toLowerCase();

  let test = request(server)[verb](path).expect(status);
  if (body) { test.expect(body); }

  return test.end(cb);
};

// spec: ['get', '/', 200]
//       ['get', '/', 200, { foo: 'bar' }
function its(server, specs) {
  let counter = 0;
  specs.forEach(spec => {
    counter = counter + 1;
    let desc = `test ${counter.toString()}: ${JSON.stringify(spec)}`;
    const verb = spec[0];
    const path = spec[1];
    const status = spec[2];
    const body = spec[3];

    const test = request(server)[verb](path).expect(status);
    if (body) test.expect(body);

    it(desc, done => {
      test.end(done);
    })
  });
}

function passthru(msg) {
  return function*(next) {
    this.arr.push(msg);
    yield* next;
  }
}
function terminal(msg) {
  return function*(next) {
    this.arr.push(msg);
    this.body = this.arr;
  }
}

describe('Router', () => {
  describe('AAA', () => {
    const app = makeApp();
    const r1 = new Router();
    r1.prefix('/foo');
    r1.get('/', terminal('r1:handler'));

    const r2 = new Router();
    r2.get('/bar', terminal('r2:handler'));
    r1.use(r2.middleware());

    app.use(r1.middleware());

    // should be able to re-mount r2 to a new prefix
    const api = new Router().prefix('/api');
    api.use(r2.middleware());
    app.use(api.middleware());

    app.use(r2.middleware());

    its.call(this, app.listen(), [
      ['get', '/', 404],
      ['get', '/foo', 200, ['A', 'r1:handler']],
      // test that mounting r2 to r1 uses r1's prefix
      ['get', '/foo/bar', 200, ['A', 'r2:handler']],
      // test r2 mounted to api
      ['get', '/api/bar', 200, ['A', 'r2:handler']],
      ['get', '/bar', 200],
    ]);
  })

  describe('#prefix chaining', () => {
    const app = makeApp();
    const r1 = new Router();
    r1
      .get('/a', terminal('a'))
      .prefix('/prefix1')
      .get('/b', terminal('b'))
      .prefix('/prefix2')
      .get('/c', terminal('c'))
      .prefix('/users/:id')
      .get('/', function*() {
        this.body = this.params;
      })
      ;
    app.use(r1.middleware());
    its.call(this, app.listen(), [
      ['get', '/a', 200, ['A', 'a']],
      ['get', '/b', 404],
      ['get', '/prefix1/b', 200, ['A', 'b']],
      ['get', '/prefix2/c', 200, ['A', 'c']],
      ['get', '/c', 404],
      ['get', '/users/42', 200, { id: 42 }]
    ]);
  })

  describe('#prefix and middleware', () => {
    const app = makeApp();
    //const r1 = new Router({ prefix: '/prefix '});
    const r1 = new Router();
    r1
      .use(passthru('mw0'))
      .prefix('/prefix')
      .use(passthru('mw1'))
      .get('/', terminal('ok'))
      .use(passthru('mw2'))
      .get('/foo', terminal('ok'))
      .get('/pass', passthru('passing'))
      .use(passthru('mw3'))
      ;
    app.use(r1.middleware());
    its.call(this, app.listen(), [
      ['get', '/', 404],
      ['get', '/prefix', 200, ['A', 'mw0', 'mw1', 'ok']],
      ['get', '/prefix/foo', 200, ['A', 'mw0', 'mw1', 'mw2', 'ok']],
      ['get', '/prefix/pass', 404, ['A', 'mw0', 'mw1', 'mw2', 'passing', 'mw3', 'Z']],
    ]);
  })

  describe('#use works with multiple mw', () => {
    const app = makeApp();
    const r1 = new Router();
    r1
      .use(passthru('mw1'), passthru('mw2'))
      .get('/', terminal('ok'))
      ;

    app.use(r1.middleware());
    its.call(this, app.listen(), [
      ['get', '/', 200, ['A', 'mw1', 'mw2', 'ok']],
    ]);
  })

  describe('nested router mw', () => {
    const app = makeApp();
    const r1 = new Router();
    r1
      .use(passthru('mw1'), passthru('mw2'))
      .get('/', terminal('ok'))
      ;

    const r2 = new Router();
    r2
      .prefix('/prefix')
      .use(r1.middleware());

    app.use(r2.middleware());
    its.call(this, app.listen(), [
      ['get', '/prefix', 200, ['A', 'mw1', 'mw2', 'ok']],
    ]);
  })
});

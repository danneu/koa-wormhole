'use strict';

// 3rd
const request = require('supertest');
const koa = require('koa');
const assert = require('chai').assert;
const async = require('async');
const bouncer = require('koa-bouncer');
const bodyParser = require('koa-bodyparser');
// 1st
const Router = require('../src/index.js');

function makeApp() {
  const app = koa();
  app.use(function*(next) {
    try {
      yield* next;
    } catch(err) {
      console.error(err.stack);
      throw err;
    }
  });
  return app;
}

describe('koa-bouncer middleware', () => {
  describe('this.validateQuery', () => {
    it('works', done => {
      const app = koa();
      const router = new Router();
      router.use(bouncer.middleware());
      router.get('/search', function*() {
        this.validateQuery('q');
        assert.isDefined(this.vals);
        this.body = this.vals;
      });
      app.use(router.middleware());

      request(app.listen())
        .get('/search?q=foo')
        .expect(200)
        .expect({ q: 'foo' })
        .end(done);
    });
  });

  describe('this.validateParam', () => {
    it('works', done => {
      const app = koa();
      const router = new Router();
      router.use(bouncer.middleware());
      router.get('/users/:id', function*() {
        this.validateParam('id').toInt();
        assert.isDefined(this.vals);
        this.body = this.vals;
      });
      app.use(router.middleware());

      request(app.listen())
        .get('/users/42')
        .expect(200)
        .expect({ id: 42 })
        .end(done);
    });
  });

  describe('this.validateBody', () => {
    it('works', done => {
      const app = makeApp();
      const router = new Router();
      router.use(bodyParser());
      router.use(bouncer.middleware());
      router.post('/users', function*() {
        this.validateBody('uname');
        this.validateBody('password');
        assert.isDefined(this.vals);
        this.body = this.vals;
      });
      app.use(router.middleware());

      request(app.listen())
        .post('/users')
        .send({ uname: 'foo', password: 'secret' })
        .expect(200)
        .expect({ uname: 'foo', password: 'secret' })
        .end(done);
    });
  });

  it('only affects the router it is applied to', done => {
    const app = koa();
    const subRouter = new Router();
    const topRouter = new Router();

    subRouter.use(bouncer.middleware());
    subRouter.get('/search', function*() {
      this.validateQuery('q');
      this.body = this.vals;
    });

    topRouter.get('/top-level', function*() {
      assert.isUndefined(this.vals);
      this.body = this.vals;
    });

    app.use(subRouter.middleware());
    app.use(topRouter.middleware());

    const server = app.listen();
    const tasks = [
      // top-level router unaffected
      cb => {
        request(app.listen())
          .get('/top-level')
          .expect('')
          .end(cb);
      },
      // subRouter affected
      cb => {
        request(app.listen())
          .get('/search')
          .expect({})
          .end(cb);
      },
      cb => {
        request(app.listen())
          .get('/search?q=foo')
          .expect({ q: 'foo' })
          .end(cb);
      }
    ];

    async.parallel(tasks, done);
  });
});

describe('this.vals', () => {
  it('persists to downstream middleware', done => {
    const app = koa();
    const router = new Router();
    router.use(bouncer.middleware());
    router.get('/search', function*(next) {
      this.validateQuery('q');
      yield* next;
    });
    router.use(function*() {
      assert.isDefined(this.vals);
      this.body = this.vals;
    });
    app.use(router.middleware());

    request(app.listen())
      .get('/search?q=foo')
      .expect(200)
      .expect({ q: 'foo' })
      .end(done);
  });

  it('persists to nested route middleware', done => {
    const app = koa();
    const r1 = new Router(), r2 = new Router();
    r1.use(bouncer.middleware());
    r1.get('/search', function*(next) {
      this.validateQuery('q');
      yield* next;
    });
    r2.use(function*(next) { yield* next; });
    r2.get('/search', function*() {
      this.body = this.vals;
    });
    r1.use(r2.middleware());
    app.use(r1.middleware());

    request(app.listen())
      .get('/search?q=foo')
      .expect(200)
      .expect({ q: 'foo' })
      .end(done);
  });
});

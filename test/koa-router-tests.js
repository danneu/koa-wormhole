'use strict';

// 3rd
const request = require('supertest');
const koa = require('koa');
const assert = require('chai').assert;
const _ = require('lodash');
// 1st
const Router = require('../src/index.js');

//
// a growing subset of koa-router's tests
//

describe('Router', () => {
  it('creates new router with koa app', done => {
    const r1 = new Router();
    assert.instanceOf(r1, Router);
    done();
  });

  it('matches middleware only if route was matched', done => {
    const app = koa();
    const r1 = new Router(), r2 = new Router();
    r1.use(function*(next) {
      this.body = 'r1';
      yield* next;
    });
    r2.get('/test', function*() {
      this.body = this.body || 'r2';
    });
    app.use(r1.middleware());
    app.use(r2.middleware());

    request(app.listen())
      .get('/test')
      .expect(200)
      .expect('r2')
      .end(done);
  });

  // TODO: once implemented, use .all() like koa-router does
  it('matches first to last', done => {
    const app = koa();
    const r1 = new Router();
    r1
      .get('/test', function*() { this.body = '1st'; })
      .get('/test', function*() { this.body = '2nd'; })
      .get('/test', function*() { this.body = '3rd'; });
    app.use(r1.middleware());

    request(app.listen())
      .get('/test')
      .expect(200)
      .expect('1st')
      .end(done);
  });

  it('does not run subsequent middleware without yield next', done => {
    const app = koa();
    const r1 = new Router();
    const noopware = function*() { /* no yield */};
    r1.get('/test', noopware, function*() { this.body = 'should not reach'; });
    app.use(r1.middleware());

    request(app.listen())
      .get('/test')
      .expect(404)
      .end(done);
  });

  it('runs subrouter middleware after parent', done => {
    const app = koa();
    const r1 = new Router(), r2 = new Router();
    r2
      .use(function*(next) {
        this.msg = 'r2';
        yield* next;
      })
      .get('/', function*() {
        this.body = this.msg;
      });
    r1
      .use(function*(next) {
        this.msg = 'r1';
        yield* next;
      })
      .use(r2.middleware());

    app.use(r1.middleware());

    request(app.listen())
      .get('/')
      .expect(200)
      .expect('r2')
      .end(done);
  });

  it('runs parent middleware for subrouter routes', done => {
    const app = koa();
    const r1 = new Router(), r2 = new Router();
    r2.get('/', function*() {
      this.body = this.msg;
    });
    r1
      .use(function*(next) {
        this.msg = 'r1';
        yield* next;
      })
      .use(r2.middleware());

    app.use(r1.middleware());

    request(app.listen())
      .get('/')
      .expect(200)
      .expect('r1')
      .end(done);
  });

  it('matches corresponding requests', done => {
    const app = koa();
    const r1 = new Router();
    r1.get('/:category/:title', function*() {
      assert.property(this, 'params');
      assert.propertyVal(this.params, 'category', 'programming');
      assert.propertyVal(this.params, 'title', 'how-to-node');
      this.status = 204;
    });
    r1.post('/:category', function*() {
      assert.property(this, 'params');
      assert.propertyVal(this.params, 'category', 'programming');
      this.status = 204;
    });
    r1.put('/:category/not-a-title', function*() {
      assert.property(this, 'params');
      assert.propertyVal(this.params, 'category', 'programming');
      assert.notProperty(this.params, 'title');
      this.status = 204;
    });
    app.use(r1.middleware());

    const server = app.listen();
    request(server)
      .get('/programming/how-to-node')
      .expect(204)
      .end(err => {
        if (err) return done(err);
        request(server)
          .post('/programming')
          .expect(204)
          .end(err => {
            if (err) return done(err);
            request(server)
              .put('/programming/not-a-title')
              .expect(204)
              .end(done);
          });
      });
  });

  it('executes route middleware using `app.context`', done => {
    const app = koa();
    const r1 = new Router();
    r1.use(function* (next) {
      this.bar = 'baz';
      yield* next;
    });
    r1.get('/:category/:title', function*(next) {
      this.foo = 'bar';
      yield* next;
    }, function*() {
      assert.propertyVal(this, 'bar', 'baz');
      assert.propertyVal(this, 'foo', 'bar');
      assert.property(this, 'app');
      assert.property(this, 'req');
      assert.property(this, 'res');
      this.status = 204;
    });
    app.use(r1.middleware());

    request(app.listen())
      .get('/match/this')
      .expect(204)
      .end(done);
  });

  it('does not match after ctx.throw()', done => {
    const app = koa();
    let counter = 0;
    const r1 = new Router();
    r1.get('/', function*() {
      counter++;
      this.throw(403);
    });
    r1.get('/', function*() {
      counter++;
    });
    app.use(r1.middleware());

    request(app.listen())
      .get('/')
      .expect(403)
      .end(err => {
        if (err) return done(err);
        assert.equal(counter, 1);
        done();
      });
  });
});

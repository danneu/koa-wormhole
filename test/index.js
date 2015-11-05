'use strict';

// 3rd
const request = require('supertest');
const koa = require('koa');
const assert = require('chai').assert;
const _ = require('lodash');
const async = require('async');
const methods = require('methods'); // note: lowercased
// 1st
const Router = require('../src/index.js');

function makeApp() {
  const app = koa();
  app.use(function*(next) {
    try {
      yield* next;
    } catch(err) {
      console.error(err, err.stack);
    }
  });
  app.use(function* manageArr(next) {
    this.arr = ['A'];

    yield* next;

    // If still 404, then add 'Z' to represent not-found
    if (this.status === 404) {
      assert.instanceOf(this.arr, Array);
      this.arr.push('Z');
      this.status = 404;  // preserve 404 since sitting body turns it into 200
      this.body = this.arr;
    }
  });
  return app;
}

// middleware that pushes `msg` onto this.arr and then yield next;
function passthru(msg) {
  return function*(next) {
    if (_.isUndefined(this.arr)) {
      this.arr = [];
    } else {
      this.arr.push(msg);
    }
    yield* next;
  };
}

// middleware that pushes `msg` onto this.arr but results in response
function terminal(msg) {
  return function*() {
    assert.instanceOf(this.arr, Array);
    this.arr.push(msg);
    this.body = this.arr;
  };
}

describe('router middleware', () => {
  it('plays when a route is matched in the router', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.use(passthru('B'));
    r1.get('/', terminal('C'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/')
      .expect(200)
      .expect(['A', 'B', 'C'])
      .end(done);
  });

  it('does not play when a route is NOT matched in the router', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.use(passthru('B'));
    r1.get('/', terminal('C'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/not-found')
      .expect(404)
      .expect(['A', 'Z'])
      .end(done);
  });
});

describe('router matches but handler yields next', () => {
  it('still plays the router mw stack', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.use(passthru('B'));
    r1.get('/', passthru('C'));
    r1.use(passthru('D'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/')
      .expect(404)
      .expect(['A','B','C','D','Z'])
      .end(done);
  });


  it('request handled by next route that does not yield next', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.use(passthru('B'));
    r1.get('/', passthru('C'));
    r1.use(passthru('D'));
    r1.get('/', terminal('E'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/')
      .expect(200)
      .expect(['A', 'B', 'C', 'D', 'E'])
      .end(done);
  });
});

describe('passing multiple mw into a route handler', () => {
  it('works', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.use(passthru('B'));
    r1.get('/', passthru('C'), terminal('D'));
    r1.use(passthru('E'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/')
      .expect(200)
      .expect(['A','B','C','D'])
      .end(done);
  });

  it('still plays router mw stack even if the handler yields next out of router', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.use(passthru('B'));
    r1.get('/', passthru('C'), passthru('D'));
    r1.use(passthru('E'));
    r1.get('/', terminal('F'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/')
      .expect(200)
      .expect(['A','B','C','D','E','F'])
      .end(done);
  });
});

describe('multiple routers', () => {
  it('only first match router runs even if both routers have a match', done => {
    const app = makeApp();
    const r1 = new Router();
    // r1
    r1.use(passthru('r1:A'));
    r1.get('/', passthru('r1:B'), terminal('r1:C'));
    app.use(r1.middleware());
    //r2
    const r2 = new Router();
    r2.use(passthru('r2:A'));
    r2.get('/', passthru('r2:B'), terminal('r2:C'));
    app.use(r2.middleware());

    request(app.listen())
      .get('/')
      .expect(200)
      .expect(['A','r1:A','r1:B','r1:C'])
      .end(done);
  });

  it('both routers run if they both have match and first router handler yields', done => {
    const app = makeApp();
    const r1 = new Router();
    // r1
    r1.use(passthru('r1:A'));
    r1.get('/', passthru('r1:B'), passthru('r1:C'));
    app.use(r1.middleware());
    //r2
    const r2 = new Router();
    r2.use(passthru('r2:A'));
    r2.get('/', passthru('r2:B'), terminal('r2:C'));
    app.use(r2.middleware());

    request(app.listen())
      .get('/')
      .expect(200)
      .expect(['A','r1:A','r1:B','r1:C','r2:A','r2:B','r2:C'])
      .end(done);
  });

  it('neither router runs if neither have a match', done => {
    const app = makeApp();
    const r1 = new Router();
    // r1
    r1.use(passthru('r1:A'));
    r1.get('/', passthru('r1:B'), passthru('r1:C'));
    app.use(r1.middleware());
    //r2
    const r2 = new Router();
    r2.use(passthru('r2:A'));
    r2.get('/', passthru('r2:B'), terminal('r2:C'));
    app.use(r2.middleware());

    request(app.listen())
      .get('/not-found')
      .expect(404)
      .expect(['A', 'Z'])
      //.expect('42')
      .end(done);
  });
});

describe('chaining router methods', () => {
  it('works with http verbs', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.get('/foo', terminal('foo')).get('/bar', terminal('bar'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/foo').expect(200).expect(['A','foo'])
      .end(function(err) {
        if (err) return done(err);
        request(app.listen()).get('/bar').expect(200).expect(['A','bar'])
          .end(done);
      });
  });

  it('works with .use()', done => {
    const app = makeApp();
    const r1 = new Router();
    r1
      .use(passthru('mw1'))
      .use(passthru('mw2'));
    r1.get('/test', terminal('ok'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/test').expect(200).expect(['A', 'mw1', 'mw2', 'ok'])
      .end(done);
  });

  it('works with .use() and verb interleaved', done => {
    const app = makeApp();
    const r1 = new Router();
    r1
      .use(passthru('mw1'))
      .get('/test', passthru('handler1'))
      .use(passthru('mw2'))
      .get('/test', terminal('handler2'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/test')
      .expect(200)
      .expect(['A', 'mw1', 'handler1', 'mw2', 'handler2'])
      .end(done);
  });
});

describe('http methods', () => {
  methods.forEach(method => {
    // TODO: test these / do something about these
    if (_.contains(['head', 'status', 'connect'], method)) return;
    it(`supports ${method}`, done => {
      const app = makeApp();
      const r1 = new Router();
      r1[method]('/', terminal('ok'));
      app.use(r1.middleware());

      request(app.listen())[method]('/')
        .expect(200)
        .expect(['A','ok'])
        .end(done);
    });
  });
});

describe('url params', () => {
  it('ctx.params is empty object {} if no params', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.get('/a/b/c', function*() {
      this.body = this.params;
    });
    app.use(r1.middleware());

    request(app.listen()).get('/a/b/c')
      .expect(200)
      .expect({})
      .end(done);
  });

  it('parses :named params', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.get('/users/:uname/comments/:id', function*() {
      this.body = this.params;
    });
    app.use(r1.middleware());

    request(app.listen()).get('/users/foo/comments/42')
      .expect(200)
      .expect({ uname: 'foo', id: '42' })
      .end(done);
  });

  it('any mw in route with matched handler can access the ctx.params', done => {
    const app = makeApp();
    const r1 = new Router();
    const mw1 = function*(next) {
      assert.deepEqual(this.params, { uname: 'foo', id: '42' });
      yield* next;
    };
    const mw2 = function*(next) {
      assert.deepEqual(this.params, { uname: 'foo', id: '42' });
      yield* next;
    };
    r1.get('/users/:uname/comments/:id', mw1, mw2, function*() {
      this.body = this.params;
    });
    app.use(r1.middleware());

    request(app.listen()).get('/users/foo/comments/42')
      .expect(200)
      .expect({ uname: 'foo', id: '42' })
      .end(done);
  });
});

describe('Router#use', () => {
  it('can handle multiple mw arguments', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.use(passthru('mw1'), passthru('mw2'));
    r1.get('/test', terminal('handled'));
    app.use(r1.middleware());

    request(app.listen()).get('/test')
      .expect(200)
      .expect(['A', 'mw1', 'mw2', 'handled'])
      .end(done);
  });
});

describe('query params', () => {
  it('does not touch them', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.get('/test', function*() {
      this.body = this.query;
    });
    app.use(r1.middleware());

    request(app.listen()).get('/test?foo[]=A&foo[]=B&foo[]=C')
      .expect(200)
      .expect({ 'foo[]': ['A', 'B', 'C'] })
      .end(done);
  });
});

// use(someRouter.middleware());
// use(randomMw);
// use(randomMw, someRouter.middleware(), moreRandomMw)
describe('router nesting', () => {
  it('works when only argument to .use is some router.middleware', done => {
    const app = makeApp(), r1 = new Router(), r2 = new Router();
    r2.get('/nested', function*() { this.body = 'ok from nested router'; });
    r1.use(r2.middleware());
    app.use(r1.middleware());

    request(app.listen()).get('/nested')
      .expect(200)
      .expect('ok from nested router')
      .end(done);
  });

  it('works with deep nesting (3-levels)', done => {
    const app = makeApp();
    const r1 = new Router();
    const r2 = new Router();
    const r3 = new Router();
    const r4 = new Router();
    r4.get('/r4', function*() { this.body = 'ok'; });
    r3.use(r4.middleware());
    r2.use(r3.middleware());
    r1.use(r2.middleware());
    app.use(r1.middleware());

    request(app.listen()).get('/r4')
      .expect(200)
      .expect('ok')
      .end(done);
  });

  describe('r1.use(m1, m2, r2.middleware())', () => {
    it('r2 route can yield to r1 route where r1 route is added second', done => {
      const app = makeApp(), r1 = new Router(), r2 = new Router();
      r2.get('/test', passthru('r2'));
      r1.use(passthru('mw1'), passthru('mw2'), r2.middleware());
      r1.get('/test', terminal('r1'));
      app.use(r1.middleware());

      request(app.listen()).get('/test')
        .expect(200)
        .expect(['A', 'mw1', 'mw2', 'r2', 'r1'])
        .end(done);
    });

    it('r1 route can yield to r2 route where r1 route is added first', done => {
      const app = makeApp(), r1 = new Router(), r2 = new Router();
      r2.get('/test', terminal('r2'));
      r1.get('/test', passthru('r1')); 
      r1.use(passthru('mw1'), passthru('mw2'), r2.middleware());
      app.use(r1.middleware());

      request(app.listen()).get('/test')
        .expect(200)
        .expect(['A', 'r1', 'mw1', 'mw2', 'r2'])
        .end(done);
    });

    // TODO now test variations where nothing should match

    it('applies mw1 and mw2 before nested router route', done => {
      const app = makeApp(), r1 = new Router(), r2 = new Router();
      r2.get('/nested', function*() {
        this.arr.push('r2');
        this.body = this.arr;
      });
      r1.use(passthru('mw1'), passthru('mw2'), r2.middleware());
      app.use(r1.middleware());

      request(app.listen()).get('/nested')
        .expect(200)
        .expect(['A', 'mw1', 'mw2', 'r2'])
        .end(done);
    });
  });
});

describe('multiple routes that match the same request', () => {
  it('[same router] only runs the first one (if it does not yield next)', done => {
    const app = makeApp(), r1 = new Router();
    let counter = 0;
    r1.get('/test', function*() {
      counter = counter + 1;
      this.body = 'first';
    });
    r1.get('/test', function*() {
      counter = counter + 1;
      this.body = 'second';
    });
    app.use(r1.middleware());

    request(app.listen()).get('/test')
      .expect(200)
      .expect('first')
      .end(err => {
        if (err) return done(err);
        assert.equal(counter, 1);
        done();
      });
  });

  it('[different routers] only runs the first one (if it does not yield next)', done => {
    const app = makeApp(), r1 = new Router(), r2 = new Router();
    let counter = 0;
    r1.get('/test', function*() {
      counter = counter + 1;
      this.body = 'first';
    });
    r2.get('/test', function*() {
      counter = counter + 1;
      this.body = 'second';
    });
    app.use(r1.middleware());
    app.use(r2.middleware());

    request(app.listen()).get('/test')
      .expect(200)
      .expect('first')
      .end(err => {
        if (err) return done(err);
        assert.equal(counter, 1);
        done();
      });
  });

  it('[same router] runs both if first one yields next', done => {
    const app = makeApp(), r1 = new Router();
    let counter = 0;
    r1.get('/test', function*(next) {
      counter = counter + 1;
      yield* next;
    });
    r1.get('/test', function*() {
      counter = counter + 1;
      this.body = 'second';
    });
    app.use(r1.middleware());

    request(app.listen()).get('/test')
      .expect(200)
      .expect('second')
      .end(err => {
        if (err) return done(err);
        assert.equal(counter, 2);
        done();
      });
  });

  it('[different routers] runs both if first one yields next', done => {
    const app = makeApp(), r1 = new Router(), r2 = new Router();
    let counter = 0;
    r1.get('/test', function*(next) {
      counter = counter + 1;
      yield* next;
    });
    r2.get('/test', function*() {
      counter = counter + 1;
      this.body = 'second';
    });
    app.use(r1.middleware());
    app.use(r2.middleware());

    request(app.listen()).get('/test')
      .expect(200)
      .expect('second')
      .end(err => {
        if (err) return done(err);
        assert.equal(counter, 2);
        done();
      });
  });
});

describe('instantiation', () => {
  it('works without the `new` keyword', done => {
    const app = makeApp();
    const r1 = Router();
    r1.get('/test', terminal('/test'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/test')
      .expect(200)
      .expect(['A', '/test'])
      .end(done);
  });
});

describe('Router#all', () => {
  it('responds to all http verbs', done => {
    const app = makeApp();
    const r1 = Router();
    r1.all('/test', function*() { this.body = 'ok'; });
    app.use(r1.middleware());

    const server = app.listen();
    const tasks = ['get', 'post', 'put', 'delete'].map(verb => {
      return function(cb) {
        request(server)[verb]('/test')
          .expect(200)
          .expect('ok')
          .end(cb);
      };
    });

    async.parallel(tasks, done);
  });
});

describe('Router#register', () => {
  it('works with general one-verb, one-handler use-case', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.register('/test', ['get'], [function*() {
      this.body = 'ok';
    }]);
    app.use(r1.middleware());

    request(app.listen())
      .get('/test')
      .expect(200)
      .expect('ok')
      .end(done);
  });

  it('still works if you forget verb case', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.register('/test', ['GET'], [function*() {
      this.body = 'ok';
    }]);
    app.use(r1.middleware());

    request(app.listen())
      .get('/test')
      .expect(200)
      .expect('ok')
      .end(done);
  });

  it('can assign one handler to multiple verbs', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.register('/test', ['get', 'post', 'put', 'delete'], [function*() {
      this.body = 'ok';
    }]);
    app.use(r1.middleware());

    const server = app.listen();
    const tasks = ['get', 'post', 'put', 'delete'].map(verb => {
      return function(cb) {
        request(server)[verb]('/test')
          .expect(200)
          .expect('ok')
          .end(cb);
      };
    });

    async.parallel(tasks, done);
  });

  it('can assign multiple middleware to a route with one verb', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.register('/test', ['get'], [
      passthru('mw1'),
      passthru('mw2'),
      terminal('handler')
    ]);
    app.use(r1.middleware());

    request(app.listen())
      .get('/test')
      .expect(200)
      .expect(['A', 'mw1', 'mw2', 'handler'])
      .end(done);
  });

  it('can assign multiple middleware to a route with multiple verbs', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.register('/test', ['get', 'post', 'put', 'delete'], [
      passthru('mw1'),
      passthru('mw2'),
      terminal('handler')
    ]);
    app.use(r1.middleware());

    const server = app.listen();
    const tasks = ['get', 'post', 'put', 'delete'].map(verb => {
      return function(cb) {
        request(server)[verb]('/test')
          .expect(200)
          .expect(['A', 'mw1', 'mw2', 'handler'])
          .end(cb);
      };
    });

    async.parallel(tasks, done);
  });
});

describe('Router#{verb}', () => {
  it('works with one mw', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.get('/', terminal('handler'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/')
      .expect(200)
      .expect(['A', 'handler'])
      .end(done);
  });

  it('works with multiple mw passed in spread-style', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.get('/', passthru('mw1'), passthru('mw2'), terminal('handler'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/')
      .expect(200)
      .expect(['A', 'mw1', 'mw2', 'handler'])
      .end(done);
  });

  it('works with multiple mw passed in together as an array', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.get('/', [passthru('mw1'), passthru('mw2'), terminal('handler')]);
    app.use(r1.middleware());

    request(app.listen())
      .get('/')
      .expect(200)
      .expect(['A', 'mw1', 'mw2', 'handler'])
      .end(done);
  });

  it('works with multiple mw passed in as arrays and as spread (at the same time)', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.get('/', [passthru('mw1'), passthru('mw2')], passthru('mw3'), [passthru('mw4')], terminal('handler'));
    app.use(r1.middleware());

    request(app.listen())
      .get('/')
      .expect(200)
      .expect(['A', 'mw1', 'mw2', 'mw3', 'mw4', 'handler'])
      .end(done);
  });

});

describe('default behavior:', () => {
  it('case-insensitive path matching', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.get('/Foo', terminal('handler'));
    app.use(r1.middleware());

    const server = app.listen();
    async.parallel([
      cb => request(server).get('/foo').expect(200).end(cb),
      cb => request(server).get('/FOO').expect(200).end(cb),
      cb => request(server).get('/Foo').expect(200).end(cb),
      cb => request(server).get('/sanity-check').expect(404).end(cb)
    ], done);
  });

  it('trailing slash is optional', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.get('/foo', terminal('handler'));
    app.use(r1.middleware());

    const server = app.listen();
    async.parallel([
      cb => request(server).get('/foo').expect(200).end(cb),
      cb => request(server).get('/foo/').expect(200).end(cb),
      cb => request(server).get('/sanity-check').expect(404).end(cb)
    ], done);
  });

  it('path must match start to finish', done => {
    const app = makeApp();
    const r1 = new Router();
    r1.get('/foo', terminal('handler'));
    app.use(r1.middleware());

    const server = app.listen();
    async.parallel([
      cb => request(server).get('/foo').expect(200).end(cb),
      cb => request(server).get('/foo/bar').expect(404).end(cb),
      cb => request(server).get('/sanity-check').expect(404).end(cb)
    ], done);
  });
});

describe('behavior override:', () => {
  it('allows case-sensitive path matching', done => {
    const app = makeApp();
    const r1 = new Router({ sensitive: true });
    r1.get('/Foo', terminal('handler'));
    app.use(r1.middleware());

    const server = app.listen();
    async.parallel([
      cb => request(server).get('/foo').expect(404).end(cb),
      cb => request(server).get('/FOO').expect(404).end(cb),
      cb => request(server).get('/Foo').expect(200).end(cb),
      cb => request(server).get('/sanity-check').expect(404).end(cb)
    ], done);
  });

  it('allows trailing-slash strictness', done => {
    const app = makeApp();
    const r1 = new Router({ strict: true });
    r1.get('/foo', terminal('handler'));
    r1.get('/bar/', terminal('handler'));
    app.use(r1.middleware());

    const server = app.listen();
    async.parallel([
      cb => request(server).get('/foo').expect(200).end(cb),
      cb => request(server).get('/foo/').expect(404).end(cb),
      cb => request(server).get('/bar').expect(404).end(cb),
      cb => request(server).get('/bar/').expect(200).end(cb),
      cb => request(server).get('/sanity-check').expect(404).end(cb)
    ], done);
  });

  it('allow partial path match from start', done => {
    const app = makeApp();
    const r1 = new Router({ end: false });
    r1.get('/foo', terminal('handler'));
    app.use(r1.middleware());

    const server = app.listen();
    async.parallel([
      cb => request(server).get('/foo').expect(200).end(cb),
      cb => request(server).get('/foo/').expect(200).end(cb),
      cb => request(server).get('/foo/bar').expect(200).end(cb),
      cb => request(server).get('/foo/bar/').expect(200).end(cb),
      cb => request(server).get('/sanity-check').expect(404).end(cb)
    ], done);
  });
});

describe('when parent yields to child router matching same request,', () => {
  describe('child router', () => {
    it('gets same this.params as parent', done => {
      const app = makeApp();
      const parentRouter = new Router(), childRouter = new Router();
      parentRouter.get('/users/:uname/comments/:id', function*(next) {
        assert.deepEqual(this.params, { uname: 'foo', id: '42' });
        yield* next;
      });
      childRouter.get('/users/:uname/comments/:id', function*() {
        assert.deepEqual(this.params, { uname: 'foo', id: '42' });
        this.body = 'ok';
      });
      parentRouter.use(childRouter.middleware());
      app.use(parentRouter.middleware());

      request(app.listen())
        .get('/users/foo/comments/42')
        .expect('ok')
        .end(done);
    });

    // TODO: consider opts.mergeParams like express has
    it('[default] does not see manipulated this.params values', done => {
      const app = makeApp();
      const parentRouter = new Router();
      const childRouter = new Router({ mergeParams: true });
      parentRouter.get('/users/:uname/comments/:id', function*(next) {
        assert.deepEqual(this.params, { uname: 'foo', id: '42' });
        this.params.uname = 'bar';
        this.params.id = '69';
        this.params.extra = ':)';
        yield* next;
      });
      childRouter.get('/users/:uname/comments/:id', function*() {
        assert.deepEqual(this.params, { uname: 'foo', id: '42' });
        this.body = 'ok';
      });
      parentRouter.use(childRouter.middleware());
      app.use(parentRouter.middleware());

      request(app.listen())
        .get('/users/foo/comments/42')
        .expect('ok')
        .end(done);
    });
  });
});

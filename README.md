
# koa-wormhole

[![Build Status](https://travis-ci.org/danneu/koa-wormhole.svg?branch=master)](https://travis-ci.org/danneu/koa-wormhole)
[![NPM version](https://badge.fury.io/js/koa-wormhole.svg)](http://badge.fury.io/js/koa-wormhole)
[![Dependency Status](https://david-dm.org/danneu/koa-wormhole.svg)](https://david-dm.org/danneu/koa-wormhole)

A simple, predictable, low-performance router for
[Koa](http://koajs.com/) similar to koa-router and Express 4's built-in router.

    npm install --save koa-wormhole

## Quickstart

``` javascript
const Router = require('koa-wormhole');

const router1 = new Router();
router1.use(function*(next) { console.log('inside router1'); yield* next; });
router1.get('/', ...);

const router2 = new Router();
router2.get('/users', ...);
router2.post('/users', ...);
router.get('/users/:username', ...);

app.use(router1.middleware());
app.use(router2.middleware());
app.listen(3000, () => console.log('listening on 3000'));
```

Router middleware (middleware mounted via `router.use(...)`) are only run
if the request matches any of the router's routes. Else, the router is
skipped.

## Usage

You can find a lot of examples in koa-wormhole's tests:
https://github.com/danneu/koa-wormhole/blob/master/test/index.js

### Basics

Just like a koa instance, a router instance has `router.use(...middleware)`
that takes one or more middleware generator functions.

``` javascript
const mw1 = function*(next) {
  console.log('executing mw1');
  yield* next;
};

const mw2 = function*(next) {
  console.log('executing mw2');
  yield* next;
};

router.use(mw1, mw2);

app.use(router.middleware());
```

However, a router's top-level middleware will not run unless the request
matches one of the router's routes.

Let's define a route for the above example.

``` javascript
router.use(mw1, mw2);

router.get('/test', function*() {
  console.log('executing GET /test');
  this.body = 'hello world';
});

app.use(router.middleware());
```

Since the two middleware were mounted before the route, they will run 
before the route:

```
$ curl http://localhost:3000/test
// executing mw1
// executing mw2
// executing GET /foo
//=> 'hello world'
```

And, unlike in koa-router, mount order matters in koa-wormhole. 

If we mount the route before the middleware, then the middleware will not
get to execute unless the route `yield* next`. 

This is just predictable middleware behavior.

``` javascript
router.get('/test', function*() {
  console.log('executing GET /test');
  this.body = 'hello world';
});

router.use(mw1, mw2);

app.use(router.middleware());
```

```
$ curl http://localhost:3000/test
// executing GET /foo
//=> 'hello world'
```

And here's an example of what that behavior looks like when we yield next
from a route handler. The request will continue down the stack, possibly
matching downstream handlers.

``` javascript
router.get('/test', function*(next) {
  console.log('executing handler1 and yielding next');
  yield* next;
});

router.get('/test', function*(next) {
  console.log('executing handler2 and responding');
  this.body = 'ok';
});

app.use(router.middleware());
```

```
$ curl http://localhost:3000/test
// executing handler1 and yielding next
// executing handler2 and responding
//=> 'ok'
```

You can also mount middleware to a specific route to be run before the
handler:

``` javascript
router.get('/test', mw1, mw2, function*() {
  console.log('executing handler');
  this.body = 'ok';
});
```

```
$ curl http://localhost:3000/test
// executing mw1
// executing mw2
// executing handler
//=> 'ok'
```

And it handles flattens out arrays. These are all the same:

``` javascript
router.get('/test', mw1, mw2, mw3, mw4, mw5);
router.get('/test', [mw1, mw2, mw3, mw4], mw5);
router.get('/test', mw1, [mw2], mw3, [mw4, mw5]);
router.get('/test', [mw1, mw2, mw3, mw4, mw5]);
```

### URL params

koa-wormhole uses [path-to-regexp][path-to-regexp] to turn route paths
into regular expressions, so it has the same syntax as Express4's router
and koa-router.

Read its docs for more examples.

[path-to-regexp]: https://github.com/pillarjs/path-to-regexp

``` javascript
router.get('/users/:id', function*() {
  const user = yield database.findUserById(this.params.id);
  this.assert(user, 404);

  yield this.render('show_user.html', {
    ctx: this,
    user: user
  });
});
```

### Method chaining

`Router#use` and all of the `Router#{verb}`s return the router instance,
so you can chain them if you'd like.

``` javascript
router
  .get('/users', listUsers)
  .get('/users/:id', showUser)
  .use(ensureAdmin)  // <-- only applies to downstream routes
  .del('/users/:id', deleteUser);
  .get('/users/:id/admin-panel', administrateUser);

app.use(router.middleware());
```

### Nested Routers

3-layers deep:

``` javascript
const app = koa();
const r1 = new Router(), r2 = new Router(), r3 = new Router();

r3.get('/', function*(next) {
  this.body = 'hello, world!';
});
r2.use(r3.middleware());
r1.use(r2.middleware());
app.use(r1.middleware());

app.listen(3000, () => console.log('listening on 3000'));
```

```
curl http://localhost:3000
// hello, world!
```

## General idea

I thought it'd be fun to implement a router with
[koa-compose](https://github.com/koajs/compose), composing one long chain
of generator middleware for each router.

Goals:

- Predictable behavior
- Simple implementation

## koa-wormhole vs Express 4's built-in router

- Express 4's routing docs: http://expressjs.com/guide/routing.html

The key difference is that koa-wormhole only pipes a request through a mounted
router if the request actually matches one of the router's routes.

Consider this Express example:

``` javascript
// ------------------------------------------------------------
// router.js
// ------------------------------------------------------------
const router = require('express').Router();

router.use((req, res, next) {
  console.log('inside router middleware');
  next();
});

router.get('/router', (req, res, next) => {
  res.send('inside router route');
});

module.exports = router;

// ------------------------------------------------------------
// server.js
// ------------------------------------------------------------
const app = require('express')();
const router = require('./router');

app.use(router);
app.get('/', (req, res) => {
   res.send('homepage');
});
app.listen(3000, () => console.log('express listening on 3000'));
```

In Express, requests are always piped through routers, so top-level
router middleware will always execute:

```
$ curl http://localhost:3000
// inside router middleware
//=> 'homepage'

$ curl http://localhost:3000/router
// inside router middleware
//=> 'inside router route'
```

Notice that the route's top-level middleware is always run.

Now let's look at the exact same example in koa-wormhole:

``` javascript
// ------------------------------------------------------------
// router.js
// ------------------------------------------------------------
const router = require('koa-wormhole')();

router.use(function*(next) {
  console.log('inside router middleware');
  yield* next;
});

router.get('/router', function*(next) {
  this.body = 'inside route route';
});

module.exports = router;

// ------------------------------------------------------------
// server.js
// ------------------------------------------------------------
const app = require('koa')();
const router = require('./router');

app.use(router.middleware());
app.get('/', function*() {
   this.body = 'homepage';
});
app.listen(3000, () => console.log('koa listening on 3000'));
```

```
$ curl http://localhost:3000
//=> 'homepage'

$ curl http://localhost:3000/router
// inside router middleware
//=> 'inside router route'
```

koa-wormhole skips over the router when requesting the homepage since
the router had no matching route.

Why?

I just find this behavior more useful, and it's what I'm used to
with koa-router.

I initially considered solutions that let you distinguish between
router middleware that always runs and router middleware that only runs
on router match, but I couldn't think of a use-case for that behavior.

## koa-wormhole vs koa-router

koa-router has some undefined behavior and unexpected idiosyncrasies.

One example is that top-level koa-router middleware are always run
before the matched handler. Consider this koa-router example:

``` javascript
router.get('/', function*() {
  console.log('executing router GET / handler');
  this.body = 'ok';
});

router.use(function*(next) {
  console.log('executing router middleware 1');
  yield* next;
});

router.use(function*(next) {
  console.log('executing router middleware 2');
  yield* next;
});

router.use(function*(next) {
  console.log('executing router middleware 3');
  yield* next;
});
```

```
$ curl http://localhost:3000
// executing router middleware 1
// executing router middleware 2
// executing router middleware 3
// executing router GET / handler
//=> 'ok'
```

I find this behavior unexpected and counter-intuitive. I'd expect the 'GET /'
handler to execute first and only call the downstream middleware if
it yields next, which is what koa-wormhole will do.

This may be a bug: https://github.com/alexmingoia/koa-router/issues/194

I tried to improve upon koa-router by following standard middleware
intuition like declaration-order sensitivity.

## License

MIT

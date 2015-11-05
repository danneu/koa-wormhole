
# koa-wormhole

A simple router for [Koa](http://koajs.com/) similar to koa-router.

    npm install --save koa-wormhole

Each router instance is basically a stack of middleware generator functions.

If the request matches a router's route, then the request gets piped 
through the router's middleware stack `compose(this.stack).call(ctx)`.
Else it skips the router entirely.

Routes are simply middleware functions that conditionally execute based
on `ctx.method` and `ctx.path`.

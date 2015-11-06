'use strict';
// 3rd
const request = require('supertest');

// spec: ['get', '/', 200]
//       ['get', '/', 200, { foo: 'bar' }
exports.tests = function(server, specs) {
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

    it(desc, done => test.end(done));
  });
}

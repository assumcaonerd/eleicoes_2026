import assert from "node:assert/strict";
import { scopeResultUrl, tseCargoCode } from "../src/tse/url.js";

// O aplicativo usa 7 para "Deputado Estadual/Distrital"; no DF o TSE publica o cargo como 8.
assert.equal(tseCargoCode(7, "DF"), 8);
assert.equal(tseCargoCode(7, "df"), 8);
assert.equal(tseCargoCode(7, "SP"), 7);
assert.equal(tseCargoCode(6, "DF"), 6);
assert.match(scopeResultUrl({ office: 7, uf: "DF" }), /\/df\/df-c0008-e006259-u\.json$/);
assert.match(scopeResultUrl({ office: 7, uf: "DF", municipalityCode: "97012" }), /\/df\/df97012-c0008-e006259-u\.json$/);
assert.match(scopeResultUrl({ office: 7, uf: "MG" }), /\/mg\/mg-c0007-e006259-u\.json$/);
console.log("test-tse-url ok");

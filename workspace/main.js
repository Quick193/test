"use strict";

function greet(name) {
  return `Hello, ${name}!`;
}

const input = readLine();
console.log(greet(input || 'world'));

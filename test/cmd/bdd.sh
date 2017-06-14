#!/bin/bash

pm2 start test/app/process.json;
node_modules/.bin/cucumber.js test/bdd/features/${BDD_FILE:-*.feature};
pm2 delete test/app/process.json;
true